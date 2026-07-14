import type { Kysely, Selectable, Transaction } from "kysely";
import type { Database, GameEventsTable } from "../types.js";

export type GameEventRow = Selectable<GameEventsTable>;

/**
 * Appends a redaction-safe event. `payload` must never contain hidden rack
 * contents of other players -- callers are responsible for that; this
 * function does not attempt to sanitize it. `seq` must be supplied by the
 * caller (typically the game's new version) to keep the append-only
 * ordering meaningful and race-safe within the same transaction as the
 * rest of a persisted transition.
 */
export async function appendGameEvent(
  db: Kysely<Database> | Transaction<Database>,
  gameId: string,
  seq: number,
  type: string,
  seatIndex: number | null,
  payload: Record<string, unknown>,
): Promise<GameEventRow> {
  return db
    .insertInto("game_events")
    .values({
      game_id: gameId,
      seq,
      type,
      seat_index: seatIndex,
      payload: JSON.stringify(payload),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function listGameEvents(
  db: Kysely<Database> | Transaction<Database>,
  gameId: string,
): Promise<GameEventRow[]> {
  return db
    .selectFrom("game_events")
    .selectAll()
    .where("game_id", "=", gameId)
    .orderBy("seq", "asc")
    .execute();
}
