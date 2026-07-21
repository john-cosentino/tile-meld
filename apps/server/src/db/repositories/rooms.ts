import { sql, type Kysely, type Selectable, type Transaction } from "kysely";
import type { Database, RoomsTable } from "../types.js";
import { generateRoomCode } from "../../security/hashing.js";
import { COMPUTER_DISPLAY_NAME, COMPUTER_PLAYER_ID } from "../botIdentity.js";
import { ensureComputerPlayer } from "./players.js";
import { addRoomMember } from "./roomMembers.js";

export type RoomRow = Selectable<RoomsTable>;

/** Turn limit for a Play-vs-Computer room. The bot acts within ~1s, so this is
 * only the human's own generous async deadline. */
const COMPUTER_ROOM_TURN_LIMIT_HOURS = 24;

// Room-name allocation (Phase 2: docs/next-changes-implementation-plan.md,
// DR-6/DR-7). A room's `name` is entirely server-generated from the
// creator's globally unique username -- never free user input -- so the
// candidate strings below are always of the exact form `base` or
// `base N`, and matching against them is never a free-text search.

/** Name of the partial unique index (migration 0020) that is the actual
 * concurrency arbiter for room-name uniqueness. Used to distinguish a
 * name-allocation race (retry with the next suffix) from any other unique
 * violation (e.g. an astronomically unlikely room-code collision, which
 * must NOT be silently retried as if it were a name conflict). */
const ROOM_NAME_UNIQUE_INDEX = "rooms_name_lower_uk";

/** How many numbered candidates (`base`, `base 1`, `base 2`, ...) the
 * fast-path SELECT hint checks in one query. Generous for any realistic
 * number of simultaneously active rooms per creator; the actual bound on
 * correctness is the unique index + the insert-retry loop below, not this
 * window. */
const ROOM_NAME_CANDIDATE_WINDOW = 50;

/** How many times a whole create-room transaction is retried after losing
 * a name-allocation race to a concurrent create. Each attempt is a fresh,
 * fully atomic transaction (Kysely rolls back automatically on throw), so a
 * retry never leaves a partial room behind. */
const MAX_NAME_INSERT_ATTEMPTS = 5;

function isRoomNameUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505" &&
    "constraint" in err &&
    (err as { constraint?: unknown }).constraint === ROOM_NAME_UNIQUE_INDEX
  );
}

function roomNameBase(username: string, visibility: "private" | "public"): string {
  return visibility === "public" ? `public_${username}` : username;
}

/**
 * Picks the smallest available numbered variant of `base` (`base`, then
 * `base 1`, `base 2`, ...) among rooms currently in the creator's relevance
 * window (open/in_game/between_games -- see migration 0020's partial
 * index). This SELECT is only a fast-path hint to minimize retries in the
 * common case; the partial unique index is the actual concurrency arbiter
 * -- callers must still handle isRoomNameUniqueViolation() from the
 * subsequent INSERT.
 */
async function nextCandidateRoomName(
  db: Kysely<Database> | Transaction<Database>,
  base: string,
): Promise<string> {
  const candidates = [
    base,
    ...Array.from({ length: ROOM_NAME_CANDIDATE_WINDOW }, (_, i) => `${base} ${i + 1}`),
  ];
  const candidatesLower = candidates.map((c) => c.toLowerCase());

  const taken = await db
    .selectFrom("rooms")
    .select("name")
    .where("status", "in", ["open", "in_game", "between_games"])
    .where(sql<boolean>`lower(name) in (${sql.join(candidatesLower)})`)
    .execute();
  const takenLower = new Set(taken.map((r) => (r.name ?? "").toLowerCase()));

  const available = candidates.find((c) => !takenLower.has(c.toLowerCase()));
  if (!available) {
    throw new Error(
      `could not find an available room name for base "${base}" within the search window`,
    );
  }
  return available;
}

export type CreateRoomParams = {
  readonly creatorPlayerId: string;
  /** The creator's already-claimed, globally unique username -- the
   * caller (the HTTP route) is responsible for verifying it is non-null
   * before calling this function. Used both to derive the room's `name`
   * and, unconditionally, as the host's `room_members.display_name` (never
   * a caller-supplied display name -- docs plan Phase 2). */
  readonly creatorUsername: string;
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
 *
 * The room's `name` is allocated from the creator's username (see
 * nextCandidateRoomName) and raced against concurrent creators of the same
 * name via retry-on-23505: on a genuine name collision the whole attempt
 * (a single transaction) is discarded and retried from scratch with
 * up-to-date state, up to MAX_NAME_INSERT_ATTEMPTS times.
 */
export async function createRoom(
  db: Kysely<Database>,
  params: CreateRoomParams,
): Promise<{ room: RoomRow; hostRoomMemberId: string }> {
  const base = roomNameBase(params.creatorUsername, params.visibility);

  for (let attempt = 1; attempt <= MAX_NAME_INSERT_ATTEMPTS; attempt++) {
    try {
      return await db.transaction().execute(async (trx) => {
        const name = await nextCandidateRoomName(trx, base);

        const room = await trx
          .insertInto("rooms")
          .values({
            code: generateRoomCode(),
            name,
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
            display_name: params.creatorUsername,
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
    } catch (err) {
      if (isRoomNameUniqueViolation(err) && attempt < MAX_NAME_INSERT_ATTEMPTS) {
        continue;
      }
      throw err;
    }
  }
  /* istanbul ignore next -- unreachable: the loop above always returns or throws */
  throw new Error("failed to allocate a room name after retries");
}

/**
 * Creates a private, 2-seat Play-vs-Computer room already occupied by the
 * human host and the credential-less computer opponent (docs plan §5/§8). All
 * in one transaction so no caller ever observes a half-built bot room. The
 * bot member is intrinsically ready (addRoomMember derives that from
 * players.kind); the human readies + starts through the normal room flow.
 * `has_computer` is set so the room is excluded from public-join paths.
 *
 * Room naming/retry follows the same allocation strategy as createRoom
 * (always private, so the base name is the human's bare username).
 */
export async function createComputerRoom(
  db: Kysely<Database>,
  params: { readonly humanPlayerId: string; readonly humanUsername: string },
): Promise<{ room: RoomRow; hostRoomMemberId: string }> {
  // The bot player must exist before it can be a member; the migration seeds
  // it in production, this covers a fresh/truncated DB and verifies the
  // credential-less invariant.
  await ensureComputerPlayer(db);

  const base = roomNameBase(params.humanUsername, "private");

  for (let attempt = 1; attempt <= MAX_NAME_INSERT_ATTEMPTS; attempt++) {
    try {
      return await db.transaction().execute(async (trx) => {
        const name = await nextCandidateRoomName(trx, base);

        const room = await trx
          .insertInto("rooms")
          .values({
            code: generateRoomCode(),
            name,
            visibility: "private",
            capacity: 2,
            turn_limit_hours: COMPUTER_ROOM_TURN_LIMIT_HOURS,
            has_computer: true,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        const hostMember = await addRoomMember(
          trx,
          room.id,
          params.humanPlayerId,
          params.humanUsername,
        );
        // controller_type is derived from players.kind ('computer'); the bot joins
        // ready.
        await addRoomMember(trx, room.id, COMPUTER_PLAYER_ID, COMPUTER_DISPLAY_NAME);

        const updatedRoom = await trx
          .updateTable("rooms")
          .set({ host_room_member_id: hostMember.id })
          .where("id", "=", room.id)
          .returningAll()
          .executeTakeFirstOrThrow();

        return { room: updatedRoom, hostRoomMemberId: hostMember.id };
      });
    } catch (err) {
      if (isRoomNameUniqueViolation(err) && attempt < MAX_NAME_INSERT_ATTEMPTS) {
        continue;
      }
      throw err;
    }
  }
  /* istanbul ignore next -- unreachable: the loop above always returns or throws */
  throw new Error("failed to allocate a room name after retries");
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
