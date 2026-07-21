import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { createPlayer, ensureComputerPlayer } from "../../src/db/repositories/players.js";
import { createComputerRoom, createRoom, findRoomById } from "../../src/db/repositories/rooms.js";
import {
  addRoomMember,
  listRoomMembers,
  setRoomMemberReady,
} from "../../src/db/repositories/roomMembers.js";
import { dealNewGame } from "../../src/db/repositories/games.js";
import {
  joinRoomAndMaybeAutoStart,
  manualStartRoom,
  manualRematchRoom,
} from "../../src/game/roomStart.js";

// Phase 4 -- race-safe auto-start alongside the existing Start Game button
// (docs/next-changes-implementation-plan.md, DR-9 corrected). Direct,
// repository-level coverage of the one authoritative transaction; HTTP-level
// route/error-message coverage lives in test/http/autoStart.test.ts.

async function createTestRoom(
  db: Awaited<ReturnType<typeof getTestDb>>,
  hostPlayerId: string,
  username: string,
  capacity: 2 | 3 | 4,
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

describe("joinRoomAndMaybeAutoStart -- capacity auto-start", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("a 2-player room auto-starts when the second player joins", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "Host2", 2);
    const guest = await createPlayer(db, "s2");

    const outcome = await joinRoomAndMaybeAutoStart(db, room.id, guest.id, "Guest");
    expect(outcome.kind).toBe("joined");
    if (outcome.kind !== "joined") throw new Error("unreachable");
    expect(outcome.gameId).not.toBeNull();

    const updated = await findRoomById(db, room.id);
    expect(updated?.status).toBe("in_game");

    const seats = await db
      .selectFrom("game_seats")
      .select("player_id")
      .where("game_id", "=", outcome.gameId!)
      .execute();
    expect(seats.map((s) => s.player_id).sort()).toEqual([guest.id, host.id].sort());
  });

  it("a 3-player room stays open at two members and auto-starts at three", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "Host3", 3);
    const p2 = await createPlayer(db, "s2");
    const p3 = await createPlayer(db, "s3");

    const afterSecond = await joinRoomAndMaybeAutoStart(db, room.id, p2.id, "P2");
    expect(afterSecond).toEqual({ kind: "joined", gameId: null });
    expect((await findRoomById(db, room.id))?.status).toBe("open");

    const afterThird = await joinRoomAndMaybeAutoStart(db, room.id, p3.id, "P3");
    expect(afterThird.kind).toBe("joined");
    if (afterThird.kind !== "joined") throw new Error("unreachable");
    expect(afterThird.gameId).not.toBeNull();
    expect((await findRoomById(db, room.id))?.status).toBe("in_game");

    const seats = await db
      .selectFrom("game_seats")
      .select("player_id")
      .where("game_id", "=", afterThird.gameId!)
      .execute();
    expect(seats).toHaveLength(3);
  });

  it("a 4-player room stays open at two and three members, auto-starts at four", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "Host4", 4);
    const p2 = await createPlayer(db, "s2");
    const p3 = await createPlayer(db, "s3");
    const p4 = await createPlayer(db, "s4");

    expect(await joinRoomAndMaybeAutoStart(db, room.id, p2.id, "P2")).toEqual({
      kind: "joined",
      gameId: null,
    });
    expect((await findRoomById(db, room.id))?.status).toBe("open");

    expect(await joinRoomAndMaybeAutoStart(db, room.id, p3.id, "P3")).toEqual({
      kind: "joined",
      gameId: null,
    });
    expect((await findRoomById(db, room.id))?.status).toBe("open");

    const afterFourth = await joinRoomAndMaybeAutoStart(db, room.id, p4.id, "P4");
    expect(afterFourth.kind).toBe("joined");
    if (afterFourth.kind !== "joined") throw new Error("unreachable");
    expect(afterFourth.gameId).not.toBeNull();
    expect((await findRoomById(db, room.id))?.status).toBe("in_game");

    const seats = await db
      .selectFrom("game_seats")
      .select("player_id")
      .where("game_id", "=", afterFourth.gameId!)
      .execute();
    expect(seats).toHaveLength(4);
  });

  it("auto-start seats every current member regardless of readiness", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "NoReady", 2);
    const guest = await createPlayer(db, "s2");

    // Nobody ever called setRoomMemberReady.
    const outcome = await joinRoomAndMaybeAutoStart(db, room.id, guest.id, "Guest");
    expect(outcome.kind).toBe("joined");
    if (outcome.kind !== "joined") throw new Error("unreachable");
    expect(outcome.gameId).not.toBeNull();

    const seats = await db
      .selectFrom("game_seats")
      .select("player_id")
      .where("game_id", "=", outcome.gameId!)
      .execute();
    expect(seats).toHaveLength(2);
  });

  it("creates exactly one game for a 2-player auto-start", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "OneGame", 2);
    const guest = await createPlayer(db, "s2");

    await joinRoomAndMaybeAutoStart(db, room.id, guest.id, "Guest");

    const games = await db.selectFrom("games").selectAll().where("room_id", "=", room.id).execute();
    expect(games).toHaveLength(1);
  });

  it("does not allow a player to be added after the room has started", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "ClosedAfterStart", 2);
    const guest = await createPlayer(db, "s2");
    await joinRoomAndMaybeAutoStart(db, room.id, guest.id, "Guest"); // auto-starts

    const late = await createPlayer(db, "s3");
    const outcome = await joinRoomAndMaybeAutoStart(db, room.id, late.id, "Late");
    expect(outcome).toEqual({ kind: "not_open" });

    const members = await listRoomMembers(db, room.id);
    expect(members).toHaveLength(2);
  });

  it("rejects joining a full room without dealing a second game", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "FullRoom", 3);
    const p2 = await createPlayer(db, "s2");
    await joinRoomAndMaybeAutoStart(db, room.id, p2.id, "P2");
    // Manually fill the third seat without auto-starting logic, to exercise
    // the plain "full" branch (status still open, but at capacity) --
    // reached only if something else raced the count between reads.
    await addRoomMember(db, room.id, (await createPlayer(db, "s3")).id, "P3");
    await db.updateTable("rooms").set({ status: "open" }).where("id", "=", room.id).execute();

    const late = await createPlayer(db, "s4");
    const outcome = await joinRoomAndMaybeAutoStart(db, room.id, late.id, "Late");
    expect(outcome).toEqual({ kind: "full" });
  });
});

describe("manualStartRoom", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("starts a 3-player room early with only 2 ready, below capacity", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "Early3", 3);
    const p2 = await createPlayer(db, "s2");
    await joinRoomAndMaybeAutoStart(db, room.id, p2.id, "P2"); // 2 of 3 -- stays open
    for (const m of await listRoomMembers(db, room.id)) {
      await setRoomMemberReady(db, m.id, true);
    }

    const outcome = await manualStartRoom(db, room.id);
    expect(outcome.kind).toBe("started");
    if (outcome.kind !== "started") throw new Error("unreachable");

    const seats = await db
      .selectFrom("game_seats")
      .select("player_id")
      .where("game_id", "=", outcome.gameId)
      .execute();
    expect(seats).toHaveLength(2); // the unfilled third seat closes

    const room2 = await findRoomById(db, room.id);
    expect(room2?.status).toBe("in_game");
  });

  it("rejects starting with fewer than the minimum ready members", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "TooFewReady", 3);
    const outcome = await manualStartRoom(db, room.id);
    expect(outcome).toEqual({ kind: "insufficient_ready" });
  });

  it("rejects starting a room that is not open", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "AlreadyStarted", 2);
    const guest = await createPlayer(db, "s2");
    await joinRoomAndMaybeAutoStart(db, room.id, guest.id, "Guest"); // auto-starts
    const outcome = await manualStartRoom(db, room.id);
    expect(outcome).toEqual({ kind: "not_open" });
  });
});

describe("concurrency (Phase 4)", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("two simultaneous joins for the last seat: one succeeds, one fails safely, exactly one game", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "RaceSeat", 2);
    const a = await createPlayer(db, "s2");
    const b = await createPlayer(db, "s3");

    const [ra, rb] = await Promise.all([
      joinRoomAndMaybeAutoStart(db, room.id, a.id, "A"),
      joinRoomAndMaybeAutoStart(db, room.id, b.id, "B"),
    ]);

    const joined = [ra, rb].filter((o) => o.kind === "joined");
    const other = [ra, rb].filter((o) => o.kind !== "joined");
    expect(joined).toHaveLength(1);
    expect(other).toHaveLength(1);
    // The winner's auto-start already flipped the room to in_game before
    // the loser's lock is granted, so the loser observes "not_open", not
    // "full" -- the status check runs before the capacity check.
    expect(other[0]?.kind).toBe("not_open");

    const members = await listRoomMembers(db, room.id);
    expect(members).toHaveLength(2); // never over capacity

    const games = await db.selectFrom("games").selectAll().where("room_id", "=", room.id).execute();
    expect(games).toHaveLength(1);
  });

  it("manual Start racing the final join produces exactly one game, whichever wins", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "RaceStartVsJoin", 3);
    const p2 = await createPlayer(db, "s2");
    await joinRoomAndMaybeAutoStart(db, room.id, p2.id, "P2"); // 2 of 3, stays open
    for (const m of await listRoomMembers(db, room.id)) {
      await setRoomMemberReady(db, m.id, true); // both ready -> manual start eligible
    }
    const p3 = await createPlayer(db, "s3");

    const [startOutcome, joinOutcome] = await Promise.all([
      manualStartRoom(db, room.id),
      joinRoomAndMaybeAutoStart(db, room.id, p3.id, "P3"),
    ]);

    const games = await db.selectFrom("games").selectAll().where("room_id", "=", room.id).execute();
    expect(games).toHaveLength(1); // exactly one game, regardless of who won

    if (startOutcome.kind === "started") {
      // Manual Start won: seated only the 2 ready members; the racing join
      // must fail safely because the room is no longer open.
      expect(joinOutcome).toEqual({ kind: "not_open" });
      const seats = await db
        .selectFrom("game_seats")
        .select("player_id")
        .where("game_id", "=", startOutcome.gameId)
        .execute();
      expect(seats).toHaveLength(2);
    } else {
      // The final join won and auto-started, seating all 3 current
      // members; manual Start's own attempt must not deal a second game.
      expect(joinOutcome.kind).toBe("joined");
      expect(startOutcome).toEqual({ kind: "not_open" });
    }
  });

  it("two simultaneous manual Start requests produce exactly one game", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "DoubleStart", 3);
    const p2 = await createPlayer(db, "s2");
    await joinRoomAndMaybeAutoStart(db, room.id, p2.id, "P2");
    for (const m of await listRoomMembers(db, room.id)) {
      await setRoomMemberReady(db, m.id, true);
    }

    const [r1, r2] = await Promise.all([
      manualStartRoom(db, room.id),
      manualStartRoom(db, room.id),
    ]);
    const started = [r1, r2].filter((r) => r.kind === "started");
    const other = [r1, r2].find((r) => r.kind !== "started");
    expect(started).toHaveLength(1);
    expect(other).toEqual({ kind: "not_open" });

    const games = await db.selectFrom("games").selectAll().where("room_id", "=", room.id).execute();
    expect(games).toHaveLength(1);
  });

  it("repeated auto-start attempts on an already-started room are all safely rejected", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "AlreadyStartedRepeat", 2);
    const guest = await createPlayer(db, "s2");
    await joinRoomAndMaybeAutoStart(db, room.id, guest.id, "Guest"); // auto-starts

    const late = await createPlayer(db, "s3");
    const results = await Promise.all([
      joinRoomAndMaybeAutoStart(db, room.id, late.id, "Late"),
      manualStartRoom(db, room.id),
    ]);
    expect(results.every((r) => r.kind === "not_open")).toBe(true);

    const games = await db.selectFrom("games").selectAll().where("room_id", "=", room.id).execute();
    expect(games).toHaveLength(1);
  });
});

describe("manualRematchRoom (unchanged business rules, now under the same lock discipline)", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("rejects a rematch when the room is not between_games", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "NotBetween", 2);
    const outcome = await manualRematchRoom(db, room.id);
    expect(outcome).toEqual({ kind: "not_between_games" });
  });

  it("deals seq 2 for a rematch, seating only ready members", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "Rematch", 3);
    const p2 = await createPlayer(db, "s2");
    const p3 = await createPlayer(db, "s3");
    await joinRoomAndMaybeAutoStart(db, room.id, p2.id, "P2");
    await addRoomMember(db, room.id, p3.id, "P3");
    for (const m of await listRoomMembers(db, room.id)) {
      await setRoomMemberReady(db, m.id, true);
    }
    await manualStartRoom(db, room.id);
    await db
      .updateTable("rooms")
      .set({ status: "between_games" })
      .where("id", "=", room.id)
      .execute();

    // Only host + p2 ready for the rematch; p3 excluded (D-REMATCH).
    const members = await listRoomMembers(db, room.id);
    for (const m of members) await setRoomMemberReady(db, m.id, false);
    const [hostMember, p2Member] = members.filter(
      (m) => m.player_id === host.id || m.player_id === p2.id,
    );
    await setRoomMemberReady(db, hostMember!.id, true);
    await setRoomMemberReady(db, p2Member!.id, true);

    const outcome = await manualRematchRoom(db, room.id);
    expect(outcome.kind).toBe("started");
    if (outcome.kind !== "started") throw new Error("unreachable");

    const game = await db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", outcome.gameId)
      .executeTakeFirstOrThrow();
    expect(game.seq).toBe(2);
    const seats = await db
      .selectFrom("game_seats")
      .select("player_id")
      .where("game_id", "=", outcome.gameId)
      .execute();
    expect(seats.map((s) => s.player_id).sort()).toEqual([host.id, p2.id].sort());
  });
});

describe("unique (room_id, seq) constraint remains a secondary backstop", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("the games table itself still rejects a duplicate seq for the same room, independent of any lock", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "SeqBackstop", 2);
    const guest = await createPlayer(db, "s2");
    await addRoomMember(db, room.id, guest.id, "Guest");
    const members = await listRoomMembers(db, room.id);
    const readyMembers = members.map((m) => ({
      roomMemberId: m.id,
      playerId: m.player_id,
      displayName: m.display_name,
      controllerType: m.controller_type,
    }));

    // Bypasses the room lock entirely (calls dealNewGame directly, as
    // roomStart.ts's dealForRoom does internally) to prove the unique
    // index alone -- not the lock -- is what stops a literal duplicate
    // seq, exactly as it would if a future bug ever skipped the lock.
    await db.transaction().execute((trx) => dealNewGame(trx, room.id, 1, readyMembers, 4, () => 0));

    await expect(
      db.transaction().execute((trx) => dealNewGame(trx, room.id, 1, readyMembers, 4, () => 0)),
    ).rejects.toThrow();
  });
});

describe("Play vs Computer does not auto-start at creation", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("createComputerRoom leaves the room open despite both seats being filled immediately", async () => {
    const db = await getTestDb();
    await ensureComputerPlayer(db);
    const human = await createPlayer(db, "s1");
    const { room } = await createComputerRoom(db, {
      humanPlayerId: human.id,
      humanUsername: "Solo",
    });

    expect(room.status).toBe("open");
    const members = await listRoomMembers(db, room.id);
    expect(members).toHaveLength(2);
    const games = await db.selectFrom("games").selectAll().where("room_id", "=", room.id).execute();
    expect(games).toHaveLength(0);
  });
});
