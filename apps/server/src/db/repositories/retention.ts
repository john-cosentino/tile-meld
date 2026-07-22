import type { Kysely, Transaction } from "kysely";
import type { Database, GamesTable } from "../types.js";
import type { Selectable } from "kysely";

// Phase 7 (docs/next-changes-implementation-plan.md, DR-11/12 corrected to
// a fixed 48-hour window): the deletion primitives the retention sweep
// (game/retentionSweep.ts) composes. Every function here is deliberately
// dumb -- no eligibility judgment, no locking policy -- the sweep decides
// *when* to call these; this module only knows *how* to delete safely
// given the real FK graph (see the dependency-graph comment on
// deleteGameSubtree below, and docs/phase-07-retention.md for the full
// documented graph).

/**
 * Locks a single game row FOR UPDATE SKIP LOCKED and rechecks it is still
 * an eligible candidate (completed, and completed at or before `cutoff`)
 * under that lock -- the same "recheck after lock, not an earlier unlocked
 * read" discipline every other room/game-mutating transaction in this
 * codebase already follows (see game/roomStart.ts). Returns undefined if
 * the row is already locked by a concurrent sweep (SKIP LOCKED) or no
 * longer eligible (deleted or otherwise changed since the caller's
 * unlocked candidate scan) -- both are safe, silent no-ops for the caller.
 */
export async function lockEligibleGameForUpdate(
  trx: Transaction<Database>,
  gameId: string,
  cutoff: Date,
): Promise<Selectable<GamesTable> | undefined> {
  return trx
    .selectFrom("games")
    .selectAll()
    .where("id", "=", gameId)
    .where("status", "=", "completed")
    .where("completed_at", "is not", null)
    .where("completed_at", "<=", cutoff)
    .forUpdate()
    .skipLocked()
    .executeTakeFirst();
}

/**
 * Deletes one game's complete owned subtree, bottom-up, in FK-safe order.
 * Must be called with `gameId` already locked (see
 * lockEligibleGameForUpdate) inside the caller's own transaction -- this
 * function opens no transaction itself, so every delete below either all
 * commits together or (on any failure) all rolls back together with
 * whatever the caller does next.
 *
 * The actual dependency graph (every `references games.id` in the
 * migrations, `grep -n "references\\|addForeignKeyConstraint"
 * db/migrations/*.ts`), none of it ON DELETE CASCADE:
 *
 *   games.current_turn_id -> turns.id           (reverse: games references turns)
 *   game_seats.game_id    -> games.id
 *   turns.game_id         -> games.id
 *   turns(game_id, seat_index) -> game_seats(game_id, seat_index)  (composite)
 *   racks(game_id, seat_index) -> game_seats(game_id, seat_index)  (composite)
 *   table_sets.game_id    -> games.id
 *   game_events.game_id   -> games.id
 *   idempotency_keys.game_id -> games.id         (nullable)
 *   chat_messages.game_id -> games.id
 *
 * `games.current_turn_id` is the one reverse edge: it must be cleared
 * before `turns` rows can be deleted, or the delete would violate that FK
 * immediately (a completed game's turn is already resolved and unreferenced
 * in practice, but this is cleared unconditionally rather than relying on
 * that). `racks` and `turns` both depend on `game_seats` via a composite FK
 * and so must be deleted before it; every other table depends on `games`
 * directly and can be deleted in any order relative to each other, as long
 * as all of them are gone before the final `games` row delete.
 */
export async function deleteGameSubtree(trx: Transaction<Database>, gameId: string): Promise<void> {
  await trx.updateTable("games").set({ current_turn_id: null }).where("id", "=", gameId).execute();

  await trx.deleteFrom("racks").where("game_id", "=", gameId).execute();
  await trx.deleteFrom("turns").where("game_id", "=", gameId).execute();
  await trx.deleteFrom("game_seats").where("game_id", "=", gameId).execute();
  await trx.deleteFrom("table_sets").where("game_id", "=", gameId).execute();
  await trx.deleteFrom("game_events").where("game_id", "=", gameId).execute();
  await trx.deleteFrom("idempotency_keys").where("game_id", "=", gameId).execute();
  await trx.deleteFrom("chat_messages").where("game_id", "=", gameId).execute();

  await trx.deleteFrom("games").where("id", "=", gameId).execute();
}

/** Number of games (any status) still on record for a room -- the
 * authoritative "does this room have anything surviving" check, always
 * read fresh under the room lock the caller already holds (see
 * maybeDeleteRoom), never from an earlier unlocked read. */
export async function countGamesForRoom(
  trx: Transaction<Database>,
  roomId: string,
): Promise<number> {
  const row = await trx
    .selectFrom("games")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .where("room_id", "=", roomId)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

export type RoomDeletionOutcome = "deleted" | "retained" | "already_gone";

/**
 * Locks the room row, rechecks under that lock whether any game (any
 * status -- active, completed-but-not-yet-swept, or a brand new rematch)
 * still exists for it, and deletes the room only if none do. Reuses the
 * exact same room-row-lock convention every other room-mutating
 * transaction in this codebase already follows (lockRoomForUpdate,
 * db/transactions.ts) -- this is what makes a concurrent rematch race
 * safe: `manualRematchRoom` (game/roomStart.ts) takes the SAME lock before
 * dealing a new game, so this and a rematch can never both observe "no
 * games" at once, and whichever acquires the lock first fully determines
 * the outcome for the other.
 *
 * `room_members` cascades automatically (ON DELETE CASCADE, migration
 * 0005). `room_scores` does NOT cascade (no ON DELETE clause on its
 * `room_id` FK, migration 0017) and is deleted explicitly here first, in
 * the same transaction, so the room row's own delete never hits an FK
 * violation from it.
 *
 * Returns "already_gone" (not an error) if the room no longer exists --
 * e.g. a concurrent sweep instance's own maybeDeleteRoom call for the same
 * room already committed first. Idempotent by construction: calling this
 * again for an already-deleted or already-retained room is always safe.
 */
export async function maybeDeleteRoom(
  db: Kysely<Database>,
  roomId: string,
): Promise<RoomDeletionOutcome> {
  return db.transaction().execute(async (trx) => {
    const room = await trx
      .selectFrom("rooms")
      .select(["id"])
      .where("id", "=", roomId)
      .forUpdate()
      .executeTakeFirst();
    if (!room) return "already_gone";

    const remaining = await countGamesForRoom(trx, roomId);
    if (remaining > 0) return "retained";

    await trx.deleteFrom("room_scores").where("room_id", "=", roomId).execute();
    await trx.deleteFrom("rooms").where("id", "=", roomId).execute();
    return "deleted";
  });
}
