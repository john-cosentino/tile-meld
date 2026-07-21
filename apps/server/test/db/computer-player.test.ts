import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { createPlayer, ensureComputerPlayer } from "../../src/db/repositories/players.js";
import { createRoom } from "../../src/db/repositories/rooms.js";
import {
  addRoomMember,
  listRoomMembers,
  resetReadiness,
  setRoomMemberReady,
} from "../../src/db/repositories/roomMembers.js";
import { dealNewGame, listGameSeatControllers } from "../../src/db/repositories/games.js";
import {
  COMPUTER_BOT_KIND,
  COMPUTER_DISPLAY_NAME,
  COMPUTER_PLAYER_ID,
} from "../../src/db/botIdentity.js";
import { identityRandomInt } from "../setup/game-fixture.js";

// Phase A -- domain/controller model (docs plan §5, D-BOT1/1a/3/7, Amendments 1 & 3).

describe("computer-opponent domain model", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("ensureComputerPlayer creates a single credential-less computer player, idempotently", async () => {
    const db = await getTestDb();

    const first = await ensureComputerPlayer(db);
    expect(first.id).toBe(COMPUTER_PLAYER_ID);
    expect(first.kind).toBe("computer");
    expect(first.recovery_hash).toBeNull();
    expect(first.display_name_default).toBe(COMPUTER_DISPLAY_NAME);

    // Idempotent: a second call neither throws nor creates a duplicate.
    const second = await ensureComputerPlayer(db);
    expect(second.id).toBe(COMPUTER_PLAYER_ID);

    const count = await db
      .selectFrom("players")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("kind", "=", "computer")
      .executeTakeFirstOrThrow();
    expect(Number(count.n)).toBe(1);
  });

  it("regular players are created as humans with a recovery hash", async () => {
    const db = await getTestDb();
    const player = await createPlayer(db, "some-recovery-secret");
    expect(player.kind).toBe("human");
    expect(player.recovery_hash).not.toBeNull();
  });

  it("ensureComputerPlayer refuses the fixed id when it is occupied by an incompatible row", async () => {
    const db = await getTestDb();
    // Occupy the fixed id with a human player (allowed by the CHECK: human +
    // hash). ensureComputerPlayer must NOT silently adopt it as the bot.
    await db
      .insertInto("players")
      .values({ id: COMPUTER_PLAYER_ID, kind: "human", recovery_hash: "a-real-hash" })
      .execute();
    await expect(ensureComputerPlayer(db)).rejects.toThrow(/incompatible row/);
  });

  it("addRoomMember derives controller_type from the authoritative players.kind, not the caller", async () => {
    const db = await getTestDb();
    const human = await createPlayer(db, "human-secret");
    await ensureComputerPlayer(db);
    const { room } = await createRoom(db, {
      creatorPlayerId: human.id,
      creatorUsername: "Host",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
    });

    // A human player yields controller_type='human' (not ready by default);
    // the computer player yields controller_type='computer' (ready).
    const anotherHuman = await createPlayer(db, "human2-secret");
    const humanMember = await addRoomMember(db, room.id, anotherHuman.id, "Guest");
    expect(humanMember.controller_type).toBe("human");
    expect(humanMember.is_ready).toBe(false);

    const botMember = await addRoomMember(db, room.id, COMPUTER_PLAYER_ID, COMPUTER_DISPLAY_NAME);
    expect(botMember.controller_type).toBe("computer");
  });

  it("the composite FK forbids storing a controller_type that disagrees with players.kind", async () => {
    const db = await getTestDb();
    const human = await createPlayer(db, "human-secret");
    const { room } = await createRoom(db, {
      creatorPlayerId: human.id,
      creatorUsername: "Host",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
    });
    // Directly attempt to mislabel a human player as a computer controller --
    // the (player_id, controller_type) -> players (id, kind) FK rejects it.
    await expect(
      db
        .insertInto("room_members")
        .values({
          room_id: room.id,
          player_id: human.id,
          display_name: "Impostor",
          controller_type: "computer",
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("game_seats CHECK ties bot_kind to controller_type (both invalid combinations rejected)", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "host-secret");
    await ensureComputerPlayer(db);
    const { room } = await createRoom(db, {
      creatorPlayerId: host.id,
      creatorUsername: "Host",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
    });
    await addRoomMember(db, room.id, COMPUTER_PLAYER_ID, COMPUTER_DISPLAY_NAME);
    const members = await listRoomMembers(db, room.id);
    const hostMember = members.find((m) => m.controller_type === "human")!;
    const botMember = members.find((m) => m.controller_type === "computer")!;

    const game = await db
      .insertInto("games")
      .values({ room_id: room.id, seq: 1, status: "active", pool_order: [], active_seat: 0 })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Invalid: a human seat must not carry a bot_kind.
    await expect(
      db
        .insertInto("game_seats")
        .values({
          game_id: game.id,
          room_member_id: hostMember.id,
          player_id: host.id,
          seat_index: 0,
          display_name: "Host",
          join_order: 0,
          controller_type: "human",
          bot_kind: "troubleshooting_v1",
        })
        .execute(),
    ).rejects.toThrow();

    // Invalid: a computer seat must carry a bot_kind.
    await expect(
      db
        .insertInto("game_seats")
        .values({
          game_id: game.id,
          room_member_id: botMember.id,
          player_id: COMPUTER_PLAYER_ID,
          seat_index: 1,
          display_name: COMPUTER_DISPLAY_NAME,
          join_order: 1,
          controller_type: "computer",
          bot_kind: null,
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("the CHECK constraint forbids a human without a hash and a computer with one", async () => {
    const db = await getTestDb();

    // Human must have a recovery_hash.
    await expect(
      db.insertInto("players").values({ kind: "human", recovery_hash: null }).execute(),
    ).rejects.toThrow();

    // Computer must NOT have a recovery_hash (no fake credential).
    await expect(
      db.insertInto("players").values({ kind: "computer", recovery_hash: "some-hash" }).execute(),
    ).rejects.toThrow();
  });

  it("a room host member defaults to controller_type 'human'", async () => {
    // The host member is inserted by createRoom without an explicit
    // controller_type, so this exercises the room_members column default.
    // (game_seats controller_type is covered by the deal-time snapshot test
    // below, which asserts both a human and a computer seat.)
    const db = await getTestDb();
    const host = await createPlayer(db, "host-secret");
    const { room } = await createRoom(db, {
      creatorPlayerId: host.id,
      creatorUsername: "Host",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
    });

    const [member] = await listRoomMembers(db, room.id);
    expect(member!.controller_type).toBe("human");
  });

  it("dealNewGame snapshots controller_type and bot_kind onto game_seats from the authoritative members", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "host-secret");
    await ensureComputerPlayer(db);

    const { room } = await createRoom(db, {
      creatorPlayerId: host.id,
      creatorUsername: "Host",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
    });
    await addRoomMember(db, room.id, COMPUTER_PLAYER_ID, COMPUTER_DISPLAY_NAME);

    const members = await listRoomMembers(db, room.id);
    const readyMembers = members.map((m) => ({
      roomMemberId: m.id,
      playerId: m.player_id,
      displayName: m.display_name,
      controllerType: m.controller_type,
    }));

    const { gameId } = await db
      .transaction()
      .execute((trx) => dealNewGame(trx, room.id, 1, readyMembers, 4, identityRandomInt));

    const controllers = await listGameSeatControllers(db, gameId);
    const values = [...controllers.values()].sort();
    expect(values).toEqual(["computer", "human"]);

    // The computer seat carries the version snapshot; the human seat does not.
    const seats = await db
      .selectFrom("game_seats")
      .select(["player_id", "controller_type", "bot_kind"])
      .where("game_id", "=", gameId)
      .execute();
    const botSeat = seats.find((s) => s.controller_type === "computer");
    const humanSeat = seats.find((s) => s.controller_type === "human");
    expect(botSeat?.player_id).toBe(COMPUTER_PLAYER_ID);
    expect(botSeat?.bot_kind).toBe(COMPUTER_BOT_KIND);
    expect(humanSeat?.bot_kind).toBeNull();
  });

  it("rollback guard (Amendment 1): dependent bot data blocks removing the computer player", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "host-secret");
    await ensureComputerPlayer(db);

    const { room } = await createRoom(db, {
      creatorPlayerId: host.id,
      creatorUsername: "Host",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
    });
    await addRoomMember(db, room.id, COMPUTER_PLAYER_ID, COMPUTER_DISPLAY_NAME);
    const members = await listRoomMembers(db, room.id);
    const readyMembers = members.map((m) => ({
      roomMemberId: m.id,
      playerId: m.player_id,
      displayName: m.display_name,
      controllerType: m.controller_type,
    }));
    await db
      .transaction()
      .execute((trx) => dealNewGame(trx, room.id, 1, readyMembers, 4, identityRandomInt));

    // Migration 0018's down() begins by deleting computer players so it can
    // restore recovery_hash NOT NULL. Once a game_seat references the bot
    // player, that delete FK-fails -- which is exactly what makes the whole
    // down() transaction roll back rather than destroy historical bot data.
    // Production rollback therefore uses the feature flag + a forward
    // corrective migration, never this destructive down().
    await expect(
      db.deleteFrom("players").where("kind", "=", "computer").execute(),
    ).rejects.toThrow();

    // The bot player and its dependent seat are still intact.
    const stillThere = await db
      .selectFrom("players")
      .select("kind")
      .where("id", "=", COMPUTER_PLAYER_ID)
      .executeTakeFirst();
    expect(stillThere?.kind).toBe("computer");
  });

  it("resetReadiness clears human readiness but leaves the computer member ready (rematch support)", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "host-secret");
    await ensureComputerPlayer(db);

    const { room } = await createRoom(db, {
      creatorPlayerId: host.id,
      creatorUsername: "Host",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
    });
    const bot = await addRoomMember(db, room.id, COMPUTER_PLAYER_ID, COMPUTER_DISPLAY_NAME);
    // controller_type is derived from players.kind ('computer'), and a
    // computer member is ready from the moment it joins.
    expect(bot.controller_type).toBe("computer");
    expect(bot.is_ready).toBe(true);

    const [hostMember] = await listRoomMembers(db, room.id);
    await setRoomMemberReady(db, hostMember!.id, true);

    await resetReadiness(db, room.id);

    const after = await listRoomMembers(db, room.id);
    const humanAfter = after.find((m) => m.controller_type === "human");
    const botAfter = after.find((m) => m.controller_type === "computer");
    expect(humanAfter?.is_ready).toBe(false);
    expect(botAfter?.is_ready).toBe(true);
  });

  it("adds the expected controller/identity columns to the schema", async () => {
    const db = await getTestDb();
    const cols = await sql<{ table_name: string; column_name: string }>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name = 'players' AND column_name = 'kind')
          OR (table_name = 'room_members' AND column_name = 'controller_type')
          OR (table_name = 'game_seats' AND column_name IN ('controller_type', 'bot_kind'))
          OR (table_name = 'rooms' AND column_name = 'has_computer'))
    `.execute(db);
    const found = cols.rows.map((r) => `${r.table_name}.${r.column_name}`).sort();
    expect(found).toEqual(
      [
        "game_seats.bot_kind",
        "game_seats.controller_type",
        "players.kind",
        "room_members.controller_type",
        "rooms.has_computer",
      ].sort(),
    );
  });
});
