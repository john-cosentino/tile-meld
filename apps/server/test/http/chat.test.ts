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

/** Room creation (Phase 2) requires a claimed username, so every test
 * player claims one automatically. */
async function newPlayer(
  app: AppInstance,
  username: string = nextTestUsername(),
): Promise<{ playerId: string; cookie: string }> {
  const response = await app.inject({ method: "POST", url: "/api/identity", payload: {} });
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!;
  const cookieHeader = `${SESSION_COOKIE_NAME}=${cookie.value}`;
  await app.inject({
    method: "POST",
    url: "/api/identity/username",
    headers: { cookie: cookieHeader },
    payload: { username },
  });
  return { playerId: response.json().playerId, cookie: cookieHeader };
}

async function startTwoPlayerGame(app: AppInstance) {
  const host = await newPlayer(app, "Host");
  const created = await app.inject({
    method: "POST",
    url: "/api/rooms",
    headers: { cookie: host.cookie },
    payload: { displayName: "Host", capacity: 2, visibility: "private", turnLimitHours: 4 },
  });
  const { roomId, code } = created.json();
  const guest = await newPlayer(app);
  // Capacity 2: this join fills the room and auto-starts it (Phase 4) --
  // no manual ready/start round trip needed or possible (the room is no
  // longer "open" by the time it would run).
  await app.inject({
    method: "POST",
    url: "/api/rooms/join",
    headers: { cookie: guest.cookie },
    payload: { code, displayName: "Guest" },
  });
  const roomState = await app.inject({
    method: "GET",
    url: `/api/rooms/${roomId}`,
    headers: { cookie: host.cookie },
  });
  return { gameId: roomState.json().latestGameId as string, host, guest };
}

describe("GET /api/games/:id/chat", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("returns chat history in chronological order with resolved display names", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const { gameId, host } = await startTwoPlayerGame(app);

    const gameRow = await db
      .selectFrom("games")
      .select("id")
      .where("id", "=", gameId)
      .executeTakeFirstOrThrow();
    await db
      .insertInto("chat_messages")
      .values([
        { game_id: gameRow.id, seat_index: 0, sender_player_id: host.playerId, body: "hi" },
        { game_id: gameRow.id, seat_index: 0, sender_player_id: host.playerId, body: "there" },
      ])
      .execute();

    const response = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}/chat`,
      headers: { cookie: host.cookie },
    });
    expect(response.statusCode).toBe(200);
    const { messages } = response.json();
    expect(messages).toHaveLength(2);
    expect(messages[0].body).toBe("hi");
    expect(messages[1].body).toBe("there");
    expect(messages[0].senderDisplay).toBe("Host");
    expect(typeof messages[0].id).toBe("string");

    await app.close();
  });

  it("rejects a player who is not a seat holder in the game", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const { gameId } = await startTwoPlayerGame(app);
    const outsider = await newPlayer(app);

    const response = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}/chat`,
      headers: { cookie: outsider.cookie },
    });
    expect(response.statusCode).toBe(403);

    await app.close();
  });

  it("requires authentication", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const { gameId } = await startTwoPlayerGame(app);

    const response = await app.inject({ method: "GET", url: `/api/games/${gameId}/chat` });
    expect(response.statusCode).toBe(401);

    await app.close();
  });
});
