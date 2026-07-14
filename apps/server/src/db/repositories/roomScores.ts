import type { Kysely, Selectable, Transaction } from "kysely";
import type { Database, RoomScoresTable } from "../types.js";

export type RoomScoreRow = Selectable<RoomScoresTable>;

/** Applies one completed game's results to each player's running
 * cumulative total for the room -- called after persistTransition when a
 * transition ended the game. */
export async function recordGameResult(
  db: Kysely<Database> | Transaction<Database>,
  roomId: string,
  results: readonly { readonly playerId: string; readonly points: number; readonly won: boolean }[],
): Promise<void> {
  for (const result of results) {
    await db
      .insertInto("room_scores")
      .values({
        room_id: roomId,
        player_id: result.playerId,
        cumulative_score: result.points,
        games_played: 1,
        games_won: result.won ? 1 : 0,
      })
      .onConflict((oc) =>
        oc.columns(["room_id", "player_id"]).doUpdateSet((eb) => ({
          cumulative_score: eb("room_scores.cumulative_score", "+", result.points),
          games_played: eb("room_scores.games_played", "+", 1),
          games_won: eb("room_scores.games_won", "+", result.won ? 1 : 0),
        })),
      )
      .execute();
  }
}

export async function getRoomScores(
  db: Kysely<Database> | Transaction<Database>,
  roomId: string,
): Promise<RoomScoreRow[]> {
  return db.selectFrom("room_scores").selectAll().where("room_id", "=", roomId).execute();
}
