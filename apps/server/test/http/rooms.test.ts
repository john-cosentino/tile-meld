import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { SESSION_COOKIE_NAME } from "../../src/security/session.js";
import type { AppInstance } from "../../src/http/types.js";

const TEST_ENV = {
  NODE_ENV: "test" as const,
  PORT: 0,
  DATABASE_URL: "unused-app-owns-its-own-db-handle",
  SESSION_TOKEN_HMAC_SECRET: "test-hmac-secret-at-least-32-characters-long",
};

let usernameCounter = 0;
function nextTestUsername(): string {
  usernameCounter += 1;
  return `tester${usernameCounter}`;
}

/** Creates a fresh identity and claims a username for it -- room creation
 * (Phase 2) requires a claimed username, so every test player needs one
 * regardless of whether the test cares about its exact value. Pass an
 * explicit `username` only where a test asserts on the resulting display
 * name; otherwise a unique generated one is used. */
async function newPlayer(
  app: AppInstance,
  username: string = nextTestUsername(),
): Promise<{ playerId: string; cookie: string; username: string }> {
  const response = await app.inject({ method: "POST", url: "/api/identity", payload: {} });
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!;
  const cookieHeader = `${SESSION_COOKIE_NAME}=${cookie.value}`;
  await app.inject({
    method: "POST",
    url: "/api/identity/username",
    headers: { cookie: cookieHeader },
    payload: { username },
  });
  return { playerId: response.json().playerId, cookie: cookieHeader, username };
}

async function getRoomJson(app: AppInstance, cookie: string, roomId: string) {
  const response = await app.inject({
    method: "GET",
    url: `/api/rooms/${roomId}`,
    headers: { cookie },
  });
  return response.json();
}

describe("room lifecycle routes", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  describe("POST /api/rooms (create)", () => {
    it("creates a room and makes the creator its host, named after the creator's username", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app, "Roomo");

      const response = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: { displayName: "Host", capacity: 3, visibility: "public", turnLimitHours: 12 },
      });
      expect(response.statusCode).toBe(200);
      const { roomId, code, name } = response.json();
      expect(typeof roomId).toBe("string");
      expect(typeof code).toBe("string");
      // Public room -> public_ prefix.
      expect(name).toBe("public_Roomo");

      const room = await db
        .selectFrom("rooms")
        .selectAll()
        .where("id", "=", roomId)
        .executeTakeFirstOrThrow();
      const members = await db
        .selectFrom("room_members")
        .selectAll()
        .where("room_id", "=", roomId)
        .execute();
      expect(members).toHaveLength(1);
      expect(room.host_room_member_id).toBe(members[0]!.id);
      expect(room.status).toBe("open");
      expect(room.name).toBe("public_Roomo");
      // The host's display name comes from the username, not the
      // backward-compat-only displayName field ("Host") submitted above.
      expect(members[0]!.display_name).toBe("Roomo");

      await app.close();
    });

    it("names a private room after the bare username (no public_ prefix)", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app, "Priva");

      const response = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: { displayName: "X", capacity: 2, visibility: "private", turnLimitHours: 4 },
      });
      expect(response.json().name).toBe("Priva");

      await app.close();
    });

    it("numbers a second and third room from the same creator with the smallest available suffix", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app, "Numo");

      const names: (string | null)[] = [];
      for (let i = 0; i < 3; i++) {
        const response = await app.inject({
          method: "POST",
          url: "/api/rooms",
          headers: { cookie: host.cookie },
          payload: { displayName: "X", capacity: 2, visibility: "private", turnLimitHours: 4 },
        });
        names.push(response.json().name);
      }
      expect(names).toEqual(["Numo", "Numo 1", "Numo 2"]);

      await app.close();
    });

    it("rejects creation when the identity has no claimed username", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const identity = await app.inject({ method: "POST", url: "/api/identity", payload: {} });
      const cookie = identity.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!;
      const cookieHeader = `${SESSION_COOKIE_NAME}=${cookie.value}`;

      const response = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: cookieHeader },
        payload: { displayName: "Host", capacity: 2, visibility: "private", turnLimitHours: 4 },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("username_required");

      // No partial room or membership row was created.
      const rooms = await db.selectFrom("rooms").selectAll().execute();
      expect(rooms).toHaveLength(0);
      const members = await db.selectFrom("room_members").selectAll().execute();
      expect(members).toHaveLength(0);

      await app.close();
    });
  });

  describe("POST /api/rooms/join", () => {
    async function createRoom(
      app: AppInstance,
      cookie: string,
      overrides: Partial<Record<string, unknown>> = {},
    ) {
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie },
        payload: {
          displayName: "Host",
          capacity: 2,
          visibility: "private",
          turnLimitHours: 4,
          ...overrides,
        },
      });
      return response.json() as { roomId: string; code: string };
    }

    it("joins a room by code and creates a room member", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const { code, roomId } = await createRoom(app, host.cookie);
      const joiner = await newPlayer(app);

      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: joiner.cookie },
        payload: { code, displayName: "Joiner" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ roomId });

      const members = await db
        .selectFrom("room_members")
        .selectAll()
        .where("room_id", "=", roomId)
        .execute();
      expect(members).toHaveLength(2);

      await app.close();
    });

    it("is idempotent for a player who already joined (reconnect support)", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const { code, roomId } = await createRoom(app, host.cookie);
      const joiner = await newPlayer(app);

      await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: joiner.cookie },
        payload: { code, displayName: "Joiner" },
      });
      const second = await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: joiner.cookie },
        payload: { code, displayName: "Joiner" },
      });
      expect(second.statusCode).toBe(200);
      expect(second.json()).toEqual({ roomId });

      const members = await db
        .selectFrom("room_members")
        .selectAll()
        .where("room_id", "=", roomId)
        .execute();
      expect(members).toHaveLength(2); // not 3 -- no duplicate row

      await app.close();
    });

    it("rejects a duplicate display name within the same room", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      // The host's display name now comes from the claimed username, not
      // the (backward-compat-only) displayName field.
      const host = await newPlayer(app, "SameName");
      const { code } = await createRoom(app, host.cookie);
      const joiner = await newPlayer(app);

      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: joiner.cookie },
        payload: { code, displayName: "SameName" },
      });
      expect(response.statusCode).toBe(409);

      await app.close();
    });

    it("allows the same display name in two different rooms (uniqueness is per-room, not global)", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const hostA = await newPlayer(app);
      const hostB = await newPlayer(app);
      const joinerA = await newPlayer(app);
      const joinerB = await newPlayer(app);

      // Joiner display names remain freely settable and are unique only
      // per-room -- host names can no longer collide by construction, since
      // they now come from globally-unique usernames.
      const roomA = await createRoom(app, hostA.cookie);
      const roomB = await createRoom(app, hostB.cookie);
      const joinA = await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: joinerA.cookie },
        payload: { code: roomA.code, displayName: "Same" },
      });
      const joinB = await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: joinerB.cookie },
        payload: { code: roomB.code, displayName: "Same" },
      });
      expect(joinA.statusCode).toBe(200);
      expect(joinB.statusCode).toBe(200);
      expect(roomA.roomId).not.toBe(roomB.roomId);

      await app.close();
    });

    it("rejects joining a full room", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const { code } = await createRoom(app, host.cookie, { capacity: 2 });
      const joinerA = await newPlayer(app);
      const joinerB = await newPlayer(app);

      await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: joinerA.cookie },
        payload: { code, displayName: "A" },
      });
      // Room now has 2 members (host + A) at capacity 2 -- full.
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: joinerB.cookie },
        payload: { code, displayName: "B" },
      });
      expect(response.statusCode).toBe(409);

      await app.close();
    });

    it("returns 404 for an unknown room code", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const joiner = await newPlayer(app);

      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: joiner.cookie },
        payload: { code: "NOSUCHROOM", displayName: "X" },
      });
      expect(response.statusCode).toBe(404);

      await app.close();
    });
  });

  describe("GET /api/rooms/:id", () => {
    it("returns room details, member readiness, host, and the latest game id", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app, "Host");
      // displayName deliberately differs from the claimed username, to
      // prove it is ignored server-side for the host's display name.
      // Capacity 3 (not 2): the room must stay "open" after just the host
      // and one guest join, so the manual ready/start sequence below can
      // still be exercised below capacity (Phase 4 -- a 2-player room would
      // auto-start on the second join instead).
      const created = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: {
          displayName: "IgnoredDisplayName",
          capacity: 3,
          visibility: "private",
          turnLimitHours: 4,
        },
      });
      const { roomId, code, name } = created.json();
      expect(name).toBe("Host");
      const guest = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: guest.cookie },
        payload: { code, displayName: "Guest" },
      });

      const before = await app.inject({
        method: "GET",
        url: `/api/rooms/${roomId}`,
        headers: { cookie: host.cookie },
      });
      expect(before.statusCode).toBe(200);
      const beforeBody = before.json();
      expect(beforeBody.name).toBe("Host");
      expect(beforeBody.hostPlayerId).toBe(host.playerId);
      expect(beforeBody.status).toBe("open");
      expect(beforeBody.latestGameId).toBeNull();
      // Phase 6 (dashboard read model): no latest game yet, so both
      // game-derived fields are null; hasComputer/lastActivityAt are always
      // present regardless of game state.
      expect(beforeBody.latestGameStatus).toBeNull();
      expect(beforeBody.selfSeatStatus).toBeNull();
      expect(beforeBody.hasComputer).toBe(false);
      expect(typeof beforeBody.lastActivityAt).toBe("string");
      // The host's display name comes from the claimed username, not the
      // (backward-compat-only) displayName field submitted at creation.
      expect(beforeBody.members).toEqual(
        expect.arrayContaining([
          { playerId: host.playerId, displayName: "Host", isReady: false, isComputer: false },
          { playerId: guest.playerId, displayName: "Guest", isReady: false, isComputer: false },
        ]),
      );

      for (const p of [host, guest]) {
        await app.inject({
          method: "POST",
          url: `/api/rooms/${roomId}/ready`,
          headers: { cookie: p.cookie },
          payload: { ready: true },
        });
      }
      const started = await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/start`,
        headers: { cookie: host.cookie },
      });
      const { gameId } = started.json();

      const after = await app.inject({
        method: "GET",
        url: `/api/rooms/${roomId}`,
        headers: { cookie: guest.cookie },
      });
      const afterBody = after.json();
      expect(afterBody.status).toBe("in_game");
      expect(afterBody.latestGameId).toBe(gameId);
      // Phase 6: once a game is dealt, both fields reflect it -- a freshly
      // dealt game always starts with every seat active.
      expect(afterBody.latestGameStatus).toBe("active");
      expect(afterBody.selfSeatStatus).toBe("active");

      await app.close();
    });

    it("rejects a non-member", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: { displayName: "Host", capacity: 2, visibility: "private", turnLimitHours: 4 },
      });
      const { roomId } = created.json();
      const outsider = await newPlayer(app);

      const response = await app.inject({
        method: "GET",
        url: `/api/rooms/${roomId}`,
        headers: { cookie: outsider.cookie },
      });
      expect(response.statusCode).toBe(403);

      await app.close();
    });
  });

  describe("GET /api/rooms/:id -- Phase 6 dashboard read-model fields", () => {
    async function createPrivateRoom(app: AppInstance, cookie: string, capacity: 2 | 3 | 4 = 2) {
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie },
        payload: { displayName: "unused", capacity, visibility: "private", turnLimitHours: 4 },
      });
      return response.json() as { roomId: string; code: string };
    }

    it("classifies an open room: no game yet, host and only member", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const { roomId } = await createPrivateRoom(app, host.cookie, 3);

      const body = await getRoomJson(app, host.cookie, roomId);
      expect(body.status).toBe("open");
      expect(body.latestGameId).toBeNull();
      expect(body.latestGameStatus).toBeNull();
      expect(body.selfSeatStatus).toBeNull();
      expect(body.hasComputer).toBe(false);
      expect(body.visibility).toBe("private");

      await app.close();
    });

    it("classifies an active room: capacity-triggered auto-start deals the latest active game", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const { roomId, code } = await createPrivateRoom(app, host.cookie, 2);
      const guest = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: guest.cookie },
        payload: { code, displayName: "Guest" },
      }); // auto-starts at capacity 2

      const hostBody = await getRoomJson(app, host.cookie, roomId);
      const guestBody = await getRoomJson(app, guest.cookie, roomId);
      expect(hostBody.status).toBe("in_game");
      expect(hostBody.latestGameStatus).toBe("active");
      expect(hostBody.selfSeatStatus).toBe("active");
      // Each player only ever sees their OWN seat status, never a
      // roommate's -- both are "active" here, but they're independently
      // computed per caller (verified more directly by the resign test
      // below, where the two callers' selfSeatStatus values diverge).
      expect(guestBody.selfSeatStatus).toBe("active");

      await app.close();
    });

    it("classifies a completed game the player finished without resigning", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const { roomId, code } = await createPrivateRoom(app, host.cookie, 2);
      const guest = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: guest.cookie },
        payload: { code, displayName: "Guest" },
      });
      const roomBefore = await getRoomJson(app, host.cookie, roomId);
      const gameId = roomBefore.latestGameId as string;

      // Directly transition the game to completed (mirrors the established
      // pattern in roomStart.test.ts/rooms.test.ts of driving room/game
      // state directly rather than through real gameplay, which this
      // read-model test has no need to exercise).
      await db
        .updateTable("games")
        .set({ status: "completed", completed_at: new Date(), winner_seat: 0 })
        .where("id", "=", gameId)
        .execute();
      await db
        .updateTable("rooms")
        .set({ status: "between_games" })
        .where("id", "=", roomId)
        .execute();

      const body = await getRoomJson(app, host.cookie, roomId);
      expect(body.status).toBe("between_games");
      expect(body.latestGameStatus).toBe("completed");
      expect(body.selfSeatStatus).toBe("active"); // finished, never resigned

      await app.close();
    });

    it("classifies the current player's own resignation from the latest completed game", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const { roomId, code } = await createPrivateRoom(app, host.cookie, 2);
      const guest = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: guest.cookie },
        payload: { code, displayName: "Guest" },
      });
      const roomBefore = await getRoomJson(app, host.cookie, roomId);
      const gameId = roomBefore.latestGameId as string;

      await db
        .updateTable("game_seats")
        .set({ status: "resigned" })
        .where("game_id", "=", gameId)
        .where("player_id", "=", guest.playerId)
        .execute();
      await db
        .updateTable("games")
        .set({ status: "completed", completed_at: new Date(), winner_seat: 0 })
        .where("id", "=", gameId)
        .execute();
      await db
        .updateTable("rooms")
        .set({ status: "between_games" })
        .where("id", "=", roomId)
        .execute();

      const guestBody = await getRoomJson(app, guest.cookie, roomId);
      const hostBody = await getRoomJson(app, host.cookie, roomId);
      expect(guestBody.selfSeatStatus).toBe("resigned");
      // The host's own seat was never touched -- resignation is per-seat,
      // never leaks onto another player's status.
      expect(hostBody.selfSeatStatus).toBe("active");

      await app.close();
    });

    it("an active rematch overrides prior resigned/completed state for the same room", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const { roomId, code } = await createPrivateRoom(app, host.cookie, 2);
      const guest = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: guest.cookie },
        payload: { code, displayName: "Guest" },
      });
      const firstGameId = (await getRoomJson(app, host.cookie, roomId)).latestGameId as string;
      await db
        .updateTable("game_seats")
        .set({ status: "resigned" })
        .where("game_id", "=", firstGameId)
        .where("player_id", "=", guest.playerId)
        .execute();
      await db
        .updateTable("games")
        .set({ status: "completed", completed_at: new Date(), winner_seat: 0 })
        .where("id", "=", firstGameId)
        .execute();
      await db
        .updateTable("rooms")
        .set({ status: "between_games" })
        .where("id", "=", roomId)
        .execute();
      expect((await getRoomJson(app, guest.cookie, roomId)).selfSeatStatus).toBe("resigned");

      const rematch = await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/rematch`,
        headers: { cookie: host.cookie },
      });
      const secondGameId = rematch.json().gameId as string;
      expect(secondGameId).not.toBe(firstGameId);

      const guestBody = await getRoomJson(app, guest.cookie, roomId);
      expect(guestBody.status).toBe("in_game");
      expect(guestBody.latestGameId).toBe(secondGameId);
      expect(guestBody.latestGameStatus).toBe("active");
      // The new game seats everyone fresh -- the prior resignation does not
      // carry over (game_seats is per-game, one-click rematch reseats
      // every current member -- see docs/phase-05-rematch.md).
      expect(guestBody.selfSeatStatus).toBe("active");

      await app.close();
    });

    it("classifies a terminal (abandoned) room", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const { roomId } = await createPrivateRoom(app, host.cookie, 2);
      // Solo host leaving an otherwise-empty room marks it abandoned
      // (POST /api/rooms/:id/leave -- host succession).
      // The host must still be able to read it: a room row is never
      // deleted just because it's abandoned in this phase's read model.
      await db.updateTable("rooms").set({ status: "abandoned" }).where("id", "=", roomId).execute();

      const body = await getRoomJson(app, host.cookie, roomId);
      expect(body.status).toBe("abandoned");

      await app.close();
    });

    it("flags a Play vs Computer room with hasComputer", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const human = await newPlayer(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/rooms/vs-computer",
        headers: { cookie: human.cookie },
        payload: { displayName: "unused" },
      });
      const { roomId } = created.json();

      const body = await getRoomJson(app, human.cookie, roomId);
      expect(body.hasComputer).toBe(true);
      expect(body.visibility).toBe("private");

      await app.close();
    });

    it("reports visibility correctly for both a public and a private room belonging to the same player", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const publicRoom = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: { displayName: "unused", capacity: 2, visibility: "public", turnLimitHours: 4 },
      });
      const privateRoom = await createPrivateRoom(app, host.cookie);

      expect((await getRoomJson(app, host.cookie, publicRoom.json().roomId)).visibility).toBe(
        "public",
      );
      expect((await getRoomJson(app, host.cookie, privateRoom.roomId)).visibility).toBe("private");

      await app.close();
    });

    it("renders a legacy room with name = null without erroring", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const { roomId } = await createPrivateRoom(app, host.cookie);
      // Simulates a room created before Phase 2's naming column existed --
      // no production path can produce this today, but the column is
      // nullable specifically for this legacy case (docs/phase-02-friendly-
      // room-names.md).
      await db.updateTable("rooms").set({ name: null }).where("id", "=", roomId).execute();

      const body = await getRoomJson(app, host.cookie, roomId);
      expect(body.name).toBeNull();
      expect(body.code).toMatch(/^[A-Z0-9]+$/);

      await app.close();
    });

    it("selects the highest-seq game as latestGame when a room has multiple game sequences", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const { roomId, code } = await createPrivateRoom(app, host.cookie, 2);
      const guest = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: guest.cookie },
        payload: { code, displayName: "Guest" },
      });
      const firstGameId = (await getRoomJson(app, host.cookie, roomId)).latestGameId as string;
      await db
        .updateTable("games")
        .set({ status: "completed", completed_at: new Date() })
        .where("id", "=", firstGameId)
        .execute();
      await db
        .updateTable("rooms")
        .set({ status: "between_games" })
        .where("id", "=", roomId)
        .execute();

      const rematch = await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/rematch`,
        headers: { cookie: host.cookie },
      });
      const secondGameId = rematch.json().gameId as string;

      const body = await getRoomJson(app, host.cookie, roomId);
      expect(body.latestGameId).toBe(secondGameId);
      expect(body.latestGameId).not.toBe(firstGameId);

      await app.close();
    });

    it("never returns another player's room, and exposes no recovery secrets, session tokens, or rack contents", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const { roomId, code } = await createPrivateRoom(app, host.cookie, 2);
      const guest = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: guest.cookie },
        payload: { code, displayName: "Guest" },
      });
      const outsider = await newPlayer(app);

      const forbidden = await app.inject({
        method: "GET",
        url: `/api/rooms/${roomId}`,
        headers: { cookie: outsider.cookie },
      });
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json()).not.toHaveProperty("members");
      expect(forbidden.json()).not.toHaveProperty("latestGameId");

      const authorized = await app.inject({
        method: "GET",
        url: `/api/rooms/${roomId}`,
        headers: { cookie: host.cookie },
      });
      const serialized = JSON.stringify(authorized.json());
      expect(serialized).not.toContain("recovery");
      expect(serialized).not.toContain("recoverySecret");
      expect(serialized).not.toMatch(/session/i);
      // No rack/tile data of any kind belongs in a room summary at all.
      expect(serialized).not.toContain("tileId");
      expect(serialized).not.toContain("rack");

      await app.close();
    });
  });

  describe("GET /api/rooms/public", () => {
    it("lists only open public rooms, with member display names/count/capacity/turn limit, no secrets", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const publicHost = await newPlayer(app, "PublicHost");
      const privateHost = await newPlayer(app, "PrivateHost");
      const viewer = await newPlayer(app);

      await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: publicHost.cookie },
        payload: {
          displayName: "PublicHost",
          capacity: 4,
          visibility: "public",
          turnLimitHours: 8,
        },
      });
      await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: privateHost.cookie },
        payload: {
          displayName: "PrivateHost",
          capacity: 2,
          visibility: "private",
          turnLimitHours: 4,
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/rooms/public",
        headers: { cookie: viewer.cookie },
      });
      expect(response.statusCode).toBe(200);
      const { rooms } = response.json();
      expect(rooms).toHaveLength(1);
      expect(rooms[0]).toMatchObject({
        name: "public_PublicHost",
        memberDisplayNames: ["PublicHost"],
        memberCount: 1,
        capacity: 4,
        turnLimitHours: 8,
      });
      expect(JSON.stringify(rooms)).not.toContain("recovery");
      expect(JSON.stringify(rooms)).not.toContain("host_room_member_id");

      await app.close();
    });

    it("paginates via limit/offset", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const viewer = await newPlayer(app);

      for (let i = 0; i < 3; i++) {
        const host = await newPlayer(app);
        await app.inject({
          method: "POST",
          url: "/api/rooms",
          headers: { cookie: host.cookie },
          payload: {
            displayName: `Host${i}`,
            capacity: 2,
            visibility: "public",
            turnLimitHours: 4,
          },
        });
      }

      const page1 = await app.inject({
        method: "GET",
        url: "/api/rooms/public?limit=2&offset=0",
        headers: { cookie: viewer.cookie },
      });
      const page2 = await app.inject({
        method: "GET",
        url: "/api/rooms/public?limit=2&offset=2",
        headers: { cookie: viewer.cookie },
      });
      expect(page1.json().rooms).toHaveLength(2);
      expect(page2.json().rooms).toHaveLength(1);

      await app.close();
    });
  });

  describe("POST /api/rooms/quick-join", () => {
    it("joins an eligible public room automatically", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: { displayName: "Host", capacity: 3, visibility: "public", turnLimitHours: 4 },
      });
      const { roomId } = created.json();
      const joiner = await newPlayer(app);

      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/quick-join",
        headers: { cookie: joiner.cookie },
        payload: { displayName: "Joiner" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ roomId });

      await app.close();
    });

    it("returns 404 when no eligible public room exists", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const joiner = await newPlayer(app);

      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/quick-join",
        headers: { cookie: joiner.cookie },
        payload: { displayName: "Joiner" },
      });
      expect(response.statusCode).toBe(404);

      await app.close();
    });

    it("skips a full public room", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: { displayName: "Host", capacity: 2, visibility: "public", turnLimitHours: 4 },
      });
      const filler = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/rooms/quick-join",
        headers: { cookie: filler.cookie },
        payload: { displayName: "Filler" },
      });
      // Room is now full (capacity 2, 2 members).
      const joiner = await newPlayer(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/quick-join",
        headers: { cookie: joiner.cookie },
        payload: { displayName: "Joiner" },
      });
      expect(response.statusCode).toBe(404);

      await app.close();
    });
  });

  describe("POST /api/rooms/:id/ready", () => {
    it("toggles readiness for a member", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: { displayName: "Host", capacity: 2, visibility: "private", turnLimitHours: 4 },
      });
      const { roomId } = created.json();

      const response = await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/ready`,
        headers: { cookie: host.cookie },
        payload: { ready: true },
      });
      expect(response.statusCode).toBe(200);

      const member = await db
        .selectFrom("room_members")
        .selectAll()
        .where("room_id", "=", roomId)
        .executeTakeFirstOrThrow();
      expect(member.is_ready).toBe(true);

      await app.close();
    });

    it("rejects a non-member", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: { displayName: "Host", capacity: 2, visibility: "private", turnLimitHours: 4 },
      });
      const { roomId } = created.json();
      const outsider = await newPlayer(app);

      const response = await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/ready`,
        headers: { cookie: outsider.cookie },
        payload: { ready: true },
      });
      expect(response.statusCode).toBe(403);

      await app.close();
    });
  });

  describe("POST /api/rooms/:id/leave -- host succession", () => {
    it("transfers host to the longest-present remaining member when the host leaves", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: { displayName: "Host", capacity: 4, visibility: "private", turnLimitHours: 4 },
      });
      const { roomId, code } = created.json();

      const second = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: second.cookie },
        payload: { code, displayName: "Second" },
      });
      const third = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: third.cookie },
        payload: { code, displayName: "Third" },
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/leave`,
        headers: { cookie: host.cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ newHostPlayerId: second.playerId });

      const room = await db
        .selectFrom("rooms")
        .selectAll()
        .where("id", "=", roomId)
        .executeTakeFirstOrThrow();
      const secondMember = await db
        .selectFrom("room_members")
        .selectAll()
        .where("room_id", "=", roomId)
        .where("player_id", "=", second.playerId)
        .executeTakeFirstOrThrow();
      expect(room.host_room_member_id).toBe(secondMember.id);

      await app.close();
    });

    it("does not change the host when a non-host member leaves", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: { displayName: "Host", capacity: 3, visibility: "private", turnLimitHours: 4 },
      });
      const { roomId, code } = created.json();
      const second = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: second.cookie },
        payload: { code, displayName: "Second" },
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/leave`,
        headers: { cookie: second.cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ newHostPlayerId: null });

      const room = await db
        .selectFrom("rooms")
        .selectAll()
        .where("id", "=", roomId)
        .executeTakeFirstOrThrow();
      const hostMember = await db
        .selectFrom("room_members")
        .selectAll()
        .where("room_id", "=", roomId)
        .where("player_id", "=", host.playerId)
        .executeTakeFirstOrThrow();
      expect(room.host_room_member_id).toBe(hostMember.id);

      await app.close();
    });

    it("marks the room abandoned when the last member leaves", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: { displayName: "Host", capacity: 2, visibility: "private", turnLimitHours: 4 },
      });
      const { roomId } = created.json();

      await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/leave`,
        headers: { cookie: host.cookie },
      });

      const room = await db
        .selectFrom("rooms")
        .selectAll()
        .where("id", "=", roomId)
        .executeTakeFirstOrThrow();
      expect(room.status).toBe("abandoned");

      await app.close();
    });
  });

  describe("POST /api/rooms/:id/start", () => {
    async function setUpRoomWithTwoReadyMembers(app: AppInstance) {
      const host = await newPlayer(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: { displayName: "Host", capacity: 3, visibility: "private", turnLimitHours: 4 },
      });
      const { roomId, code } = created.json();
      const second = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: second.cookie },
        payload: { code, displayName: "Second" },
      });
      await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/ready`,
        headers: { cookie: host.cookie },
        payload: { ready: true },
      });
      await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/ready`,
        headers: { cookie: second.cookie },
        payload: { ready: true },
      });
      return { roomId, host, second };
    }

    it("deals a game, sets the room in_game, and resets readiness", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const { roomId, host } = await setUpRoomWithTwoReadyMembers(app);

      const response = await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/start`,
        headers: { cookie: host.cookie },
      });
      expect(response.statusCode).toBe(200);
      const { gameId } = response.json();
      expect(typeof gameId).toBe("string");

      const room = await db
        .selectFrom("rooms")
        .selectAll()
        .where("id", "=", roomId)
        .executeTakeFirstOrThrow();
      expect(room.status).toBe("in_game");

      const members = await db
        .selectFrom("room_members")
        .selectAll()
        .where("room_id", "=", roomId)
        .execute();
      expect(members.every((m) => m.is_ready === false)).toBe(true);

      const seats = await db
        .selectFrom("game_seats")
        .selectAll()
        .where("game_id", "=", gameId)
        .execute();
      expect(seats).toHaveLength(2);
      const racks = await db
        .selectFrom("racks")
        .selectAll()
        .where("game_id", "=", gameId)
        .execute();
      expect(racks.every((r) => r.tiles.length === 14)).toBe(true);

      await app.close();
    });

    it("rejects a non-host", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const { roomId, second } = await setUpRoomWithTwoReadyMembers(app);

      const response = await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/start`,
        headers: { cookie: second.cookie },
      });
      expect(response.statusCode).toBe(403);

      await app.close();
    });

    it("rejects starting with fewer than 2 ready members", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: { displayName: "Host", capacity: 3, visibility: "private", turnLimitHours: 4 },
      });
      const { roomId } = created.json();
      await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/ready`,
        headers: { cookie: host.cookie },
        payload: { ready: true },
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/start`,
        headers: { cookie: host.cookie },
      });
      expect(response.statusCode).toBe(409);

      await app.close();
    });

    it("rejects starting a room that is not open", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const { roomId, host } = await setUpRoomWithTwoReadyMembers(app);
      await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/start`,
        headers: { cookie: host.cookie },
      });

      // Room is now in_game -- starting again should fail.
      const response = await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/start`,
        headers: { cookie: host.cookie },
      });
      expect(response.statusCode).toBe(409);

      await app.close();
    });
  });

  describe("POST /api/rooms/:id/rematch (Phase 5 -- one-click rematch)", () => {
    it("starts a new game with an incremented seq, seating every current member without requiring readiness", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      // Capacity 4 (not 3): only 3 members ever join, so the room stays
      // below capacity and "open" throughout -- the manual Start below
      // controls readiness explicitly (Phase 4 -- filling to exact capacity
      // would auto-start with every current member instead).
      const created = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: { displayName: "Host", capacity: 4, visibility: "private", turnLimitHours: 4 },
      });
      const { roomId, code } = created.json();
      const second = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: second.cookie },
        payload: { code, displayName: "Second" },
      });
      const third = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: third.cookie },
        payload: { code, displayName: "Third" },
      });

      for (const p of [host, second]) {
        await app.inject({
          method: "POST",
          url: `/api/rooms/${roomId}/ready`,
          headers: { cookie: p.cookie },
          payload: { ready: true },
        });
      }
      const firstGame = await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/start`,
        headers: { cookie: host.cookie },
      });
      const { gameId: firstGameId } = firstGame.json();

      // Manually transition the room to between_games, as the plan's state
      // machine expects before a rematch is allowed (a real game completion
      // does this via game/turnActions.ts, exercised elsewhere).
      await db
        .updateTable("rooms")
        .set({ status: "between_games" })
        .where("id", "=", roomId)
        .execute();

      // Nobody re-readies -- Phase 5's one-click rematch must seat host,
      // second, AND third anyway (the third seat never even joined the
      // first game, since it started below capacity).
      const rematch = await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/rematch`,
        headers: { cookie: host.cookie },
      });
      expect(rematch.statusCode).toBe(200);
      const { gameId: secondGameId } = rematch.json();
      expect(secondGameId).not.toBe(firstGameId);

      const secondGame = await db
        .selectFrom("games")
        .selectAll()
        .where("id", "=", secondGameId)
        .executeTakeFirstOrThrow();
      expect(secondGame.seq).toBe(2);

      const secondGameSeats = await db
        .selectFrom("game_seats")
        .select(["player_id"])
        .where("game_id", "=", secondGameId)
        .execute();
      const seatPlayerIds = secondGameSeats.map((s) => s.player_id).sort();
      expect(seatPlayerIds).toEqual([host.playerId, second.playerId, third.playerId].sort());

      const room = await getRoomJson(app, host.cookie, roomId);
      expect(room.status).toBe("in_game");
      expect(room.latestGameId).toBe(secondGameId);
      expect(room.members.every((m: { isReady: boolean }) => m.isReady === false)).toBe(true);

      // room_members persist across the rematch.
      const members = await db
        .selectFrom("room_members")
        .selectAll()
        .where("room_id", "=", roomId)
        .execute();
      expect(members).toHaveLength(3);

      // First game's seats are untouched, immutable history.
      const firstGameSeats = await db
        .selectFrom("game_seats")
        .selectAll()
        .where("game_id", "=", firstGameId)
        .execute();
      expect(firstGameSeats).toHaveLength(2);

      await app.close();
    });

    it("rejects a rematch when the room is not between_games", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: { displayName: "Host", capacity: 2, visibility: "private", turnLimitHours: 4 },
      });
      const { roomId } = created.json();

      const response = await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/rematch`,
        headers: { cookie: host.cookie },
      });
      expect(response.statusCode).toBe(409); // still "open", not between_games

      await app.close();
    });

    it("rejects a non-host caller", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: { displayName: "Host", capacity: 2, visibility: "private", turnLimitHours: 4 },
      });
      const { roomId, code } = created.json();
      const guest = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: guest.cookie },
        payload: { code, displayName: "Guest" },
      }); // auto-starts (capacity 2)
      await db
        .updateTable("rooms")
        .set({ status: "between_games" })
        .where("id", "=", roomId)
        .execute();

      const response = await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/rematch`,
        headers: { cookie: guest.cookie },
      });
      expect(response.statusCode).toBe(403);

      await app.close();
    });

    it("rejects a rematch with fewer than 2 eligible members remaining", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: { displayName: "Host", capacity: 3, visibility: "private", turnLimitHours: 4 },
      });
      const { roomId, code } = created.json();
      const guest = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: guest.cookie },
        payload: { code, displayName: "Guest" },
      });
      await db
        .updateTable("rooms")
        .set({ status: "between_games" })
        .where("id", "=", roomId)
        .execute();
      await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/leave`,
        headers: { cookie: guest.cookie },
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/rematch`,
        headers: { cookie: host.cookie },
      });
      expect(response.statusCode).toBe(409);

      await app.close();
    });

    it("two concurrent rematch requests produce exactly one new game (database as final arbiter)", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const host = await newPlayer(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: { displayName: "Host", capacity: 2, visibility: "private", turnLimitHours: 4 },
      });
      const { roomId, code } = created.json();
      const guest = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: guest.cookie },
        payload: { code, displayName: "Guest" },
      }); // auto-starts
      await db
        .updateTable("rooms")
        .set({ status: "between_games" })
        .where("id", "=", roomId)
        .execute();

      const [r1, r2] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/api/rooms/${roomId}/rematch`,
          headers: { cookie: host.cookie },
        }),
        app.inject({
          method: "POST",
          url: `/api/rooms/${roomId}/rematch`,
          headers: { cookie: host.cookie },
        }),
      ]);
      const succeeded = [r1, r2].filter((r) => r.statusCode === 200);
      const failed = [r1, r2].filter((r) => r.statusCode !== 200);
      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0]!.statusCode).toBe(409);

      const games = await db
        .selectFrom("games")
        .selectAll()
        .where("room_id", "=", roomId)
        .execute();
      expect(games).toHaveLength(2); // the original auto-started game plus exactly one rematch

      await app.close();
    });
  });
});
