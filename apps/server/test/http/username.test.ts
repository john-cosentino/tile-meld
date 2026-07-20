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

async function createIdentity(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({ method: "POST", url: "/api/identity", payload: {} });
  return { cookie: extractSessionCookie(response), ...response.json() };
}

describe("POST /api/identity/username", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("requires an authenticated session", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/api/identity/username",
      payload: { username: "alice" },
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it("claims a valid username and returns it", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const { cookie } = await createIdentity(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/identity/username",
      headers: { cookie },
      payload: { username: "Alice" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ username: "Alice" });

    await app.close();
  });

  it("rejects a username with disallowed characters", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const { cookie } = await createIdentity(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/identity/username",
      headers: { cookie },
      payload: { username: "al ice!" },
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it("rejects a username outside the length bounds", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const { cookie } = await createIdentity(app);

    const tooShort = await app.inject({
      method: "POST",
      url: "/api/identity/username",
      headers: { cookie },
      payload: { username: "ab" },
    });
    expect(tooShort.statusCode).toBe(400);

    const tooLong = await app.inject({
      method: "POST",
      url: "/api/identity/username",
      headers: { cookie },
      payload: { username: "a".repeat(25) },
    });
    expect(tooLong.statusCode).toBe(400);

    await app.close();
  });

  it("rejects a reserved username with a 400", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const { cookie } = await createIdentity(app);

    for (const name of ["computer", "System", "public_anything"]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/identity/username",
        headers: { cookie },
        payload: { username: name },
      });
      expect(response.statusCode).toBe(400);
    }

    await app.close();
  });

  it("rejects a taken username with a 409", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const first = await createIdentity(app);
    const second = await createIdentity(app);

    const claim1 = await app.inject({
      method: "POST",
      url: "/api/identity/username",
      headers: { cookie: first.cookie },
      payload: { username: "Alice" },
    });
    expect(claim1.statusCode).toBe(200);

    const claim2 = await app.inject({
      method: "POST",
      url: "/api/identity/username",
      headers: { cookie: second.cookie },
      payload: { username: "ALICE" },
    });
    expect(claim2.statusCode).toBe(409);

    await app.close();
  });

  it("is idempotent: reclaiming the same username returns 200 unchanged", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const { cookie } = await createIdentity(app);

    await app.inject({
      method: "POST",
      url: "/api/identity/username",
      headers: { cookie },
      payload: { username: "Alice" },
    });

    const again = await app.inject({
      method: "POST",
      url: "/api/identity/username",
      headers: { cookie },
      payload: { username: "Alice" },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ username: "Alice" });

    await app.close();
  });

  it("rejects an attempt to change an already-claimed username, with a 409", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const { cookie } = await createIdentity(app);

    await app.inject({
      method: "POST",
      url: "/api/identity/username",
      headers: { cookie },
      payload: { username: "Alice" },
    });

    const change = await app.inject({
      method: "POST",
      url: "/api/identity/username",
      headers: { cookie },
      payload: { username: "Bob" },
    });
    expect(change.statusCode).toBe(409);

    await app.close();
  });

  it("a recovered session sees and retains the same claimed username", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const { cookie, playerId, recoverySecret } = await createIdentity(app);

    await app.inject({
      method: "POST",
      url: "/api/identity/username",
      headers: { cookie },
      payload: { username: "Alice" },
    });

    const recover = await app.inject({
      method: "POST",
      url: "/api/session/recover",
      payload: { playerId, recoverySecret },
    });
    expect(recover.statusCode).toBe(200);
    expect(recover.json()).toEqual({ playerId, username: "Alice" });

    await app.close();
  });

  it("a brand-new identity's create/recover responses report a null username", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });

    const identity = await app.inject({ method: "POST", url: "/api/identity", payload: {} });
    const body = identity.json();
    expect(body.username).toBeNull();

    await app.close();
  });

  it("two concurrent claims for the same username result in exactly one success", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const first = await createIdentity(app);
    const second = await createIdentity(app);

    const [r1, r2] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/identity/username",
        headers: { cookie: first.cookie },
        payload: { username: "Racer" },
      }),
      app.inject({
        method: "POST",
        url: "/api/identity/username",
        headers: { cookie: second.cookie },
        payload: { username: "racer" },
      }),
    ]);

    const statusCodes = [r1.statusCode, r2.statusCode].sort();
    expect(statusCodes).toEqual([200, 409]);

    await app.close();
  });
});
