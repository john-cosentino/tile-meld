import { randomInt } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { applyDraw, checkConservation } from "@tile-meld/engine";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { catalog } from "../../src/db/catalog.js";
import { createPlayer } from "../../src/db/repositories/players.js";
import { createRoom } from "../../src/db/repositories/rooms.js";
import { addRoomMember } from "../../src/db/repositories/roomMembers.js";
import {
  dealNewGame,
  loadGameState,
  persistTransition,
  type ReadyMember,
} from "../../src/db/repositories/games.js";

const TURN_LIMIT_HOURS = 4;

async function seedRoomWithMembers(db: Awaited<ReturnType<typeof getTestDb>>, count: number) {
  const hostPlayer = await createPlayer(db, "host-recovery-secret");
  const { room, hostRoomMemberId } = await createRoom(db, {
    creatorPlayerId: hostPlayer.id,
    creatorDisplayName: "Host",
    capacity: count as 2 | 3 | 4,
    visibility: "private",
    turnLimitHours: TURN_LIMIT_HOURS,
  });

  const members: ReadyMember[] = [
    { roomMemberId: hostRoomMemberId, playerId: hostPlayer.id, displayName: "Host" },
  ];
  for (let i = 1; i < count; i++) {
    const player = await createPlayer(db, `player-${i}-recovery-secret`);
    const member = await addRoomMember(db, room.id, player.id, `Player ${i}`);
    members.push({
      roomMemberId: member.id,
      playerId: player.id,
      displayName: member.display_name,
    });
  }

  return { room, members };
}

describe("game persistence round-trip", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("conserves every tile immediately after dealing a fresh game", async () => {
    const db = await getTestDb();
    const { room, members } = await seedRoomWithMembers(db, 3);

    const { gameId } = await db
      .transaction()
      .execute((trx) => dealNewGame(trx, room.id, 1, members, TURN_LIMIT_HOURS, randomInt));

    const loaded = await loadGameState(db, gameId);
    expect(loaded.table).toEqual([]);
    expect(loaded.seats).toHaveLength(3);
    for (const seat of loaded.seats) {
      expect(seat.rack).toHaveLength(14);
    }
    // 106 - 3*14 = 64 tiles remain in the pool.
    expect(loaded.pool).toHaveLength(64);

    const locations = [loaded.table.flat(), ...loaded.seats.map((s) => s.rack), loaded.pool];
    expect(checkConservation(catalog, locations)).toEqual({ conserved: true });
  });

  it("picks a starting seat within range and gives every seat a distinct rack", async () => {
    const db = await getTestDb();
    const { room, members } = await seedRoomWithMembers(db, 4);

    const { gameId } = await db
      .transaction()
      .execute((trx) => dealNewGame(trx, room.id, 1, members, TURN_LIMIT_HOURS, randomInt));

    const loaded = await loadGameState(db, gameId);
    expect(loaded.activeSeat).toBeGreaterThanOrEqual(0);
    expect(loaded.activeSeat).toBeLessThan(4);

    const allTileIds = loaded.seats.flatMap((s) => s.rack.map((t) => t.tileId));
    expect(new Set(allTileIds).size).toBe(allTileIds.length); // no seat shares a tile
  });

  it("conserves every tile after persisting an engine transition and reloading", async () => {
    const db = await getTestDb();
    const { room, members } = await seedRoomWithMembers(db, 2);

    const { gameId } = await db
      .transaction()
      .execute((trx) => dealNewGame(trx, room.id, 1, members, TURN_LIMIT_HOURS, randomInt));

    const before = await loadGameState(db, gameId);
    const activeSeatIndex = before.activeSeat;

    // Voluntary draw is legal regardless of initial-meld status and
    // doesn't require constructing a valid commit -- ideal for exercising
    // the full persist-and-reload path without extra setup.
    const result = applyDraw(before, activeSeatIndex);

    await db
      .transaction()
      .execute((trx) => persistTransition(trx, gameId, before.version, result, TURN_LIMIT_HOURS));

    const after = await loadGameState(db, gameId);
    expect(after.version).toBe(before.version + 1);
    expect(after.seats[activeSeatIndex]!.rack).toHaveLength(15);
    expect(after.pool).toHaveLength(before.pool.length - 1);
    expect(after.activeSeat).not.toBe(activeSeatIndex);

    const locations = [after.table.flat(), ...after.seats.map((s) => s.rack), after.pool];
    expect(checkConservation(catalog, locations)).toEqual({ conserved: true });
  });

  it("rejects persisting against a stale version rather than silently overwriting", async () => {
    const db = await getTestDb();
    const { room, members } = await seedRoomWithMembers(db, 2);

    const { gameId } = await db
      .transaction()
      .execute((trx) => dealNewGame(trx, room.id, 1, members, TURN_LIMIT_HOURS, randomInt));

    const before = await loadGameState(db, gameId);
    const result = applyDraw(before, before.activeSeat);

    await expect(
      db
        .transaction()
        .execute((trx) =>
          persistTransition(trx, gameId, before.version + 999, result, TURN_LIMIT_HOURS),
        ),
    ).rejects.toThrow(/stale version/);
  });

  it("creates a new active turn row and resolves the previous one after a transition", async () => {
    const db = await getTestDb();
    const { room, members } = await seedRoomWithMembers(db, 2);

    const { gameId } = await db
      .transaction()
      .execute((trx) => dealNewGame(trx, room.id, 1, members, TURN_LIMIT_HOURS, randomInt));

    const before = await loadGameState(db, gameId);
    const result = applyDraw(before, before.activeSeat);
    await db
      .transaction()
      .execute((trx) => persistTransition(trx, gameId, before.version, result, TURN_LIMIT_HOURS));

    const turns = await db
      .selectFrom("turns")
      .selectAll()
      .where("game_id", "=", gameId)
      .orderBy("started_at", "asc")
      .execute();

    expect(turns).toHaveLength(2);
    expect(turns[0]!.status).toBe("drawn");
    expect(turns[0]!.resolved_at).not.toBeNull();
    expect(turns[1]!.status).toBe("active");
    expect(turns[1]!.seat_index).toBe(result.state.activeSeat);
  });
});
