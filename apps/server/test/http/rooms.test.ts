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
      const created = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { cookie: host.cookie },
        payload: {
          displayName: "IgnoredDisplayName",
          capacity: 2,
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

  describe("POST /api/rooms/:id/rematch", () => {
    it("starts a new game with an incremented seq, excluding unready members, preserving room_members", async () => {
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

      // Simulate Phase 5 completing the game (not built yet) by manually
      // transitioning the room to between_games, as the plan's state
      // machine expects before a rematch is allowed.
      await db
        .updateTable("rooms")
        .set({ status: "between_games" })
        .where("id", "=", roomId)
        .execute();

      // This time, only host + third are ready -- second (unready) must
      // be excluded, matching D-REMATCH ("no auto-enrollment").
      await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/ready`,
        headers: { cookie: host.cookie },
        payload: { ready: true },
      });
      await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/ready`,
        headers: { cookie: third.cookie },
        payload: { ready: true },
      });

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
      expect(seatPlayerIds).toEqual([host.playerId, third.playerId].sort());

      // room_members persist across the rematch (Second is still a member,
      // just not seated in this particular game).
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
  });
});
