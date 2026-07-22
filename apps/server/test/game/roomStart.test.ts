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
  MIN_REMATCH_MEMBERS,
} from "../../src/game/roomStart.js";
import { getRoomScores, recordGameResult } from "../../src/db/repositories/roomScores.js";

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

/** Drives a room through one completed game and lands it on between_games,
 * without going through the real turn-completion path (that lives in
 * game/turnActions.ts, exercised elsewhere) -- Phase 5's rematch tests only
 * care about room/member state at the point a rematch becomes eligible. */
async function completeFirstGame(
  db: Awaited<ReturnType<typeof getTestDb>>,
  roomId: string,
): Promise<void> {
  await db.updateTable("rooms").set({ status: "between_games" }).where("id", "=", roomId).execute();
}

describe("manualRematchRoom -- one-click rematch (Phase 5)", () => {
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

  it("deals seq 2 seating every current member, without requiring anyone to be ready", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "Rematch2", 2);
    const guest = await createPlayer(db, "s2");
    await joinRoomAndMaybeAutoStart(db, room.id, guest.id, "Guest"); // auto-starts, seq 1
    await completeFirstGame(db, room.id);

    // Neither member is ready -- Phase 5 rematch must not require it.
    for (const m of await listRoomMembers(db, room.id)) {
      expect(m.is_ready).toBe(false);
    }

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
    expect(seats.map((s) => s.player_id).sort()).toEqual([host.id, guest.id].sort());
  });

  for (const capacity of [2, 3, 4] as const) {
    it(`rematches a full ${capacity}-player room, seating every member regardless of readiness`, async () => {
      const db = await getTestDb();
      const host = await createPlayer(db, "s1");
      const room = await createTestRoom(db, host.id, `Rematch${capacity}`, capacity);
      const others = [];
      for (let i = 1; i < capacity; i++) {
        const p = await createPlayer(db, `s${i + 1}`);
        await joinRoomAndMaybeAutoStart(db, room.id, p.id, `P${i + 1}`);
        others.push(p);
      }
      await completeFirstGame(db, room.id);

      const outcome = await manualRematchRoom(db, room.id);
      expect(outcome.kind).toBe("started");
      if (outcome.kind !== "started") throw new Error("unreachable");

      const seats = await db
        .selectFrom("game_seats")
        .select("player_id")
        .where("game_id", "=", outcome.gameId)
        .execute();
      expect(seats.map((s) => s.player_id).sort()).toEqual(
        [host.id, ...others.map((o) => o.id)].sort(),
      );
    });
  }

  it("excludes a member who explicitly left the room", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "LeftExcluded", 3);
    const p2 = await createPlayer(db, "s2");
    const p3 = await createPlayer(db, "s3");
    await joinRoomAndMaybeAutoStart(db, room.id, p2.id, "P2");
    const p2Member = (await listRoomMembers(db, room.id)).find((m) => m.player_id === p2.id)!;
    await addRoomMember(db, room.id, p3.id, "P3");
    await completeFirstGame(db, room.id);

    await db
      .updateTable("room_members")
      .set({ left_at: new Date() })
      .where("id", "=", p2Member.id)
      .execute();

    const outcome = await manualRematchRoom(db, room.id);
    expect(outcome.kind).toBe("started");
    if (outcome.kind !== "started") throw new Error("unreachable");
    const seats = await db
      .selectFrom("game_seats")
      .select("player_id")
      .where("game_id", "=", outcome.gameId)
      .execute();
    expect(seats.map((s) => s.player_id).sort()).toEqual([host.id, p3.id].sort());
  });

  it("a player who resigned from the completed game remains eligible (resignation is per-game, not per-membership)", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "ResignedEligible", 2);
    const guest = await createPlayer(db, "s2");
    const joinOutcome = await joinRoomAndMaybeAutoStart(db, room.id, guest.id, "Guest");
    if (joinOutcome.kind !== "joined" || !joinOutcome.gameId) throw new Error("unreachable");

    // The guest resigned from the just-completed game -- game_seats.status
    // is per-game history, room_members.left_at is untouched by it.
    await db
      .updateTable("game_seats")
      .set({ status: "resigned" })
      .where("game_id", "=", joinOutcome.gameId)
      .where("player_id", "=", guest.id)
      .execute();
    await completeFirstGame(db, room.id);

    const outcome = await manualRematchRoom(db, room.id);
    expect(outcome.kind).toBe("started");
    if (outcome.kind !== "started") throw new Error("unreachable");
    const seats = await db
      .selectFrom("game_seats")
      .select("player_id")
      .where("game_id", "=", outcome.gameId)
      .execute();
    expect(seats.map((s) => s.player_id).sort()).toEqual([host.id, guest.id].sort());
  });

  it(`rejects a rematch with fewer than ${MIN_REMATCH_MEMBERS} eligible members remaining after everyone but the host leaves`, async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "SoleSurvivor", 2);
    const guest = await createPlayer(db, "s2");
    await joinRoomAndMaybeAutoStart(db, room.id, guest.id, "Guest");
    await completeFirstGame(db, room.id);

    const guestMember = (await listRoomMembers(db, room.id)).find((m) => m.player_id === guest.id)!;
    await db
      .updateTable("room_members")
      .set({ left_at: new Date() })
      .where("id", "=", guestMember.id)
      .execute();

    const outcome = await manualRematchRoom(db, room.id);
    expect(outcome).toEqual({ kind: "insufficient_members" });
  });

  it("resets human readiness after dealing the rematch, exactly like a fresh Start", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "ReadyResetRematch", 2);
    const guest = await createPlayer(db, "s2");
    await joinRoomAndMaybeAutoStart(db, room.id, guest.id, "Guest");
    await completeFirstGame(db, room.id);
    for (const m of await listRoomMembers(db, room.id)) {
      await setRoomMemberReady(db, m.id, true);
    }

    await manualRematchRoom(db, room.id);

    const members = await listRoomMembers(db, room.id);
    expect(members.every((m) => m.is_ready === false)).toBe(true);
  });

  it("preserves the prior completed game and its result untouched", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "PriorGamePreserved", 2);
    const guest = await createPlayer(db, "s2");
    const joinOutcome = await joinRoomAndMaybeAutoStart(db, room.id, guest.id, "Guest");
    if (joinOutcome.kind !== "joined" || !joinOutcome.gameId) throw new Error("unreachable");
    const firstGameId = joinOutcome.gameId;
    await db
      .updateTable("games")
      .set({ status: "completed", completed_at: new Date(), winner_seat: 0 })
      .where("id", "=", firstGameId)
      .execute();
    await completeFirstGame(db, room.id);

    const outcome = await manualRematchRoom(db, room.id);
    expect(outcome.kind).toBe("started");
    if (outcome.kind !== "started") throw new Error("unreachable");
    expect(outcome.gameId).not.toBe(firstGameId);

    const firstGame = await db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", firstGameId)
      .executeTakeFirstOrThrow();
    expect(firstGame.status).toBe("completed");
    expect(firstGame.winner_seat).toBe(0);
    const firstGameSeats = await db
      .selectFrom("game_seats")
      .selectAll()
      .where("game_id", "=", firstGameId)
      .execute();
    expect(firstGameSeats).toHaveLength(2);
  });

  it("does not touch room_scores -- cumulative scores survive a rematch untouched", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "ScoresPreserved", 2);
    const guest = await createPlayer(db, "s2");
    await joinRoomAndMaybeAutoStart(db, room.id, guest.id, "Guest");
    await completeFirstGame(db, room.id);
    await recordGameResult(db, room.id, [
      { playerId: host.id, points: 42, won: true },
      { playerId: guest.id, points: 5, won: false },
    ]);
    const before = await getRoomScores(db, room.id);

    await manualRematchRoom(db, room.id);

    const after = await getRoomScores(db, room.id);
    expect(after).toEqual(before);
    expect(after.find((r) => r.player_id === host.id)?.cumulative_score).toBe(42);
  });

  it("Play vs Computer: one-click rematch reseats the human and the computer, no readiness needed", async () => {
    const db = await getTestDb();
    await ensureComputerPlayer(db);
    const human = await createPlayer(db, "s1");
    const { room } = await createComputerRoom(db, {
      humanPlayerId: human.id,
      humanUsername: "Solo",
    });
    await manualStartRoom(db, room.id); // computer is intrinsically ready, human isn't required to be
    await completeFirstGame(db, room.id);

    const outcome = await manualRematchRoom(db, room.id);
    expect(outcome.kind).toBe("started");
    if (outcome.kind !== "started") throw new Error("unreachable");

    const seats = await db
      .selectFrom("game_seats")
      .select(["player_id", "controller_type"])
      .where("game_id", "=", outcome.gameId)
      .execute();
    expect(seats).toHaveLength(2);
    expect(seats.map((s) => s.controller_type).sort()).toEqual(["computer", "human"]);
  });
});

describe("manualRematchRoom concurrency (Phase 5)", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("two simultaneous rematch requests produce exactly one new game", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "DoubleRematch", 2);
    const guest = await createPlayer(db, "s2");
    await joinRoomAndMaybeAutoStart(db, room.id, guest.id, "Guest");
    await completeFirstGame(db, room.id);

    const [r1, r2] = await Promise.all([
      manualRematchRoom(db, room.id),
      manualRematchRoom(db, room.id),
    ]);
    const started = [r1, r2].filter((r) => r.kind === "started");
    const other = [r1, r2].find((r) => r.kind !== "started");
    expect(started).toHaveLength(1);
    expect(other).toEqual({ kind: "not_between_games" });

    const games = await db.selectFrom("games").selectAll().where("room_id", "=", room.id).execute();
    expect(games).toHaveLength(2); // the original game plus exactly one rematch
  });

  it("a rematch request after the room already transitioned to in_game is safely rejected", async () => {
    const db = await getTestDb();
    const host = await createPlayer(db, "s1");
    const room = await createTestRoom(db, host.id, "AlreadyRematched", 2);
    const guest = await createPlayer(db, "s2");
    await joinRoomAndMaybeAutoStart(db, room.id, guest.id, "Guest");
    await completeFirstGame(db, room.id);
    await manualRematchRoom(db, room.id); // room is now in_game again

    const outcome = await manualRematchRoom(db, room.id);
    expect(outcome).toEqual({ kind: "not_between_games" });

    const games = await db.selectFrom("games").selectAll().where("room_id", "=", room.id).execute();
    expect(games).toHaveLength(2);
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
