import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { SESSION_COOKIE_NAME } from "../../src/security/session.js";
import { COMPUTER_PLAYER_ID } from "../../src/db/botIdentity.js";
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

/** Room creation (including Play vs Computer, Phase 2) requires a claimed
 * username, so every test player claims one automatically. */
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

async function createVsComputer(app: AppInstance, cookie: string, displayName = "Solo") {
  return app.inject({
    method: "POST",
    url: "/api/rooms/vs-computer",
    headers: { cookie },
    payload: { displayName },
  });
}

describe("Play vs Computer -- room creation and lifecycle", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("creates a private 2-seat room with the human host and a ready computer member", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const human = await newPlayer(app, "SoloPlayer");

    // "Solo" (the legacy backward-compat displayName) is deliberately NOT
    // the claimed username, to prove it is ignored server-side.
    const response = await createVsComputer(app, human.cookie, "Solo");
    expect(response.statusCode).toBe(200);
    const { roomId, code, name } = response.json();
    expect(typeof roomId).toBe("string");
    expect(typeof code).toBe("string");
    // Vs-computer rooms are always private, so naming follows the private
    // (bare-username) convention, not the public_ prefix.
    expect(name).toBe("SoloPlayer");

    const room = await db
      .selectFrom("rooms")
      .selectAll()
      .where("id", "=", roomId)
      .executeTakeFirstOrThrow();
    expect(room.visibility).toBe("private");
    expect(room.capacity).toBe(2);
    expect(room.has_computer).toBe(true);
    expect(room.name).toBe("SoloPlayer");

    const members = await db
      .selectFrom("room_members")
      .selectAll()
      .where("room_id", "=", roomId)
      .execute();
    expect(members).toHaveLength(2);
    const host = members.find((m) => m.controller_type === "human");
    const bot = members.find((m) => m.controller_type === "computer");
    expect(host!.player_id).toBe(human.playerId);
    expect(host!.is_ready).toBe(false);
    // The host's display name is the claimed username, not the
    // backward-compat-only displayName field submitted at creation.
    expect(host!.display_name).toBe("SoloPlayer");
    expect(bot!.player_id).toBe(COMPUTER_PLAYER_ID);
    expect(bot!.is_ready).toBe(true); // intrinsically ready
    expect(room.host_room_member_id).toBe(host!.id);

    await app.close();
  });

  it("GET /api/rooms/:id flags the computer member via isComputer", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const human = await newPlayer(app);
    const { roomId } = (await createVsComputer(app, human.cookie)).json();

    const room = await app.inject({
      method: "GET",
      url: `/api/rooms/${roomId}`,
      headers: { cookie: human.cookie },
    });
    expect(room.statusCode).toBe(200);
    const members: { playerId: string; isComputer: boolean; isReady: boolean }[] =
      room.json().members;
    const bot = members.find((m) => m.isComputer);
    const you = members.find((m) => !m.isComputer);
    expect(bot?.playerId).toBe(COMPUTER_PLAYER_ID);
    expect(bot?.isReady).toBe(true);
    expect(you?.playerId).toBe(human.playerId);

    await app.close();
  });

  it("excludes the bot room from the public lobby and quick-join", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const human = await newPlayer(app);
    await createVsComputer(app, human.cookie);

    const lobby = await app.inject({
      method: "GET",
      url: "/api/rooms/public",
      headers: { cookie: human.cookie },
    });
    expect(lobby.json().rooms).toHaveLength(0);

    // A different player quick-joining finds nothing eligible (the bot room is
    // private).
    const other = await newPlayer(app);
    const quick = await app.inject({
      method: "POST",
      url: "/api/rooms/quick-join",
      headers: { cookie: other.cookie },
      payload: { displayName: "Nosy" },
    });
    expect(quick.statusCode).toBe(404);

    await app.close();
  });

  it("rejects joining a bot room even with the code", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const human = await newPlayer(app);
    const { code } = (await createVsComputer(app, human.cookie)).json();

    const other = await newPlayer(app);
    const join = await app.inject({
      method: "POST",
      url: "/api/rooms/join",
      headers: { cookie: other.cookie },
      payload: { code, displayName: "Nosy" },
    });
    expect(join.statusCode).toBe(409);

    await app.close();
  });

  it("requires an authenticated creator", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/vs-computer",
      payload: { displayName: "Solo" },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects creation when the identity has no claimed username, without creating a room", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const identity = await app.inject({ method: "POST", url: "/api/identity", payload: {} });
    const cookie = identity.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!;
    const cookieHeader = `${SESSION_COOKIE_NAME}=${cookie.value}`;

    const response = await createVsComputer(app, cookieHeader);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("username_required");

    const rooms = await db.selectFrom("rooms").selectAll().execute();
    expect(rooms).toHaveLength(0);

    await app.close();
  });

  it("returns 404 when the feature flag is disabled", async () => {
    const db = await getTestDb();
    const app = await buildApp({
      db,
      env: { ...TEST_ENV, ENABLE_COMPUTER_OPPONENT: "false" as const },
      logger: false,
    });
    const human = await newPlayer(app);
    const response = await createVsComputer(app, human.cookie);
    expect(response.statusCode).toBe(404);

    // And no room was created.
    const rooms = await db.selectFrom("rooms").selectAll().execute();
    expect(rooms).toHaveLength(0);
    await app.close();
  });

  it("the human can ready and start, dealing a game with a computer seat", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const human = await newPlayer(app);
    const { roomId } = (await createVsComputer(app, human.cookie)).json();

    // Bot is already ready; the human readies, then starts.
    const ready = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/ready`,
      headers: { cookie: human.cookie },
      payload: { ready: true },
    });
    expect(ready.statusCode).toBe(200);

    const start = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/start`,
      headers: { cookie: human.cookie },
    });
    expect(start.statusCode).toBe(200);
    const { gameId } = start.json();

    const controllers = await db
      .selectFrom("game_seats")
      .select(["controller_type"])
      .where("game_id", "=", gameId)
      .execute();
    expect(controllers.map((c) => c.controller_type).sort()).toEqual(["computer", "human"]);

    // After dealing, the bot member remains ready for a future rematch while
    // the human's readiness was reset.
    const members = await db
      .selectFrom("room_members")
      .select(["controller_type", "is_ready"])
      .where("room_id", "=", roomId)
      .execute();
    const bot = members.find((m) => m.controller_type === "computer");
    const you = members.find((m) => m.controller_type === "human");
    expect(bot?.is_ready).toBe(true);
    expect(you?.is_ready).toBe(false);

    await app.close();
  });
});
