import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { SESSION_COOKIE_NAME } from "../../src/security/session.js";
import type { AppInstance } from "../../src/http/types.js";

// Phase 4 -- race-safe auto-start alongside the existing Start Game button.
// HTTP-level route behavior, error messages, and cross-route races; direct
// repository/orchestration-level coverage lives in test/game/roomStart.test.ts.

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

async function createRoom(
  app: AppInstance,
  cookie: string,
  overrides: Partial<Record<string, unknown>> = {},
): Promise<{ roomId: string; code: string; name: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/rooms",
    headers: { cookie },
    payload: {
      displayName: "unused",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
      ...overrides,
    },
  });
  return response.json();
}

async function getRoom(app: AppInstance, cookie: string, roomId: string) {
  const response = await app.inject({
    method: "GET",
    url: `/api/rooms/${roomId}`,
    headers: { cookie },
  });
  return response.json();
}

describe("auto-start via join routes (Phase 4)", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("POST /api/rooms/join-by-name auto-starts a 2-player room on the second join", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app);
    const { roomId, name } = await createRoom(app, host.cookie, { capacity: 2 });
    const guest = await newPlayer(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/join-by-name",
      headers: { cookie: guest.cookie },
      payload: { name },
    });
    expect(response.statusCode).toBe(200);

    const room = await getRoom(app, host.cookie, roomId);
    expect(room.status).toBe("in_game");
    expect(room.latestGameId).not.toBeNull();

    await app.close();
  });

  it("POST /api/rooms/join (legacy code) auto-starts a 2-player room on the second join", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app);
    const { roomId, code } = await createRoom(app, host.cookie, { capacity: 2 });
    const guest = await newPlayer(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/join",
      headers: { cookie: guest.cookie },
      payload: { code, displayName: "Guest" },
    });
    expect(response.statusCode).toBe(200);

    const room = await getRoom(app, host.cookie, roomId);
    expect(room.status).toBe("in_game");
    expect(room.latestGameId).not.toBeNull();

    await app.close();
  });

  it("POST /api/rooms/quick-join auto-starts a 2-player public room on the second join", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app);
    const { roomId } = await createRoom(app, host.cookie, { capacity: 2, visibility: "public" });
    const guest = await newPlayer(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/quick-join",
      headers: { cookie: guest.cookie },
      payload: { displayName: "unused" },
    });
    expect(response.statusCode).toBe(200);

    const room = await getRoom(app, host.cookie, roomId);
    expect(room.status).toBe("in_game");
    expect(room.latestGameId).not.toBeNull();

    await app.close();
  });

  it("a 3-player room shows the correct waiting count and stays open below capacity, then auto-starts at three", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app);
    const { roomId, name } = await createRoom(app, host.cookie, { capacity: 3 });
    const p2 = await newPlayer(app);
    const p3 = await newPlayer(app);

    await app.inject({
      method: "POST",
      url: "/api/rooms/join-by-name",
      headers: { cookie: p2.cookie },
      payload: { name },
    });
    const afterSecond = await getRoom(app, host.cookie, roomId);
    expect(afterSecond.status).toBe("open");
    expect(afterSecond.members).toHaveLength(2);
    expect(afterSecond.capacity).toBe(3);

    await app.inject({
      method: "POST",
      url: "/api/rooms/join-by-name",
      headers: { cookie: p3.cookie },
      payload: { name },
    });
    const afterThird = await getRoom(app, host.cookie, roomId);
    expect(afterThird.status).toBe("in_game");
    expect(afterThird.latestGameId).not.toBeNull();

    await app.close();
  });

  it("a 4-player room stays open at two and three members, then auto-starts at four", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app);
    const { roomId, name } = await createRoom(app, host.cookie, { capacity: 4 });
    const players = [await newPlayer(app), await newPlayer(app), await newPlayer(app)];

    for (const [index, p] of players.entries()) {
      await app.inject({
        method: "POST",
        url: "/api/rooms/join-by-name",
        headers: { cookie: p.cookie },
        payload: { name },
      });
      const room = await getRoom(app, host.cookie, roomId);
      if (index < 2) {
        expect(room.status).toBe("open");
      } else {
        expect(room.status).toBe("in_game");
        expect(room.latestGameId).not.toBeNull();
      }
    }

    await app.close();
  });

  it("a private room auto-starting still shows every seated player their game via the waiting-room poll's data source", async () => {
    // WaitingRoomPage polls GET /api/rooms/:id and navigates once status is
    // in_game and latestGameId is set -- verifies both are correct and
    // identical for host and guest after the guest's join auto-starts.
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app);
    const { roomId, name } = await createRoom(app, host.cookie, { capacity: 2 });
    const guest = await newPlayer(app);
    await app.inject({
      method: "POST",
      url: "/api/rooms/join-by-name",
      headers: { cookie: guest.cookie },
      payload: { name },
    });

    const hostView = await getRoom(app, host.cookie, roomId);
    const guestView = await getRoom(app, guest.cookie, roomId);
    expect(hostView.status).toBe("in_game");
    expect(guestView.status).toBe("in_game");
    expect(hostView.latestGameId).toBe(guestView.latestGameId);
    expect(hostView.latestGameId).not.toBeNull();

    await app.close();
  });
});

describe("manual Start still works after Phase 4's locking (regression)", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("host can manually start a 3-player room early, below capacity", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app);
    const { roomId, name } = await createRoom(app, host.cookie, { capacity: 3 });
    const guest = await newPlayer(app);
    await app.inject({
      method: "POST",
      url: "/api/rooms/join-by-name",
      headers: { cookie: guest.cookie },
      payload: { name },
    });

    for (const p of [host, guest]) {
      await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/ready`,
        headers: { cookie: p.cookie },
        payload: { ready: true },
      });
    }
    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/start`,
      headers: { cookie: host.cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(typeof response.json().gameId).toBe("string");

    const room = await getRoom(app, host.cookie, roomId);
    expect(room.status).toBe("in_game");

    await app.close();
  });

  it("non-host cannot start", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app);
    const { roomId, name } = await createRoom(app, host.cookie, { capacity: 3 });
    const guest = await newPlayer(app);
    await app.inject({
      method: "POST",
      url: "/api/rooms/join-by-name",
      headers: { cookie: guest.cookie },
      payload: { name },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/start`,
      headers: { cookie: guest.cookie },
    });
    expect(response.statusCode).toBe(403);

    await app.close();
  });

  it("rejects starting with insufficient ready members", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app);
    const { roomId } = await createRoom(app, host.cookie, { capacity: 3 });
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

  it("Ready endpoint continues to work", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app);
    const { roomId } = await createRoom(app, host.cookie, { capacity: 3 });

    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/ready`,
      headers: { cookie: host.cookie },
      payload: { ready: true },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ready: true });

    await app.close();
  });
});

describe("cross-route concurrency (Phase 4)", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("legacy code join and exact-name join racing for the final seat remain safe", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app);
    const { roomId, code, name } = await createRoom(app, host.cookie, { capacity: 2 });
    const a = await newPlayer(app);
    const b = await newPlayer(app);

    const [byCode, byName] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: a.cookie },
        payload: { code, displayName: "A" },
      }),
      app.inject({
        method: "POST",
        url: "/api/rooms/join-by-name",
        headers: { cookie: b.cookie },
        payload: { name },
      }),
    ]);

    const statuses = [byCode.statusCode, byName.statusCode].sort();
    expect(statuses).toEqual([200, 404].sort()); // join-by-name's uniform failure is 404

    const members = await db
      .selectFrom("room_members")
      .selectAll()
      .where("room_id", "=", roomId)
      .execute();
    expect(members).toHaveLength(2);

    const games = await db.selectFrom("games").selectAll().where("room_id", "=", roomId).execute();
    expect(games).toHaveLength(1);

    await app.close();
  });

  it("Quick Join racing an exact-name join for the same room remains safe", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app);
    const { roomId, name } = await createRoom(app, host.cookie, {
      capacity: 2,
      visibility: "public",
    });
    const a = await newPlayer(app);
    const b = await newPlayer(app);

    const [quick, byName] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/rooms/quick-join",
        headers: { cookie: a.cookie },
        payload: { displayName: "unused" },
      }),
      app.inject({
        method: "POST",
        url: "/api/rooms/join-by-name",
        headers: { cookie: b.cookie },
        payload: { name },
      }),
    ]);

    const succeeded = [quick, byName].filter((r) => r.statusCode === 200);
    expect(succeeded).toHaveLength(1);

    const members = await db
      .selectFrom("room_members")
      .selectAll()
      .where("room_id", "=", roomId)
      .execute();
    expect(members).toHaveLength(2);

    const games = await db.selectFrom("games").selectAll().where("room_id", "=", roomId).execute();
    expect(games).toHaveLength(1);

    await app.close();
  });

  it("reconnect (repeated join) for an already-seated member remains idempotent after auto-start", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app);
    const { roomId, name } = await createRoom(app, host.cookie, { capacity: 2 });
    const guest = await newPlayer(app);
    await app.inject({
      method: "POST",
      url: "/api/rooms/join-by-name",
      headers: { cookie: guest.cookie },
      payload: { name },
    }); // auto-starts

    // The guest "rejoins" (e.g. a retried request) after the room has
    // already started -- still idempotent, still 200, no new member row.
    const again = await app.inject({
      method: "POST",
      url: "/api/rooms/join-by-name",
      headers: { cookie: guest.cookie },
      payload: { name },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ roomId });

    const members = await db
      .selectFrom("room_members")
      .selectAll()
      .where("room_id", "=", roomId)
      .execute();
    expect(members).toHaveLength(2);

    await app.close();
  });
});

describe("Play vs Computer manual-start regression (Phase 4)", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("a freshly-created vs-computer room stays open, not auto-started, despite both seats existing", async () => {
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

    const room = await getRoom(app, human.cookie, roomId);
    expect(room.status).toBe("open");
    expect(room.latestGameId).toBeNull();
    expect(room.members).toHaveLength(2);

    await app.close();
  });

  it("manual Start still deals the vs-computer game successfully", async () => {
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

    await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/ready`,
      headers: { cookie: human.cookie },
      payload: { ready: true },
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/start`,
      headers: { cookie: human.cookie },
    });
    expect(response.statusCode).toBe(200);

    const controllers = await db
      .selectFrom("game_seats")
      .select(["controller_type"])
      .where("game_id", "=", response.json().gameId)
      .execute();
    expect(controllers.map((c) => c.controller_type).sort()).toEqual(["computer", "human"]);

    await app.close();
  });
});
