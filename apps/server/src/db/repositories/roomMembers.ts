import type { Kysely, Selectable, Transaction } from "kysely";
import type { Database, RoomMembersTable } from "../types.js";

export type RoomMemberRow = Selectable<RoomMembersTable>;

export async function addRoomMember(
  db: Kysely<Database> | Transaction<Database>,
  roomId: string,
  playerId: string,
  displayName: string,
): Promise<RoomMemberRow> {
  // controller_type is DERIVED from the authoritative players.kind, never
  // supplied by the caller -- so a member can never be mislabeled (docs plan
  // §5, Amendment 3). Both this read and the insert below use the caller's
  // db/trx handle: if the caller passes a transaction they share it, but this
  // function does not open one itself. Correctness does not depend on that --
  // the composite FK (player_id, controller_type) -> players (id, kind)
  // structurally rejects any mismatch regardless of transaction boundaries.
  const player = await db
    .selectFrom("players")
    .select("kind")
    .where("id", "=", playerId)
    .executeTakeFirstOrThrow();

  // A computer member is "ready" from the moment it joins and stays ready
  // across rematches (resetReadiness only clears humans); a human member
  // starts not-ready as before.
  return db
    .insertInto("room_members")
    .values({
      room_id: roomId,
      player_id: playerId,
      display_name: displayName,
      controller_type: player.kind,
      is_ready: player.kind === "computer",
    })
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

/** Current (not-left) membership for a specific player in a room, if any --
 * the basis for room-scoped authorization checks. */
export async function findRoomMemberByRoomAndPlayer(
  db: Kysely<Database> | Transaction<Database>,
  roomId: string,
  playerId: string,
): Promise<RoomMemberRow | undefined> {
  return db
    .selectFrom("room_members")
    .selectAll()
    .where("room_id", "=", roomId)
    .where("player_id", "=", playerId)
    .where("left_at", "is", null)
    .executeTakeFirst();
}

export async function findRoomMemberById(
  db: Kysely<Database> | Transaction<Database>,
  roomMemberId: string,
): Promise<RoomMemberRow | undefined> {
  return db
    .selectFrom("room_members")
    .selectAll()
    .where("id", "=", roomMemberId)
    .executeTakeFirst();
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

/** Readiness resets between games -- called after a game/rematch starts.
 * Computer members are intrinsically ready and are deliberately left
 * untouched, so a human can `/rematch` against the bot without the bot ever
 * needing to "ready up" (docs plan §5, D-BOT7). */
export async function resetReadiness(
  db: Kysely<Database> | Transaction<Database>,
  roomId: string,
): Promise<void> {
  await db
    .updateTable("room_members")
    .set({ is_ready: false })
    .where("room_id", "=", roomId)
    .where("controller_type", "=", "human")
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
