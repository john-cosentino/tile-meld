import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import {
  deleteGameSubtree,
  lockEligibleGameForUpdate,
  maybeDeleteRoom,
} from "../db/repositories/retention.js";

// Phase 7 (docs/next-changes-implementation-plan.md, DR-11/12 corrected):
// the destructive, fixed-48-hour completed-game retention sweep. Mirrors
// game/deadlineSweep.ts's existing shape exactly -- a plain, non-locking
// candidate scan, then per-candidate `FOR UPDATE SKIP LOCKED` inside its
// own bounded transaction -- so this reads as "the same kind of sweep,"
// not a new pattern to learn.

/** The fixed retention window: 48 hours, in milliseconds. A product rule,
 * not a per-deployment tuning knob -- deliberately NOT read from an env
 * var (see env.ts's ENABLE_RETENTION_SWEEP comment). Changing this number
 * is a code change and a new deploy, same as any other product rule. */
export const RETENTION_WINDOW_MS = 48 * 60 * 60 * 1000;

const DEFAULT_RETENTION_BATCH_SIZE = 25;

export type RetentionSweepOptions = {
  /** Defaults to the real current time. Tests inject a fixed instant so
   * the 48-hour boundary is exact and controllable, never a wall-clock
   * sleep. */
  readonly now?: Date;
  readonly batchSize?: number;
};

export type RetentionSweepResult = {
  readonly gameIdsDeleted: readonly string[];
  readonly roomIdsDeleted: readonly string[];
  /** A candidate the initial unlocked scan found, but that turned out to
   * already be gone or no longer eligible by the time this run reached and
   * locked it (SKIP LOCKED lost the race to a concurrent sweep, or -- in
   * this schema -- nothing else can un-complete a completed game, so in
   * practice this only ever means "another sweep instance already deleted
   * it"). Not an error; expected under concurrency. */
  readonly candidatesSkipped: number;
};

/**
 * Runs one bounded retention pass:
 *
 * 1. A plain (non-locking) scan for up to `batchSize` completed games with
 *    `completed_at <= now - 48h`, oldest first (the partial index added in
 *    migration 0021 serves this scan directly).
 * 2. For each candidate, in its OWN transaction: lock it with `FOR UPDATE
 *    SKIP LOCKED` and recheck eligibility under that lock (see
 *    lockEligibleGameForUpdate) -- never trusting the unlocked scan above
 *    as the final word -- then delete its full owned subtree
 *    (deleteGameSubtree). A locked-by-someone-else or no-longer-eligible
 *    candidate is silently skipped, not an error.
 * 3. For every room that had at least one game deleted in step 2, a
 *    separate room-locked transaction (maybeDeleteRoom) rechecks whether
 *    any game at all remains for that room -- active, still-within-window
 *    completed, or a brand new rematch -- and deletes the room only if
 *    none do. This is what makes a concurrent rematch race-safe: both this
 *    and `manualRematchRoom` (game/roomStart.ts) lock the SAME room row
 *    before deciding, so they can never both act on a stale "no games"
 *    view of the same room.
 *
 * No step here ever holds a lock across more than one row's own
 * transaction, and the whole run does bounded work (at most `batchSize`
 * games, and at most that many distinct rooms).
 */
export async function runRetentionSweepOnce(
  db: Kysely<Database>,
  options: RetentionSweepOptions = {},
): Promise<RetentionSweepResult> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - RETENTION_WINDOW_MS);
  const batchSize = options.batchSize ?? DEFAULT_RETENTION_BATCH_SIZE;

  const candidates = await db
    .selectFrom("games")
    .select(["id", "room_id"])
    .where("status", "=", "completed")
    .where("completed_at", "is not", null)
    .where("completed_at", "<=", cutoff)
    .orderBy("completed_at", "asc")
    .limit(batchSize)
    .execute();

  const gameIdsDeleted: string[] = [];
  const roomIdsTouched = new Set<string>();
  let candidatesSkipped = 0;

  for (const candidate of candidates) {
    const deleted = await db.transaction().execute(async (trx) => {
      const locked = await lockEligibleGameForUpdate(trx, candidate.id, cutoff);
      if (!locked) return false;
      await deleteGameSubtree(trx, candidate.id);
      return true;
    });
    if (deleted) {
      gameIdsDeleted.push(candidate.id);
      roomIdsTouched.add(candidate.room_id);
    } else {
      candidatesSkipped++;
    }
  }

  const roomIdsDeleted: string[] = [];
  for (const roomId of roomIdsTouched) {
    const outcome = await maybeDeleteRoom(db, roomId);
    if (outcome === "deleted") roomIdsDeleted.push(roomId);
  }

  return { gameIdsDeleted, roomIdsDeleted, candidatesSkipped };
}
