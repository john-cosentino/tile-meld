import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { SESSION_COOKIE_NAME } from "../../src/security/session.js";

const TEST_ENV = {
  NODE_ENV: "test" as const,
  PORT: 0,
  DATABASE_URL: "unused-app-owns-its-own-db-handle",
  SESSION_TOKEN_HMAC_SECRET: "test-hmac-secret-at-least-32-characters-long",
};

function extractSessionCookie(response: { cookies: { name: string; value: string }[] }): string {
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE_NAME);
  if (!cookie) throw new Error("no session cookie in response");
  return `${SESSION_COOKIE_NAME}=${cookie.value}`;
}

describe("identity/session routes", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("POST /api/identity creates a player, returns the recovery secret once, and sets a session cookie", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });

    const response = await app.inject({ method: "POST", url: "/api/identity", payload: {} });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(typeof body.playerId).toBe("string");
    expect(typeof body.recoverySecret).toBe("string");
    expect(response.cookies.some((c) => c.name === SESSION_COOKIE_NAME)).toBe(true);

    await app.close();
  });

  it("the session cookie from /api/identity authorizes subsequent requests", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });

    const identity = await app.inject({ method: "POST", url: "/api/identity", payload: {} });
    const cookie = extractSessionCookie(identity);
    // Room creation (Phase 2) requires a claimed username.
    await app.inject({
      method: "POST",
      url: "/api/identity/username",
      headers: { cookie },
      payload: { username: "AuthCheck" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms",
      headers: { cookie },
      payload: { displayName: "Host", capacity: 2, visibility: "private", turnLimitHours: 4 },
    });
    expect(response.statusCode).toBe(200);

    await app.close();
  });

  it("POST /api/session/recover issues a new session for correct playerId + recoverySecret", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });

    const identity = await app.inject({ method: "POST", url: "/api/identity", payload: {} });
    const { playerId, recoverySecret } = identity.json();

    const recover = await app.inject({
      method: "POST",
      url: "/api/session/recover",
      payload: { playerId, recoverySecret },
    });
    expect(recover.statusCode).toBe(200);
    expect(recover.json()).toEqual({ playerId, username: null });
    expect(recover.cookies.some((c) => c.name === SESSION_COOKIE_NAME)).toBe(true);

    await app.close();
  });

  it("rejects recovery with the wrong secret", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });

    const identity = await app.inject({ method: "POST", url: "/api/identity", payload: {} });
    const { playerId } = identity.json();

    const recover = await app.inject({
      method: "POST",
      url: "/api/session/recover",
      payload: { playerId, recoverySecret: "wrong-secret-entirely" },
    });
    expect(recover.statusCode).toBe(401);

    await app.close();
  });

  it("rejects recovery for a nonexistent playerId", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });

    const recover = await app.inject({
      method: "POST",
      url: "/api/session/recover",
      payload: { playerId: "00000000-0000-0000-0000-000000000000", recoverySecret: "anything" },
    });
    expect(recover.statusCode).toBe(401);

    await app.close();
  });

  it("never authenticates as the credential-less computer player", async () => {
    const db = await getTestDb();
    const { ensureComputerPlayer } = await import("../../src/db/repositories/players.js");
    const { COMPUTER_PLAYER_ID } = await import("../../src/db/botIdentity.js");
    const bot = await ensureComputerPlayer(db);
    expect(bot.recovery_hash).toBeNull();

    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    // No secret exists for the bot, so recovery must be rejected regardless of
    // what is supplied -- the bot seat can never be driven by a human session.
    const recover = await app.inject({
      method: "POST",
      url: "/api/session/recover",
      payload: { playerId: COMPUTER_PLAYER_ID, recoverySecret: "anything" },
    });
    expect(recover.statusCode).toBe(401);

    await app.close();
  });

  it("POST /api/session/rotate-recovery requires auth and invalidates the old secret", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });

    const identity = await app.inject({ method: "POST", url: "/api/identity", payload: {} });
    const cookie = extractSessionCookie(identity);
    const { playerId, recoverySecret: oldSecret } = identity.json();

    const unauthed = await app.inject({ method: "POST", url: "/api/session/rotate-recovery" });
    expect(unauthed.statusCode).toBe(401);

    const rotate = await app.inject({
      method: "POST",
      url: "/api/session/rotate-recovery",
      headers: { cookie },
    });
    expect(rotate.statusCode).toBe(200);
    const { recoverySecret: newSecret } = rotate.json();
    expect(newSecret).not.toBe(oldSecret);

    const recoverWithOld = await app.inject({
      method: "POST",
      url: "/api/session/recover",
      payload: { playerId, recoverySecret: oldSecret },
    });
    expect(recoverWithOld.statusCode).toBe(401);

    const recoverWithNew = await app.inject({
      method: "POST",
      url: "/api/session/recover",
      payload: { playerId, recoverySecret: newSecret },
    });
    expect(recoverWithNew.statusCode).toBe(200);

    await app.close();
  });
});
