import type { Kysely, Selectable, Transaction } from "kysely";
import type { Database, PlayersTable } from "../types.js";
import { hashRecoverySecret } from "../../security/hashing.js";

export type PlayerRow = Selectable<PlayersTable>;

export async function createPlayer(
  db: Kysely<Database> | Transaction<Database>,
  recoverySecret: string,
): Promise<PlayerRow> {
  const recoveryHash = await hashRecoverySecret(recoverySecret);
  return db
    .insertInto("players")
    .values({ recovery_hash: recoveryHash })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function findPlayerById(
  db: Kysely<Database> | Transaction<Database>,
  id: string,
): Promise<PlayerRow | undefined> {
  return db.selectFrom("players").selectAll().where("id", "=", id).executeTakeFirst();
}

export async function rotateRecoverySecret(
  db: Kysely<Database> | Transaction<Database>,
  playerId: string,
  newSecret: string,
): Promise<PlayerRow> {
  const recoveryHash = await hashRecoverySecret(newSecret);
  return db
    .updateTable("players")
    .set({ recovery_hash: recoveryHash, recovery_rotated_at: new Date() })
    .where("id", "=", playerId)
    .returningAll()
    .executeTakeFirstOrThrow();
}
