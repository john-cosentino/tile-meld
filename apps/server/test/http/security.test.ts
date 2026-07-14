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

  it("rate-limits /api/session/recover (the strictest limit) after repeated attempts", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: BASE_ENV, logger: false });

    const attempt = () =>
      app.inject({
        method: "POST",
        url: "/api/session/recover",
        payload: { playerId: "00000000-0000-0000-0000-000000000000", recoverySecret: "x" },
      });

    const responses = [];
    for (let i = 0; i < 8; i++) {
      responses.push(await attempt());
    }
    const statusCodes = responses.map((r) => r.statusCode);
    // The configured limit is 5/minute -- expect at least one 429 among 8
    // rapid attempts, proving the limiter is actually active, not just
    // configured and silently doing nothing.
    expect(statusCodes).toContain(429);
    expect(statusCodes.filter((c) => c === 401)).toHaveLength(5);

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
