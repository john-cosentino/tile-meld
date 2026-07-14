import type { Kysely, Selectable, Transaction } from "kysely";
import type { Database, IdempotencyKeysTable } from "../types.js";

export type IdempotencyKeyRow = Selectable<IdempotencyKeysTable>;

/** Scoped by (player_id, key), not key alone -- a client-generated key is
 * only guaranteed unique per player. */
export async function findIdempotentResult(
  db: Kysely<Database> | Transaction<Database>,
  playerId: string,
  key: string,
): Promise<IdempotencyKeyRow | undefined> {
  return db
    .selectFrom("idempotency_keys")
    .selectAll()
    .where("player_id", "=", playerId)
    .where("key", "=", key)
    .executeTakeFirst();
}

/** Persists the full original result (not just a hash) so a duplicate
 * request can be answered by replaying it, without reprocessing. */
export async function recordIdempotentResult(
  db: Kysely<Database> | Transaction<Database>,
  playerId: string,
  key: string,
  gameId: string | null,
  resultPayload: Record<string, unknown>,
): Promise<void> {
  await db
    .insertInto("idempotency_keys")
    .values({
      player_id: playerId,
      key,
      game_id: gameId,
      result_payload: JSON.stringify(resultPayload),
    })
    .execute();
}
