import type { Kysely, Selectable, Transaction } from "kysely";
import type { Database, ChatMessagesTable } from "../types.js";

export type ChatMessageRow = Selectable<ChatMessagesTable>;

const MAX_BODY_LENGTH = 500;

/** Always game-scoped. `senderPlayerId` and `createdAt` are server-owned --
 * callers must never accept these from client input. Body length is also
 * enforced here as a second layer alongside the DB check constraint. */
export async function postChatMessage(
  db: Kysely<Database> | Transaction<Database>,
  gameId: string,
  seatIndex: number | null,
  senderPlayerId: string,
  body: string,
): Promise<ChatMessageRow> {
  if (body.length === 0 || body.length > MAX_BODY_LENGTH) {
    throw new Error(`postChatMessage: body must be 1-${MAX_BODY_LENGTH} characters`);
  }
  return db
    .insertInto("chat_messages")
    .values({ game_id: gameId, seat_index: seatIndex, sender_player_id: senderPlayerId, body })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function listChatMessages(
  db: Kysely<Database> | Transaction<Database>,
  gameId: string,
): Promise<ChatMessageRow[]> {
  return db
    .selectFrom("chat_messages")
    .selectAll()
    .where("game_id", "=", gameId)
    .orderBy("created_at", "asc")
    .execute();
}
