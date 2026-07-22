import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { createPlayer, ensureComputerPlayer } from "../../src/db/repositories/players.js";
import { createComputerRoom, createRoom, findRoomById } from "../../src/db/repositories/rooms.js";
import { setRoomMemberReady, listRoomMembers } from "../../src/db/repositories/roomMembers.js";
import { createSession } from "../../src/db/repositories/sessions.js";
import { appendGameEvent } from "../../src/db/repositories/gameEvents.js";
import { postChatMessage } from "../../src/db/repositories/chatMessages.js";
import { recordIdempotentResult } from "../../src/db/repositories/idempotencyKeys.js";
import { recordGameResult } from "../../src/db/repositories/roomScores.js";
import { deleteGameSubtree, maybeDeleteRoom } from "../../src/db/repositories/retention.js";
import {
  joinRoomAndMaybeAutoStart,
  manualRematchRoom,
  manualStartRoom,
} from "../../src/game/roomStart.js";
import { runRetentionSweepOnce, RETENTION_WINDOW_MS } from "../../src/game/retentionSweep.js";

// Phase 7 (docs/next-changes-implementation-plan.md, DR-11/12 corrected to
// a fixed 48-hour window). Direct, repository/orchestration-level coverage
// of the destructive retention sweep -- every scenario drives real rows
// through real transactions against a real Postgres, never a wall-clock
// sleep: `now` is always injected explicitly.

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date("2026-02-10T12:00:00.000Z");

async function createTestRoom(
  db: Awaited<ReturnType<typeof getTestDb>>,
  hostPlayerId: string,
  username: string,
  capacity: 2 | 3 | 4 = 2,
  visibility: "private" | "public" = "private",
) {
  const { room } = await createRoom(db, {
    creatorPlayerId: hostPlayerId,
    creatorUsername: username,
    capacity,
    visibility,
    turnLimitHours: 4,
  });
  return room;
}

/** Deals a 2-player game (via real auto-start) and forces it to a
 * completed state at `completedAt`, mirroring the established pattern in
 * roomStart.test.ts/rooms.test.ts of driving room/game state directly
 * rather than through real gameplay for tests that aren't about gameplay
 * itself. Returns the gameId. */
async function dealAndCompleteGame(
  db: Awaited<ReturnType<typeof getTestDb>>,
  roomId: string,
  guestPlayerId: string,
  completedAt: Date,
): Promise<string> {
  const outcome = await joinRoomAndMaybeAutoStart(db, roomId, guestPlayerId, "Guest");
  if (outcome.kind !== "joined" || !outcome.gameId) throw new Error("unreachable");
  const gameId = outcome.gameId;
  await db
    .updateTable("games")
    .set({ status: "completed", completed_at: completedAt, winner_seat: 0 })
    .where("id", "=", gameId)
    .execute();
  await db.updateTable("rooms").set({ status: "between_games" }).where("id", "=", roomId).execute();
  return gameId;
}

describe("runRetentionSweepOnce -- eligibility boundary", () => {
  afterAll(async () => {
    await closeTestDb();
  });
  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("preserves an active game older than 48 hours (never completed)", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "ActiveOld");
    const guest = await createPlayer(db, "s2");
    const outcome = await joinRoomAndMaybeAutoStart(db, room.id, guest.id, "Guest");
    if (outcome.kind !== "joined" || !outcome.gameId) throw new Error("unreachable");
    // status stays "active", completed_at stays null -- ineligible
    // regardless of how long ago it was created; eligibility is defined
    // solely by completed_at, never created_at (see retentionSweep.ts).

    const result = await runRetentionSweepOnce(db, {
      now: new Date(NOW.getTime() + 100 * HOUR_MS),
    });
    expect(result.gameIdsDeleted).toEqual([]);
    const game = await db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", outcome.gameId)
      .executeTakeFirst();
    expect(game).toBeDefined();
  });

  it("preserves a completed game with a null completed_at", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "NullCompletedAt");
    const guest = await createPlayer(db, "s2");
    const outcome = await joinRoomAndMaybeAutoStart(db, room.id, guest.id, "Guest");
    if (outcome.kind !== "joined" || !outcome.gameId) throw new Error("unreachable");
    await db
      .updateTable("games")
      .set({ status: "completed", completed_at: null })
      .where("id", "=", outcome.gameId)
      .execute();

    const result = await runRetentionSweepOnce(db, { now: NOW });
    expect(result.gameIdsDeleted).toEqual([]);
  });

  it("preserves a game completed exactly 1 second short of 48 hours", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "JustUnder48h");
    const guest = await createPlayer(db, "s2");
    const completedAt = new Date(NOW.getTime() - RETENTION_WINDOW_MS + 1000);
    const gameId = await dealAndCompleteGame(db, room.id, guest.id, completedAt);

    const result = await runRetentionSweepOnce(db, { now: NOW });
    expect(result.gameIdsDeleted).toEqual([]);
    const game = await db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .executeTakeFirst();
    expect(game).toBeDefined();
  });

  it("deletes a game completed at exactly 48 hours (inclusive boundary)", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "Exactly48h");
    const guest = await createPlayer(db, "s2");
    const completedAt = new Date(NOW.getTime() - RETENTION_WINDOW_MS);
    const gameId = await dealAndCompleteGame(db, room.id, guest.id, completedAt);

    const result = await runRetentionSweepOnce(db, { now: NOW });
    expect(result.gameIdsDeleted).toEqual([gameId]);
  });

  it("deletes a game completed well past 48 hours", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "WayPast48h");
    const guest = await createPlayer(db, "s2");
    const completedAt = new Date(NOW.getTime() - RETENTION_WINDOW_MS - 10 * HOUR_MS);
    const gameId = await dealAndCompleteGame(db, room.id, guest.id, completedAt);

    const result = await runRetentionSweepOnce(db, { now: NOW });
    expect(result.gameIdsDeleted).toEqual([gameId]);
  });
});

describe("runRetentionSweepOnce -- complete subtree deletion", () => {
  afterAll(async () => {
    await closeTestDb();
  });
  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("deletes every row in every game-owned table, leaving no orphans", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "FullSubtree");
    const guest = await createPlayer(db, "s2");
    const completedAt = new Date(NOW.getTime() - RETENTION_WINDOW_MS - HOUR_MS);
    const gameId = await dealAndCompleteGame(db, room.id, guest.id, completedAt);

    // Representative rows in every table dealAndCompleteGame doesn't
    // already populate via the real deal path (game_seats, racks, turns
    // already exist from joinRoomAndMaybeAutoStart's real dealNewGame).
    await db
      .insertInto("table_sets")
      .values({ game_id: gameId, ordinal: 0, kind: "run", tiles: ["C1-1-a"], joker_repr: "{}" })
      .execute();
    await appendGameEvent(db, gameId, 1, "committed", 0, { arrangement: [] });
    await recordIdempotentResult(db, host.id, "retention-test-key", gameId, { ok: true });
    await postChatMessage(db, gameId, 0, host.id, "gg");

    const before = await Promise.all([
      db.selectFrom("game_seats").selectAll().where("game_id", "=", gameId).execute(),
      db.selectFrom("racks").selectAll().where("game_id", "=", gameId).execute(),
      db.selectFrom("turns").selectAll().where("game_id", "=", gameId).execute(),
    ]);
    // Sanity: the fixture really did populate every table before we assert
    // it's all gone -- otherwise a "0 rows" assertion below would be
    // vacuously true.
    expect(before[0].length).toBeGreaterThan(0);
    expect(before[1].length).toBeGreaterThan(0);
    expect(before[2].length).toBeGreaterThan(0);

    const result = await runRetentionSweepOnce(db, { now: NOW });
    expect(result.gameIdsDeleted).toEqual([gameId]);

    const game = await db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .executeTakeFirst();
    expect(game).toBeUndefined();

    for (const table of [
      "game_seats",
      "racks",
      "turns",
      "table_sets",
      "game_events",
      "idempotency_keys",
      "chat_messages",
    ] as const) {
      const rows = await db.selectFrom(table).selectAll().where("game_id", "=", gameId).execute();
      expect(rows, `expected no ${table} rows for the deleted game`).toEqual([]);
    }
  });

  it("clears games.current_turn_id before deleting turns, so the delete never violates that reverse FK", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "CurrentTurnFk");
    const guest = await createPlayer(db, "s2");
    const completedAt = new Date(NOW.getTime() - RETENTION_WINDOW_MS - HOUR_MS);
    const gameId = await dealAndCompleteGame(db, room.id, guest.id, completedAt);

    const gameBefore = await db
      .selectFrom("games")
      .select(["current_turn_id"])
      .where("id", "=", gameId)
      .executeTakeFirstOrThrow();
    expect(gameBefore.current_turn_id).not.toBeNull();

    await expect(runRetentionSweepOnce(db, { now: NOW })).resolves.toMatchObject({
      gameIdsDeleted: [gameId],
    });
  });

  it("transaction rollback preserves the entire subtree if deletion fails mid-way", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "RollbackSafety");
    const guest = await createPlayer(db, "s2");
    const completedAt = new Date(NOW.getTime() - RETENTION_WINDOW_MS - HOUR_MS);
    const gameId = await dealAndCompleteGame(db, room.id, guest.id, completedAt);

    await expect(
      db.transaction().execute(async (trx) => {
        await deleteGameSubtree(trx, gameId);
        throw new Error("simulated mid-deletion failure");
      }),
    ).rejects.toThrow("simulated mid-deletion failure");

    const game = await db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .executeTakeFirst();
    expect(game).toBeDefined();
    const seats = await db
      .selectFrom("game_seats")
      .selectAll()
      .where("game_id", "=", gameId)
      .execute();
    expect(seats.length).toBeGreaterThan(0);
  });
});

describe("runRetentionSweepOnce -- room lifecycle", () => {
  afterAll(async () => {
    await closeTestDb();
  });
  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("deletes the room, its members, and its scores when its only game expires", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "SoleGameRoom");
    const guest = await createPlayer(db, "s2");
    const completedAt = new Date(NOW.getTime() - RETENTION_WINDOW_MS - HOUR_MS);
    await dealAndCompleteGame(db, room.id, guest.id, completedAt);
    await recordGameResult(db, room.id, [
      { playerId: host.id, points: 10, won: true },
      { playerId: guest.id, points: 0, won: false },
    ]);

    const result = await runRetentionSweepOnce(db, { now: NOW });
    expect(result.roomIdsDeleted).toEqual([room.id]);

    expect(await findRoomById(db, room.id)).toBeUndefined();
    const members = await db
      .selectFrom("room_members")
      .selectAll()
      .where("room_id", "=", room.id)
      .execute();
    expect(members).toEqual([]);
    const scores = await db
      .selectFrom("room_scores")
      .selectAll()
      .where("room_id", "=", room.id)
      .execute();
    expect(scores).toEqual([]);
  });

  it("releases the room's friendly name for reuse once the room is deleted", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "NameReuse");
    const guest = await createPlayer(db, "s2");
    const completedAt = new Date(NOW.getTime() - RETENTION_WINDOW_MS - HOUR_MS);
    await dealAndCompleteGame(db, room.id, guest.id, completedAt);

    await runRetentionSweepOnce(db, { now: NOW });
    expect(await findRoomById(db, room.id)).toBeUndefined();

    // The same base name is immediately available again -- no " 1" suffix,
    // proving the deleted room no longer occupies it.
    const reused = await createTestRoom(db, host.id, "NameReuse");
    expect(reused.name).toBe("NameReuse");
  });

  it("deletes only the expired game when a newer, still-within-window completed game exists", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "NewerCompletedSurvives");
    const guest = await createPlayer(db, "s2");
    const oldGameId = await dealAndCompleteGame(
      db,
      room.id,
      guest.id,
      new Date(NOW.getTime() - RETENTION_WINDOW_MS - HOUR_MS),
    );

    const rematch = await manualRematchRoom(db, room.id);
    if (rematch.kind !== "started") throw new Error("unreachable");
    await db
      .updateTable("games")
      .set({ status: "completed", completed_at: new Date(NOW.getTime() - HOUR_MS), winner_seat: 0 })
      .where("id", "=", rematch.gameId)
      .execute();
    await db
      .updateTable("rooms")
      .set({ status: "between_games" })
      .where("id", "=", room.id)
      .execute();

    const result = await runRetentionSweepOnce(db, { now: NOW });
    expect(result.gameIdsDeleted).toEqual([oldGameId]);
    expect(result.roomIdsDeleted).toEqual([]);

    expect(await findRoomById(db, room.id)).toBeDefined();
    const survivingGame = await db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", rematch.gameId)
      .executeTakeFirst();
    expect(survivingGame).toBeDefined();
  });

  it("deletes only the expired game when a newer active rematch exists -- the room stays in_game", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "ActiveRematchSurvives");
    const guest = await createPlayer(db, "s2");
    const oldGameId = await dealAndCompleteGame(
      db,
      room.id,
      guest.id,
      new Date(NOW.getTime() - RETENTION_WINDOW_MS - HOUR_MS),
    );
    const rematch = await manualRematchRoom(db, room.id);
    if (rematch.kind !== "started") throw new Error("unreachable");
    // rematch.gameId is left "active" (an in-progress rematch).

    const result = await runRetentionSweepOnce(db, { now: NOW });
    expect(result.gameIdsDeleted).toEqual([oldGameId]);
    expect(result.roomIdsDeleted).toEqual([]);

    const roomAfter = await findRoomById(db, room.id);
    expect(roomAfter?.status).toBe("in_game");
    const activeGame = await db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", rematch.gameId)
      .executeTakeFirst();
    expect(activeGame?.status).toBe("active");
  });

  it("handles multiple expired games in one room correctly, across bounded batches", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "MultiExpired");
    const guest = await createPlayer(db, "s2");
    const oldEnough = new Date(NOW.getTime() - RETENTION_WINDOW_MS - HOUR_MS);
    const game1 = await dealAndCompleteGame(db, room.id, guest.id, oldEnough);
    const rematch1 = await manualRematchRoom(db, room.id);
    if (rematch1.kind !== "started") throw new Error("unreachable");
    await db
      .updateTable("games")
      .set({ status: "completed", completed_at: oldEnough, winner_seat: 0 })
      .where("id", "=", rematch1.gameId)
      .execute();
    await db
      .updateTable("rooms")
      .set({ status: "between_games" })
      .where("id", "=", room.id)
      .execute();
    const game2 = rematch1.gameId;

    // Batch size 1: the first run can only touch one of the two expired
    // games, so the room must survive that run (one game still remains),
    // and a second run finishes the job.
    const first = await runRetentionSweepOnce(db, { now: NOW, batchSize: 1 });
    expect(first.gameIdsDeleted).toHaveLength(1);
    expect(first.roomIdsDeleted).toEqual([]);
    expect(await findRoomById(db, room.id)).toBeDefined();

    const second = await runRetentionSweepOnce(db, { now: NOW, batchSize: 1 });
    expect(second.gameIdsDeleted).toHaveLength(1);
    expect(second.roomIdsDeleted).toEqual([room.id]);

    expect([...first.gameIdsDeleted, ...second.gameIdsDeleted].sort()).toEqual(
      [game1, game2].sort(),
    );
    expect(await findRoomById(db, room.id)).toBeUndefined();
  });

  it("applies identically to a public room", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "PublicRetention", 2, "public");
    const guest = await createPlayer(db, "s2");
    await dealAndCompleteGame(
      db,
      room.id,
      guest.id,
      new Date(NOW.getTime() - RETENTION_WINDOW_MS - HOUR_MS),
    );

    const result = await runRetentionSweepOnce(db, { now: NOW });
    expect(result.roomIdsDeleted).toEqual([room.id]);
  });

  it("applies identically to a Play vs Computer room", async () => {
    const db = await getTestDb();
    await ensureComputerPlayer(db);
    const human = await createPlayer(db, "s1");
    const { room } = await createComputerRoom(db, {
      humanPlayerId: human.id,
      humanUsername: "Solo",
    });

    // The computer member is intrinsically ready (addRoomMember); only the
    // human needs to mark ready before manualStartRoom -- the real
    // production path for a vs-computer room (it never auto-starts at
    // creation, see roomStart.test.ts's "Play vs Computer does not
    // auto-start" coverage). Found by player_id, not array position --
    // both members share the same transaction-time joined_at, so their
    // relative order from listRoomMembers is not guaranteed.
    const members = await listRoomMembers(db, room.id);
    const humanMember = members.find((m) => m.player_id === human.id);
    await setRoomMemberReady(db, humanMember!.id, true);
    const started = await manualStartRoom(db, room.id);
    if (started.kind !== "started") throw new Error("unreachable: " + JSON.stringify(started));

    await db
      .updateTable("games")
      .set({
        status: "completed",
        completed_at: new Date(NOW.getTime() - RETENTION_WINDOW_MS - HOUR_MS),
        winner_seat: 0,
      })
      .where("id", "=", started.gameId)
      .execute();
    await db
      .updateTable("rooms")
      .set({ status: "between_games" })
      .where("id", "=", room.id)
      .execute();

    const result = await runRetentionSweepOnce(db, { now: NOW });
    expect(result.gameIdsDeleted).toEqual([started.gameId]);
    expect(result.roomIdsDeleted).toEqual([room.id]);
  });
});

describe("runRetentionSweepOnce -- preserved global data", () => {
  afterAll(async () => {
    await closeTestDb();
  });
  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("never touches players, usernames, sessions, or push subscriptions", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    await db
      .updateTable("players")
      .set({ username: "Retainee", username_canonical: "retainee" })
      .where("id", "=", host.id)
      .execute();
    const room = await createTestRoom(db, host.id, "GlobalDataSafe");
    const guest = await createPlayer(db, "s2");
    await dealAndCompleteGame(
      db,
      room.id,
      guest.id,
      new Date(NOW.getTime() - RETENTION_WINDOW_MS - HOUR_MS),
    );

    const { session } = await createSession(db, host.id, "a".repeat(32), 30 * 24 * HOUR_MS);
    await db
      .insertInto("push_subscriptions")
      .values({
        player_id: host.id,
        endpoint: "https://push.example/abc",
        p256dh: "p256dh-key",
        auth: "auth-key",
      })
      .execute();

    await runRetentionSweepOnce(db, { now: NOW });

    const hostAfter = await db
      .selectFrom("players")
      .selectAll()
      .where("id", "=", host.id)
      .executeTakeFirst();
    expect(hostAfter).toBeDefined();
    expect(hostAfter?.username).toBe("Retainee");
    expect(hostAfter?.recovery_hash).toBe(host.recovery_hash);

    const guestAfter = await db
      .selectFrom("players")
      .selectAll()
      .where("id", "=", guest.id)
      .executeTakeFirst();
    expect(guestAfter).toBeDefined();

    const sessionAfter = await db
      .selectFrom("sessions")
      .selectAll()
      .where("id", "=", session.id)
      .executeTakeFirst();
    expect(sessionAfter).toBeDefined();
    expect(sessionAfter?.revoked_at).toBeNull();

    const pushAfter = await db
      .selectFrom("push_subscriptions")
      .selectAll()
      .where("player_id", "=", host.id)
      .execute();
    expect(pushAfter).toHaveLength(1);
  });
});

describe("runRetentionSweepOnce -- safety and idempotency", () => {
  afterAll(async () => {
    await closeTestDb();
  });
  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("an empty sweep (no eligible games) is a harmless no-op", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    await createTestRoom(db, host.id, "NothingToSweep");

    const result = await runRetentionSweepOnce(db, { now: NOW });
    expect(result).toEqual({ gameIdsDeleted: [], roomIdsDeleted: [], candidatesSkipped: 0 });
  });

  it("running the sweep twice in a row is harmless -- the second run finds nothing left to do", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "RunTwice");
    const guest = await createPlayer(db, "s2");
    await dealAndCompleteGame(
      db,
      room.id,
      guest.id,
      new Date(NOW.getTime() - RETENTION_WINDOW_MS - HOUR_MS),
    );

    const first = await runRetentionSweepOnce(db, { now: NOW });
    expect(first.gameIdsDeleted).toHaveLength(1);
    expect(first.roomIdsDeleted).toHaveLength(1);

    const second = await runRetentionSweepOnce(db, { now: NOW });
    expect(second).toEqual({ gameIdsDeleted: [], roomIdsDeleted: [], candidatesSkipped: 0 });
  });

  it("two concurrent sweep invocations never double-delete and never fail", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "ConcurrentSweeps");
    const guest = await createPlayer(db, "s2");
    const gameId = await dealAndCompleteGame(
      db,
      room.id,
      guest.id,
      new Date(NOW.getTime() - RETENTION_WINDOW_MS - HOUR_MS),
    );

    const [a, b] = await Promise.all([
      runRetentionSweepOnce(db, { now: NOW }),
      runRetentionSweepOnce(db, { now: NOW }),
    ]);

    const allDeleted = [...a.gameIdsDeleted, ...b.gameIdsDeleted];
    expect(allDeleted).toEqual([gameId]); // exactly once, by exactly one of the two runs
    const allRoomsDeleted = [...a.roomIdsDeleted, ...b.roomIdsDeleted];
    expect(allRoomsDeleted).toEqual([room.id]);

    expect(await findRoomById(db, room.id)).toBeUndefined();
  });

  it("SKIP LOCKED: a candidate already locked by another transaction is skipped, not waited on", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "SkipLocked");
    const guest = await createPlayer(db, "s2");
    const gameId = await dealAndCompleteGame(
      db,
      room.id,
      guest.id,
      new Date(NOW.getTime() - RETENTION_WINDOW_MS - HOUR_MS),
    );

    let releaseLock!: () => void;
    let lockAcquired!: () => void;
    const lockAcquiredPromise = new Promise<void>((resolve) => {
      lockAcquired = resolve;
    });
    const lockHeldPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const holder = db.transaction().execute(async (trx) => {
      await trx.selectFrom("games").where("id", "=", gameId).forUpdate().executeTakeFirstOrThrow();
      lockAcquired();
      await lockHeldPromise;
    });

    await lockAcquiredPromise;
    const result = await runRetentionSweepOnce(db, { now: NOW });
    expect(result.gameIdsDeleted).toEqual([]);
    expect(result.candidatesSkipped).toBe(1);

    releaseLock();
    await holder;

    // Once released, a subsequent run can now delete it -- proves the
    // skip was a genuine "someone else has it right now," not a
    // permanent miscategorization.
    const after = await runRetentionSweepOnce(db, { now: NOW });
    expect(after.gameIdsDeleted).toEqual([gameId]);
  });

  it("honors the batchSize limit -- bounded work per run", async () => {
    const db = await getTestDb();
    const oldEnough = new Date(NOW.getTime() - RETENTION_WINDOW_MS - HOUR_MS);
    for (let i = 0; i < 3; i++) {
      const host = await createPlayer(db, `bounded-${i}`);
      const room = await createTestRoom(db, host.id, `Bounded${i}`);
      const guest = await createPlayer(db, `bounded-guest-${i}`);
      await dealAndCompleteGame(db, room.id, guest.id, oldEnough);
    }

    const result = await runRetentionSweepOnce(db, { now: NOW, batchSize: 2 });
    expect(result.gameIdsDeleted).toHaveLength(2);

    const remaining = await db
      .selectFrom("games")
      .select(["id"])
      .where("status", "=", "completed")
      .execute();
    expect(remaining).toHaveLength(1);
  });

  it("a rematch that commits before retention's room check preserves the room and the new game", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "RematchWinsRace");
    const guest = await createPlayer(db, "s2");
    const oldGameId = await dealAndCompleteGame(
      db,
      room.id,
      guest.id,
      new Date(NOW.getTime() - RETENTION_WINDOW_MS - HOUR_MS),
    );

    // The rematch is dealt (committing its transaction, including the
    // room-row lock/release) BEFORE retention ever looks at the room.
    const rematch = await manualRematchRoom(db, room.id);
    if (rematch.kind !== "started") throw new Error("unreachable");

    const result = await runRetentionSweepOnce(db, { now: NOW });
    expect(result.gameIdsDeleted).toEqual([oldGameId]);
    expect(result.roomIdsDeleted).toEqual([]);
    expect(await findRoomById(db, room.id)).toBeDefined();
  });

  it("a rematch racing a room retention already deleted fails safely, with no partial state", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "RetentionWinsRace");
    const guest = await createPlayer(db, "s2");
    await dealAndCompleteGame(
      db,
      room.id,
      guest.id,
      new Date(NOW.getTime() - RETENTION_WINDOW_MS - HOUR_MS),
    );

    // Retention runs to completion FIRST -- the room (having no surviving
    // game) is deleted.
    const result = await runRetentionSweepOnce(db, { now: NOW });
    expect(result.roomIdsDeleted).toEqual([room.id]);
    expect(await findRoomById(db, room.id)).toBeUndefined();

    // A rematch attempt racing in after that must fail safely -- not
    // throw an unhandled error, not create any row referencing the
    // now-nonexistent room.
    const rematch = await manualRematchRoom(db, room.id);
    expect(rematch).toEqual({ kind: "not_found" });

    const games = await db.selectFrom("games").select(["id"]).execute();
    expect(games).toEqual([]);
  });

  it("re-querying games under the room lock prevents deleting a room a newer game just appeared in", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "RecheckPreventsDeletion");
    const guest = await createPlayer(db, "s2");
    const oldGameId = await dealAndCompleteGame(
      db,
      room.id,
      guest.id,
      new Date(NOW.getTime() - RETENTION_WINDOW_MS - HOUR_MS),
    );
    // Delete just the expired game's subtree directly (bypassing the full
    // sweep) to simulate "step 2 of the sweep already ran for this game."
    await db.transaction().execute((trx) => deleteGameSubtree(trx, oldGameId));

    // Before the sweep's own room-check step runs, a rematch is dealt.
    const rematch = await manualRematchRoom(db, room.id);
    if (rematch.kind !== "started") throw new Error("unreachable");

    const outcome = await maybeDeleteRoom(db, room.id);
    expect(outcome).toBe("retained");
    expect(await findRoomById(db, room.id)).toBeDefined();
    const survivingGame = await db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", rematch.gameId)
      .executeTakeFirst();
    expect(survivingGame).toBeDefined();
  });
});
