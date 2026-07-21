import type { Kysely, Transaction } from "kysely";
import type { Database, GamesTable, RoomsTable } from "./types.js";
import type { Selectable } from "kysely";

export async function inTransaction<T>(
  db: Kysely<Database>,
  fn: (trx: Transaction<Database>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(fn);
}

/** Locks the games row for the duration of the enclosing transaction --
 * the critical-section entry point for any turn-transition write. See
 * docs/opus-implementation-plan.md §6.2. */
export async function lockGameForUpdate(
  trx: Transaction<Database>,
  gameId: string,
): Promise<Selectable<GamesTable>> {
  return trx
    .selectFrom("games")
    .selectAll()
    .where("id", "=", gameId)
    .forUpdate()
    .executeTakeFirstOrThrow();
}

/** Locks the rooms row for the duration of the enclosing transaction --
 * the critical-section entry point for a capacity-checked membership write
 * (join-by-name, Phase 3: docs/next-changes-implementation-plan.md). Makes
 * a room's member-count recheck-then-insert atomic against a concurrent
 * join racing for the same last seat. */
export async function lockRoomForUpdate(
  trx: Transaction<Database>,
  roomId: string,
): Promise<Selectable<RoomsTable>> {
  return trx
    .selectFrom("rooms")
    .selectAll()
    .where("id", "=", roomId)
    .forUpdate()
    .executeTakeFirstOrThrow();
}
