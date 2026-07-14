import type { AppInstance } from "../http/types.js";
import { settleOverdueTurnIfNeeded, type TurnActionResult } from "./turnActions.js";

// The durable, single-process deadline scheduler -- docs/opus-implementation-
// plan.md §8.1 (Decision D-SCHED). No in-memory setTimeout, no separate
// worker: the deadline lives on `turns.deadline_at`, and this sweep plus the
// on-read catch-up in game/turnActions.ts are the two cooperating
// mechanisms that process it.

const DEFAULT_SWEEP_INTERVAL_MS = 15_000;
const DEFAULT_BATCH_SIZE = 10;
const WARNING_WINDOW_MS = 15 * 60 * 1000;

export type SettledTimeout = { readonly gameId: string; readonly result: TurnActionResult };

/**
 * Finds up to `batchSize` games whose current turn is active and overdue,
 * and settles each one (§8.3). Candidates are found with a plain,
 * non-locking read; each candidate is then settled in its own transaction
 * that takes `FOR UPDATE SKIP LOCKED` on just that game's row. If another
 * transaction already holds that row (a live commit/draw/pass/resign, or a
 * concurrent sweep tick), this pass simply skips it -- a safe no-op, since
 * whatever concurrent transaction holds the lock will itself settle the
 * turn first via the same on-read catch-up before doing anything else.
 * This is why only the `games` row is ever explicitly locked anywhere in
 * this codebase (see settleOverdueTurnIfNeeded's doc comment) -- it keeps
 * lock order consistent everywhere and makes races self-resolving without
 * retries.
 */
export async function runDeadlineSweepOnce(
  app: AppInstance,
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<readonly SettledTimeout[]> {
  const candidates = await app.db
    .selectFrom("turns")
    .innerJoin("games", "games.current_turn_id", "turns.id")
    .select(["games.id as gameId"])
    .where("turns.status", "=", "active")
    .where("turns.deadline_at", "<=", new Date())
    .where("games.status", "=", "active")
    .limit(batchSize)
    .execute();

  const settled: SettledTimeout[] = [];
  for (const { gameId } of candidates) {
    const result = await app.db.transaction().execute(async (trx) => {
      const gameRow = await trx
        .selectFrom("games")
        .selectAll()
        .where("id", "=", gameId)
        .where("status", "=", "active")
        .forUpdate()
        .skipLocked()
        .executeTakeFirst();
      if (!gameRow) return undefined;
      return settleOverdueTurnIfNeeded(trx, gameRow);
    });
    if (result) settled.push({ gameId, result });
  }
  return settled;
}

export type Warned = {
  readonly gameId: string;
  readonly seatIndex: number;
  readonly remainingMs: number;
};

/**
 * Marks the 15-minute warning as sent for every active turn crossing the
 * threshold, exactly once (§8.1 last paragraph). The UPDATE's own WHERE
 * clause (`warned_at IS NULL`) is what makes this race-safe under
 * concurrent sweeps -- Postgres row-level locking during the UPDATE
 * ensures only one transaction's statement can flip a given row from
 * unwarned to warned, so no explicit locking is needed here the way it is
 * for the state-mutating timeout sweep above.
 */
export async function runWarningSweepOnce(
  app: AppInstance,
  batchSize = 20,
): Promise<readonly Warned[]> {
  const now = new Date();
  const threshold = new Date(now.getTime() + WARNING_WINDOW_MS);

  // Postgres UPDATE has no LIMIT clause -- batchSize is applied via the
  // subquery that selects which rows to touch.
  const rows = await app.db
    .updateTable("turns")
    .set({ warned_at: now })
    .where("id", "in", (eb) =>
      eb
        .selectFrom("turns")
        .select("id")
        .where("status", "=", "active")
        .where("warned_at", "is", null)
        .where("deadline_at", ">", now)
        .where("deadline_at", "<=", threshold)
        .limit(batchSize),
    )
    .returningAll()
    .execute();

  return rows.map((row) => ({
    gameId: row.game_id,
    seatIndex: row.seat_index,
    remainingMs: row.deadline_at.getTime() - now.getTime(),
  }));
}

export type SweepHandlers = {
  readonly onTimeout?: (settled: SettledTimeout) => void;
  readonly onWarning?: (warned: Warned) => void;
};

/**
 * Starts the embedded sweep loop (§8.2: one web process, no separate
 * worker). Returns a stop function. Never started by buildApp itself --
 * only index.ts's real server startup calls this -- so test suites that
 * build an app for HTTP/socket testing don't get a stray background
 * interval running underneath them.
 */
export function startBackgroundSweeps(
  app: AppInstance,
  handlers: SweepHandlers = {},
  intervalMs = DEFAULT_SWEEP_INTERVAL_MS,
): () => void {
  const timer = setInterval(() => {
    runDeadlineSweepOnce(app)
      .then((settled) => settled.forEach((s) => handlers.onTimeout?.(s)))
      .catch((err: unknown) => app.log.error(err, "deadline sweep failed"));
    runWarningSweepOnce(app)
      .then((warned) => warned.forEach((w) => handlers.onWarning?.(w)))
      .catch((err: unknown) => app.log.error(err, "warning sweep failed"));
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
