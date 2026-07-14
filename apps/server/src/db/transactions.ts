import type { Kysely, Transaction } from "kysely";
import type { Database, GamesTable } from "./types.js";
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
