import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import type { Mailer } from "../../src/email/mailer.js";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { SESSION_COOKIE_NAME } from "../../src/security/session.js";

// The account endpoints -- the only identity surface since Phase F
// retired guest minting and recovery codes.

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

function captureMailer() {
  const sent: { to: string; resetUrl: string }[] = [];
  const mailer: Mailer = {
    async sendPasswordResetEmail(input) {
      sent.push(input);
    },
  };
  return { mailer, sent };
}

async function makeApp(envOverrides: Record<string, unknown> = {}, mailer?: Mailer) {
  const db = await getTestDb();
  return buildApp({
    db,
    env: { ...TEST_ENV, ...envOverrides } as typeof TEST_ENV,
    logger: false,
    ...(mailer ? { mailer } : {}),
  });
}

const GOOD_REGISTRATION = {
  username: "PlayerOne",
  email: "one@example.com",
  password: "a-good-password",
};

describe("account routes", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("register creates a signed-in account with the username claimed", async () => {
    const app = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/account/register",
      payload: GOOD_REGISTRATION,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.username).toBe("PlayerOne");
    expect(body.portraitId).toBeNull();
    expect(body).not.toHaveProperty("recoverySecret");
    const cookie = extractSessionCookie(response);

    const me = await app.inject({ method: "GET", url: "/api/identity/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      username: "PlayerOne",
      email: "one@example.com",
      portraitId: null,
    });
    await app.close();
  });

  it("register rejects a taken username (case-insensitively) and a reserved one", async () => {
    const app = await makeApp();
    await app.inject({ method: "POST", url: "/api/account/register", payload: GOOD_REGISTRATION });
    const taken = await app.inject({
      method: "POST",
      url: "/api/account/register",
      payload: { ...GOOD_REGISTRATION, username: "PLAYERONE", email: "two@example.com" },
    });
    expect(taken.statusCode).toBe(409);
    const reserved = await app.inject({
      method: "POST",
      url: "/api/account/register",
      payload: { ...GOOD_REGISTRATION, username: "admin" },
    });
    expect(reserved.statusCode).toBe(400);
    await app.close();
  });

  it("login succeeds with correct credentials and fails generically otherwise", async () => {
    const app = await makeApp();
    await app.inject({ method: "POST", url: "/api/account/register", payload: GOOD_REGISTRATION });

    const ok = await app.inject({
      method: "POST",
      url: "/api/account/login",
      payload: { username: "playerone", password: GOOD_REGISTRATION.password },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.cookies.some((c) => c.name === SESSION_COOKIE_NAME)).toBe(true);

    const wrongPassword = await app.inject({
      method: "POST",
      url: "/api/account/login",
      payload: { username: "PlayerOne", password: "not-the-password" },
    });
    const unknownUser = await app.inject({
      method: "POST",
      url: "/api/account/login",
      payload: { username: "NoSuchUser", password: "whatever-password" },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownUser.statusCode).toBe(401);
    // Indistinguishable bodies: no username-existence oracle.
    expect(wrongPassword.json()).toEqual(unknownUser.json());
    await app.close();
  });

  it("logout revokes exactly the calling session and clears the cookie", async () => {
    const app = await makeApp();
    const register = await app.inject({
      method: "POST",
      url: "/api/account/register",
      payload: GOOD_REGISTRATION,
    });
    const cookie = extractSessionCookie(register);
    const otherLogin = await app.inject({
      method: "POST",
      url: "/api/account/login",
      payload: { username: "PlayerOne", password: GOOD_REGISTRATION.password },
    });
    const otherCookie = extractSessionCookie(otherLogin);

    const logout = await app.inject({
      method: "POST",
      url: "/api/account/logout",
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(204);
    const cleared = logout.cookies.find((c) => c.name === SESSION_COOKIE_NAME);
    expect(cleared?.value).toBe("");

    const meAfter = await app.inject({
      method: "GET",
      url: "/api/identity/me",
      headers: { cookie },
    });
    expect(meAfter.statusCode).toBe(401);
    const otherStillLive = await app.inject({
      method: "GET",
      url: "/api/identity/me",
      headers: { cookie: otherCookie },
    });
    expect(otherStillLive.statusCode).toBe(200);
    await app.close();
  });

  it("change-password rotates the credential and signs other sessions out", async () => {
    const app = await makeApp();
    const register = await app.inject({
      method: "POST",
      url: "/api/account/register",
      payload: GOOD_REGISTRATION,
    });
    const cookie = extractSessionCookie(register);
    const otherLogin = await app.inject({
      method: "POST",
      url: "/api/account/login",
      payload: { username: "PlayerOne", password: GOOD_REGISTRATION.password },
    });
    const otherCookie = extractSessionCookie(otherLogin);

    const wrongCurrent = await app.inject({
      method: "POST",
      url: "/api/account/password",
      headers: { cookie },
      payload: { currentPassword: "wrong-password", newPassword: "brand-new-password" },
    });
    expect(wrongCurrent.statusCode).toBe(401);

    const changed = await app.inject({
      method: "POST",
      url: "/api/account/password",
      headers: { cookie },
      payload: {
        currentPassword: GOOD_REGISTRATION.password,
        newPassword: "brand-new-password",
      },
    });
    expect(changed.statusCode).toBe(200);
    const freshCookie = extractSessionCookie(changed);

    const otherDead = await app.inject({
      method: "GET",
      url: "/api/identity/me",
      headers: { cookie: otherCookie },
    });
    expect(otherDead.statusCode).toBe(401);
    const selfAlive = await app.inject({
      method: "GET",
      url: "/api/identity/me",
      headers: { cookie: freshCookie },
    });
    expect(selfAlive.statusCode).toBe(200);

    const oldPassword = await app.inject({
      method: "POST",
      url: "/api/account/login",
      payload: { username: "PlayerOne", password: GOOD_REGISTRATION.password },
    });
    expect(oldPassword.statusCode).toBe(401);
    const newPassword = await app.inject({
      method: "POST",
      url: "/api/account/login",
      payload: { username: "PlayerOne", password: "brand-new-password" },
    });
    expect(newPassword.statusCode).toBe(200);
    await app.close();
  });

  it("the reset flow emails a single-use link that rotates the password", async () => {
    const { mailer, sent } = captureMailer();
    const app = await makeApp({}, mailer);
    await app.inject({ method: "POST", url: "/api/account/register", payload: GOOD_REGISTRATION });
    const oldSession = await app.inject({
      method: "POST",
      url: "/api/account/login",
      payload: { username: "PlayerOne", password: GOOD_REGISTRATION.password },
    });
    const oldCookie = extractSessionCookie(oldSession);

    const requested = await app.inject({
      method: "POST",
      url: "/api/account/reset/request",
      payload: { username: "playerone" },
    });
    expect(requested.statusCode).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("one@example.com");
    const token = new URL(sent[0]!.resetUrl).searchParams.get("token")!;
    expect(token.length).toBeGreaterThan(20);

    const confirmed = await app.inject({
      method: "POST",
      url: "/api/account/reset/confirm",
      payload: { token, newPassword: "post-reset-password" },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().username).toBe("PlayerOne");

    // Single-use: the same link cannot be replayed.
    const replay = await app.inject({
      method: "POST",
      url: "/api/account/reset/confirm",
      payload: { token, newPassword: "attacker-password" },
    });
    expect(replay.statusCode).toBe(401);

    // Pre-reset sessions are gone; the new password is live.
    const oldDead = await app.inject({
      method: "GET",
      url: "/api/identity/me",
      headers: { cookie: oldCookie },
    });
    expect(oldDead.statusCode).toBe(401);
    const login = await app.inject({
      method: "POST",
      url: "/api/account/login",
      payload: { username: "PlayerOne", password: "post-reset-password" },
    });
    expect(login.statusCode).toBe(200);
    await app.close();
  });

  it("reset requests answer identically whether or not the account exists", async () => {
    const { mailer, sent } = captureMailer();
    const app = await makeApp({}, mailer);
    await app.inject({ method: "POST", url: "/api/account/register", payload: GOOD_REGISTRATION });

    const unknown = await app.inject({
      method: "POST",
      url: "/api/account/reset/request",
      payload: { username: "NoSuchUser" },
    });
    const known = await app.inject({
      method: "POST",
      url: "/api/account/reset/request",
      payload: { username: "PlayerOne" },
    });
    expect(unknown.statusCode).toBe(200);
    expect(known.statusCode).toBe(200);
    expect(unknown.json()).toEqual(known.json());
    expect(sent).toHaveLength(1); // only the real account got an email
    await app.close();
  });

  it("portrait set/clear round-trips and rejects an out-of-roster id", async () => {
    const app = await makeApp();
    const register = await app.inject({
      method: "POST",
      url: "/api/account/register",
      payload: GOOD_REGISTRATION,
    });
    const cookie = extractSessionCookie(register);

    const set = await app.inject({
      method: "POST",
      url: "/api/account/portrait",
      headers: { cookie },
      payload: { portraitId: 3 },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toEqual({ portraitId: 3 });

    const outOfRange = await app.inject({
      method: "POST",
      url: "/api/account/portrait",
      headers: { cookie },
      payload: { portraitId: 13 },
    });
    expect(outOfRange.statusCode).toBe(400);

    const cleared = await app.inject({
      method: "POST",
      url: "/api/account/portrait",
      headers: { cookie },
      payload: { portraitId: null },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toEqual({ portraitId: null });
    await app.close();
  });

  it("a picked portrait appears in room member summaries and game seat views", async () => {
    const app = await makeApp();
    const register = await app.inject({
      method: "POST",
      url: "/api/account/register",
      payload: GOOD_REGISTRATION,
    });
    const cookie = extractSessionCookie(register);
    await app.inject({
      method: "POST",
      url: "/api/account/portrait",
      headers: { cookie },
      payload: { portraitId: 6 },
    });

    // Play vs Computer gives a room AND a startable game in one flow.
    const room = await app.inject({
      method: "POST",
      url: "/api/rooms/vs-computer",
      headers: { cookie },
      payload: { displayName: "PlayerOne" },
    });
    expect(room.statusCode).toBe(200);
    const { roomId } = room.json();

    const roomView = await app.inject({
      method: "GET",
      url: `/api/rooms/${roomId}`,
      headers: { cookie },
    });
    expect(roomView.statusCode).toBe(200);
    const members = roomView.json().members;
    const human = members.find((m: { isComputer: boolean }) => !m.isComputer);
    const bot = members.find((m: { isComputer: boolean }) => m.isComputer);
    expect(human.portraitId).toBe(6);
    expect(bot.portraitId).toBeNull();

    // Start the game and check the seat views carry it too.
    await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/ready`,
      headers: { cookie },
      payload: { ready: true },
    });
    const started = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/start`,
      headers: { cookie },
    });
    expect(started.statusCode).toBe(200);
    const { gameId } = started.json();
    const gameView = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}`,
      headers: { cookie },
    });
    expect(gameView.statusCode).toBe(200);
    expect(gameView.json().self.portraitId).toBe(6);
    expect(gameView.json().opponents[0].portraitId).toBeNull();
    await app.close();
  });

  it("the retired guest-mint and config endpoints are gone", async () => {
    const app = await makeApp();
    const mint = await app.inject({ method: "POST", url: "/api/identity", payload: {} });
    expect(mint.statusCode).toBe(404);
    const config = await app.inject({ method: "GET", url: "/api/config" });
    expect(config.statusCode).toBe(404);
    await app.close();
  });
});
