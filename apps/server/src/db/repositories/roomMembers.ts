import type { Kysely, Selectable, Transaction } from "kysely";
import type { Database, RoomMembersTable } from "../types.js";

export type RoomMemberRow = Selectable<RoomMembersTable>;

export async function addRoomMember(
  db: Kysely<Database> | Transaction<Database>,
  roomId: string,
  playerId: string,
  displayName: string,
): Promise<RoomMemberRow> {
  return db
    .insertInto("room_members")
    .values({ room_id: roomId, player_id: playerId, display_name: displayName })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Current (not-left) members, in join order. */
export async function listRoomMembers(
  db: Kysely<Database> | Transaction<Database>,
  roomId: string,
): Promise<RoomMemberRow[]> {
  return db
    .selectFrom("room_members")
    .selectAll()
    .where("room_id", "=", roomId)
    .where("left_at", "is", null)
    .orderBy("joined_at", "asc")
    .execute();
}

export async function setRoomMemberReady(
  db: Kysely<Database> | Transaction<Database>,
  roomMemberId: string,
  ready: boolean,
): Promise<void> {
  await db
    .updateTable("room_members")
    .set({ is_ready: ready })
    .where("id", "=", roomMemberId)
    .execute();
}

/** Readiness resets between games -- called after a game/rematch starts. */
export async function resetReadiness(
  db: Kysely<Database> | Transaction<Database>,
  roomId: string,
): Promise<void> {
  await db
    .updateTable("room_members")
    .set({ is_ready: false })
    .where("room_id", "=", roomId)
    .execute();
}

export async function markRoomMemberLeft(
  db: Kysely<Database> | Transaction<Database>,
  roomMemberId: string,
): Promise<void> {
  await db
    .updateTable("room_members")
    .set({ left_at: new Date() })
    .where("id", "=", roomMemberId)
    .execute();
}
