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

async function newPlayer(app: AppInstance): Promise<{ playerId: string; cookie: string }> {
  const response = await app.inject({ method: "POST", url: "/api/identity", payload: {} });
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!;
  return { playerId: response.json().playerId, cookie: `${SESSION_COOKIE_NAME}=${cookie.value}` };
}

async function startTwoPlayerGame(app: AppInstance) {
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
  });
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
  return { gameId: started.json().gameId as string, host, guest };
}

describe("GET /api/games/:id", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("returns the redacted view with the caller's own rack in full", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const { gameId, host } = await startTwoPlayerGame(app);

    const response = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}`,
      headers: { cookie: host.cookie },
    });
    expect(response.statusCode).toBe(200);
    const view = response.json();
    expect(view.gameId).toBe(gameId);
    expect(view.self.rack).toHaveLength(14);
    expect(view.opponents).toHaveLength(1);
    expect(view.opponents[0].rackCount).toBe(14);
    expect(view.poolCount).toBe(106 - 2 * 14);
    // deadlineAt must be present on the very first snapshot, not only
    // after a turn:started socket event -- otherwise a client loading the
    // tabletop fresh (or the dashboard, for a game it isn't socket-joined
    // to) has no way to render a countdown.
    expect(typeof view.deadlineAt).toBe("string");
    expect(new Date(view.deadlineAt).getTime()).toBeGreaterThan(Date.now());

    await app.close();
  });

  it("never leaks the opponent's rack contents in the HTTP response", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const { gameId, host, guest } = await startTwoPlayerGame(app);

    const asHost = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}`,
      headers: { cookie: host.cookie },
    });
    const asGuest = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}`,
      headers: { cookie: guest.cookie },
    });

    const hostRackIds: string[] = asHost.json().self.rack.map((t: { tileId: string }) => t.tileId);
    const guestRackIds: string[] = asGuest
      .json()
      .self.rack.map((t: { tileId: string }) => t.tileId);

    // What the host actually sees never contains a tileId only present in
    // the guest's rack, and vice versa.
    for (const id of guestRackIds) {
      expect(asHost.body).not.toContain(id);
    }
    for (const id of hostRackIds) {
      expect(asGuest.body).not.toContain(id);
    }

    await app.close();
  });

  it("rejects a player who is not a seat holder in the game", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const { gameId } = await startTwoPlayerGame(app);
    const outsider = await newPlayer(app);

    const response = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}`,
      headers: { cookie: outsider.cookie },
    });
    expect(response.statusCode).toBe(403);

    await app.close();
  });

  it("returns 404 for a nonexistent game", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const player = await newPlayer(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/games/00000000-0000-0000-0000-000000000000",
      headers: { cookie: player.cookie },
    });
    expect(response.statusCode).toBe(403); // no seat -> forbidden, before even checking existence

    await app.close();
  });

  it("requires authentication", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const { gameId } = await startTwoPlayerGame(app);

    const response = await app.inject({ method: "GET", url: `/api/games/${gameId}` });
    expect(response.statusCode).toBe(401);

    await app.close();
  });
});
