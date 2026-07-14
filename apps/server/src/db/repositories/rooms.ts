import type { Kysely, Selectable } from "kysely";
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

/** Public lobby listing: open public rooms only, no secrets. */
export async function listPublicOpenRooms(db: Kysely<Database>): Promise<RoomRow[]> {
  return db
    .selectFrom("rooms")
    .selectAll()
    .where("visibility", "=", "public")
    .where("status", "=", "open")
    .orderBy("last_activity_at", "desc")
    .execute();
}

export async function touchRoomActivity(db: Kysely<Database>, roomId: string): Promise<void> {
  await db
    .updateTable("rooms")
    .set({ last_activity_at: new Date() })
    .where("id", "=", roomId)
    .execute();
}
