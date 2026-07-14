import type { Kysely, Selectable, Transaction } from "kysely";
import type { Database, RoomsTable } from "../types.js";
import { generateRoomCode } from "../../security/hashing.js";

export type RoomRow = Selectable<RoomsTable>;

export type CreateRoomParams = {
  readonly creatorPlayerId: string;
  readonly creatorDisplayName: string;
  readonly capacity: 2 | 3 | 4;
  readonly visibility: "private" | "public";
  readonly turnLimitHours: 4 | 8 | 12 | 24;
};

/**
 * Creates a room and its host room_member atomically. rooms and
 * room_members reference each other (host_room_member_id <-> room_id), so
 * the room is inserted first with a null host, then the host member, then
 * the room is updated to point at it -- all within one transaction so no
 * caller ever observes a room with no host.
 */
export async function createRoom(
  db: Kysely<Database>,
  params: CreateRoomParams,
): Promise<{ room: RoomRow; hostRoomMemberId: string }> {
  return db.transaction().execute(async (trx) => {
    const room = await trx
      .insertInto("rooms")
      .values({
        code: generateRoomCode(),
        visibility: params.visibility,
        capacity: params.capacity,
        turn_limit_hours: params.turnLimitHours,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const hostMember = await trx
      .insertInto("room_members")
      .values({
        room_id: room.id,
        player_id: params.creatorPlayerId,
        display_name: params.creatorDisplayName,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const updatedRoom = await trx
      .updateTable("rooms")
      .set({ host_room_member_id: hostMember.id })
      .where("id", "=", room.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return { room: updatedRoom, hostRoomMemberId: hostMember.id };
  });
}

export async function findRoomByCode(
  db: Kysely<Database>,
  code: string,
): Promise<RoomRow | undefined> {
  return db
    .selectFrom("rooms")
    .selectAll()
    .where("code", "=", code.toUpperCase())
    .executeTakeFirst();
}

export async function findRoomById(db: Kysely<Database>, id: string): Promise<RoomRow | undefined> {
  return db.selectFrom("rooms").selectAll().where("id", "=", id).executeTakeFirst();
}

export async function touchRoomActivity(db: Kysely<Database>, roomId: string): Promise<void> {
  await db
    .updateTable("rooms")
    .set({ last_activity_at: new Date() })
    .where("id", "=", roomId)
    .execute();
}

export type RoomStatus = RoomRow["status"];

export async function updateRoomStatus(
  db: Kysely<Database> | Transaction<Database>,
  roomId: string,
  status: RoomStatus,
): Promise<void> {
  await db
    .updateTable("rooms")
    .set({ status, last_activity_at: new Date() })
    .where("id", "=", roomId)
    .execute();
}

/**
 * If `leavingMemberId` is the room's current host, transfers host control
 * to the longest-present remaining eligible member (earliest joined_at),
 * or clears the host if none remain. No-op (returns null) if the leaving
 * member wasn't the host. Returns the new host's playerId, if any.
 */
export async function succeedHostIfNeeded(
  trx: Transaction<Database>,
  room: RoomRow,
  leavingMemberId: string,
): Promise<string | null> {
  if (room.host_room_member_id !== leavingMemberId) {
    return null;
  }

  const successor = await trx
    .selectFrom("room_members")
    .selectAll()
    .where("room_id", "=", room.id)
    .where("left_at", "is", null)
    .where("id", "!=", leavingMemberId)
    .orderBy("joined_at", "asc")
    .executeTakeFirst();

  await trx
    .updateTable("rooms")
    .set({ host_room_member_id: successor?.id ?? null })
    .where("id", "=", room.id)
    .execute();

  return successor?.player_id ?? null;
}

/** An open public room with room for at least one more member, excluding
 * rooms `excludePlayerId` is already a member of. Picks the
 * longest-idle-listed room (oldest last_activity_at first) among eligible
 * candidates for determinism. */
export async function findQuickJoinableRoom(
  db: Kysely<Database>,
  excludePlayerId: string,
): Promise<RoomRow | undefined> {
  const candidates = await db
    .selectFrom("rooms")
    .selectAll()
    .where("visibility", "=", "public")
    .where("status", "=", "open")
    .orderBy("last_activity_at", "asc")
    .execute();

  for (const room of candidates) {
    const members = await db
      .selectFrom("room_members")
      .select(["player_id"])
      .where("room_id", "=", room.id)
      .where("left_at", "is", null)
      .execute();
    const alreadyMember = members.some((m) => m.player_id === excludePlayerId);
    if (!alreadyMember && members.length < room.capacity) {
      return room;
    }
  }
  return undefined;
}

export type PublicRoomListing = {
  readonly room: RoomRow;
  readonly memberDisplayNames: readonly string[];
};

/** Public lobby listing: open public rooms with their current members'
 * display names, count/capacity, and turn limit -- no secrets. */
export async function listPublicOpenRoomsWithMembers(
  db: Kysely<Database>,
  limit: number,
  offset: number,
): Promise<PublicRoomListing[]> {
  const rooms = await db
    .selectFrom("rooms")
    .selectAll()
    .where("visibility", "=", "public")
    .where("status", "=", "open")
    .orderBy("last_activity_at", "desc")
    .limit(limit)
    .offset(offset)
    .execute();

  if (rooms.length === 0) return [];

  const roomIds = rooms.map((r) => r.id);
  const members = await db
    .selectFrom("room_members")
    .select(["room_id", "display_name"])
    .where("room_id", "in", roomIds)
    .where("left_at", "is", null)
    .orderBy("joined_at", "asc")
    .execute();

  return rooms.map((room) => ({
    room,
    memberDisplayNames: members.filter((m) => m.room_id === room.id).map((m) => m.display_name),
  }));
}
