import type { AppInstance } from "../http/types.js";
import { DEFAULT_BOT_TURN_DELAY_MS, isRetentionSweepEnabled } from "../env.js";
import { settleOverdueTurnIfNeeded, type TurnActionResult } from "./turnActions.js";
import { runBotTurn } from "./botTurn.js";
import { runRetentionSweepOnce, type RetentionSweepResult } from "./retentionSweep.js";

// The durable, single-process deadline scheduler -- docs/opus-implementation-
// plan.md §8.1 (Decision D-SCHED). No in-memory setTimeout, no separate
// worker: the deadline lives on `turns.deadline_at`, and this sweep plus the
// on-read catch-up in game/turnActions.ts are the two cooperating
// mechanisms that process it.

const DEFAULT_SWEEP_INTERVAL_MS = 15_000;
const DEFAULT_BATCH_SIZE = 10;
const WARNING_WINDOW_MS = 15 * 60 * 1000;
// Retention is destructive and only ever concerns games already 48 hours
// past completion -- there is no latency requirement anywhere close to the
// 15s deadline/warning/bot-turn cadence above, so it runs on its own,
// much slower interval (restrained per Phase 7's explicit "approximately
// every 5-10 minutes" instruction) rather than sharing DEFAULT_SWEEP_
// INTERVAL_MS. This constant only controls how often the sweep *checks* --
// it has no bearing on the fixed 48-hour window itself (retentionSweep.ts).
const DEFAULT_RETENTION_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

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

export type BotActed = { readonly gameId: string; readonly result: TurnActionResult };

/**
 * The durable computer-opponent recovery sweep (docs plan §7). Finds active
 * games whose current, active turn belongs to a computer seat and is at least
 * `botDelayMs` old, and runs each bot turn via the same idempotent
 * `runBotTurn` path the fast-path timer uses. This is the mechanism that makes
 * the ~1s fast-path timer purely a latency optimization: a process restart
 * after the human moved (before the bot did), a lost timer, or a bot seat that
 * simply started a game all get picked up here within one sweep interval.
 *
 * No `FOR UPDATE SKIP LOCKED` is needed at this level: `runBotTurn` submits
 * through commitTurn/drawTurn/passTurn, which lock the games row and enforce
 * idempotency + version checks, so two concurrent sweeps (or a sweep racing
 * the fast-path) resolve to exactly one applied action with the rest no-ops.
 * The candidate query below is a plain, non-locking read.
 */
export async function runBotTurnSweepOnce(
  app: AppInstance,
  botDelayMs = app.env.BOT_TURN_DELAY_MS ?? DEFAULT_BOT_TURN_DELAY_MS,
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<readonly BotActed[]> {
  const dueBefore = new Date(Date.now() - botDelayMs);
  const candidates = await app.db
    .selectFrom("turns")
    .innerJoin("games", "games.current_turn_id", "turns.id")
    .innerJoin("game_seats", (join) =>
      join
        .onRef("game_seats.game_id", "=", "games.id")
        .onRef("game_seats.seat_index", "=", "games.active_seat"),
    )
    .select(["games.id as gameId"])
    .where("turns.status", "=", "active")
    .where("games.status", "=", "active")
    .where("game_seats.controller_type", "=", "computer")
    .where("turns.started_at", "<=", dueBefore)
    .limit(batchSize)
    .execute();

  const acted: BotActed[] = [];
  for (const { gameId } of candidates) {
    const outcome = await runBotTurn(app, gameId, "recovered");
    if (outcome.kind === "acted") acted.push({ gameId, result: outcome.result });
  }
  return acted;
}

export type SweepHandlers = {
  readonly onTimeout?: (settled: SettledTimeout) => void;
  readonly onWarning?: (warned: Warned) => void;
  readonly onBotActed?: (acted: BotActed) => void;
  /** Fires after each retention pass, including an empty one (Phase 7).
   * There is nothing to broadcast over a socket here (a purged game's
   * viewer already gets a graceful "not found" the next time they touch
   * it -- see TabletopPage.tsx/useGame.ts), so index.ts's only use for
   * this is logging aggregate counts. */
  readonly onRetentionSwept?: (result: RetentionSweepResult) => void;
};

/**
 * Starts the embedded sweep loop (§8.2: one web process, no separate
 * worker). Returns a stop function that clears every timer this call
 * started. Never started by buildApp itself -- only index.ts's real server
 * startup calls this -- so test suites that build an app for HTTP/socket
 * testing don't get a stray background interval running underneath them.
 *
 * The retention timer (Phase 7) is a SEPARATE interval from the other
 * three, at its own slower cadence, and is only created at all when
 * `ENABLE_RETENTION_SWEEP` is set -- ship OFF, verify in staging, then
 * enable (docs/deploy-render.md). A disabled flag means no timer is ever
 * created, not merely a no-op tick: this is what "no retention timer runs
 * while it is false" means concretely, and it is what keeps calling this
 * function repeatedly (e.g. across test setup/teardown) from ever
 * accumulating stray retention timers when the flag is off, which is the
 * common case.
 */
export function startBackgroundSweeps(
  app: AppInstance,
  handlers: SweepHandlers = {},
  intervalMs = DEFAULT_SWEEP_INTERVAL_MS,
  retentionIntervalMs = DEFAULT_RETENTION_SWEEP_INTERVAL_MS,
): () => void {
  const timer = setInterval(() => {
    runDeadlineSweepOnce(app)
      .then((settled) => settled.forEach((s) => handlers.onTimeout?.(s)))
      .catch((err: unknown) => app.log.error(err, "deadline sweep failed"));
    runWarningSweepOnce(app)
      .then((warned) => warned.forEach((w) => handlers.onWarning?.(w)))
      .catch((err: unknown) => app.log.error(err, "warning sweep failed"));
    // The durable computer-opponent backstop (docs plan §7) runs on the same
    // single-process interval -- no separate worker, queue, or Redis.
    runBotTurnSweepOnce(app)
      .then((acted) => acted.forEach((a) => handlers.onBotActed?.(a)))
      .catch((err: unknown) => app.log.error(err, "bot-turn sweep failed"));
  }, intervalMs);
  timer.unref();

  let retentionTimer: ReturnType<typeof setInterval> | undefined;
  if (isRetentionSweepEnabled(app.env)) {
    retentionTimer = setInterval(() => {
      runRetentionSweepOnce(app.db)
        .then((result) => handlers.onRetentionSwept?.(result))
        .catch((err: unknown) => app.log.error(err, "retention sweep failed"));
    }, retentionIntervalMs);
    retentionTimer.unref();
  }

  return () => {
    clearInterval(timer);
    if (retentionTimer) clearInterval(retentionTimer);
  };
}
