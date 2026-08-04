import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";

const BASE_ENV = {
  NODE_ENV: "test" as const,
  PORT: 0,
  DATABASE_URL: "unused-app-owns-its-own-db-handle",
  SESSION_TOKEN_HMAC_SECRET: "test-hmac-secret-at-least-32-characters-long",
};

describe("security: rate limiting, secure headers, CORS", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("rate-limits /api/account/login after repeated attempts", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: BASE_ENV, logger: false });

    const attempt = () =>
      app.inject({
        method: "POST",
        url: "/api/account/login",
        payload: { username: "NoSuchUser", password: "wrong-password-x" },
      });

    const responses = [];
    for (let i = 0; i < 14; i++) {
      responses.push(await attempt());
    }
    const statusCodes = responses.map((r) => r.statusCode);
    // The configured limit is 10/minute -- expect at least one 429 among 14
    // rapid attempts, proving the limiter is actually active, not just
    // configured and silently doing nothing.
    expect(statusCodes).toContain(429);
    expect(statusCodes.filter((c) => c === 401)).toHaveLength(10);

    await app.close();
  });

  it("sets secure headers (helmet) on responses", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: BASE_ENV, logger: false });

    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-dns-prefetch-control"]).toBeDefined();

    await app.close();
  });

  it("does not reflect a cross-origin Origin header when CORS_ORIGIN is unset (same-origin only)", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: BASE_ENV, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { origin: "https://evil.example" },
    });
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();

    await app.close();
  });

  it("reflects the configured origin when CORS_ORIGIN is set", async () => {
    const db = await getTestDb();
    const app = await buildApp({
      db,
      env: { ...BASE_ENV, CORS_ORIGIN: "https://app.example" },
      logger: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { origin: "https://app.example" },
    });
    expect(response.headers["access-control-allow-origin"]).toBe("https://app.example");

    await app.close();
  });
});

// Release-CI-stabilization follow-up -- the E2E-only rate-limit bypass
// (env.ts's isE2ERateLimitBypassEnabled). Integration-level, not just the
// unit-level env.test.ts coverage: these exercise the real registration
// decision in app.ts against the real @fastify/rate-limit plugin and a
// real route, the same way the "strictest limit" test above already does.
describe("E2E_DISABLE_RATE_LIMITS bypass", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  const attemptLogin = (app: Awaited<ReturnType<typeof buildApp>>) =>
    app.inject({
      method: "POST",
      url: "/api/account/login",
      payload: { username: "NoSuchUser", password: "wrong-password-x" },
    });

  it("production cannot disable limits through the E2E flag -- still rate-limits even with it set", async () => {
    const db = await getTestDb();
    const app = await buildApp({
      db,
      env: { ...BASE_ENV, NODE_ENV: "production", E2E_DISABLE_RATE_LIMITS: "true" },
      logger: false,
    });

    const statusCodes = [];
    for (let i = 0; i < 14; i++) {
      statusCodes.push((await attemptLogin(app)).statusCode);
    }
    // Same assertion as the default-env test above: a 429 shows up among 14
    // rapid attempts, proving the limiter is still fully active -- the E2E
    // flag had no effect because NODE_ENV is "production".
    expect(statusCodes).toContain(429);

    await app.close();
  });

  it("explicit non-production E2E mode bypasses limits -- no 429 even after many rapid attempts", async () => {
    const db = await getTestDb();
    const app = await buildApp({
      db,
      env: { ...BASE_ENV, E2E_DISABLE_RATE_LIMITS: "true" },
      logger: false,
    });

    const statusCodes = [];
    for (let i = 0; i < 14; i++) {
      statusCodes.push((await attemptLogin(app)).statusCode);
    }
    // Every attempt reaches the real route handler (401 for bad
    // credentials) instead of being throttled -- zero 429s among 14
    // rapid attempts past the login limit (10/minute).
    expect(statusCodes).not.toContain(429);
    expect(statusCodes.every((code) => code === 401)).toBe(true);

    await app.close();
  });
});
