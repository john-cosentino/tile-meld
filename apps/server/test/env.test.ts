import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/env.js";

const REQUIRED = {
  DATABASE_URL: "postgres://tilemeld:tilemeld@localhost:5432/tilemeld",
  SESSION_TOKEN_HMAC_SECRET: "a".repeat(32),
};

describe("loadEnv", () => {
  it("treats an empty-string optional var the same as absent", () => {
    // Docker Compose's `${VAR:-}` interpolation (docker-compose.prod.yml)
    // sets an unset optional var to "" rather than omitting the key --
    // found via a real docker compose run where CORS_ORIGIN="" reached
    // @fastify/cors as `origin: ""` and crashed every request with
    // "Invalid CORS origin option" instead of behaving like CORS_ORIGIN
    // was never set.
    const env = loadEnv({ ...REQUIRED, CORS_ORIGIN: "" });
    expect(env.CORS_ORIGIN).toBeUndefined();
  });

  it("passes through a real optional value unchanged", () => {
    const env = loadEnv({ ...REQUIRED, CORS_ORIGIN: "https://example.com" });
    expect(env.CORS_ORIGIN).toBe("https://example.com");
  });

  it("leaves an omitted optional var as undefined", () => {
    const env = loadEnv({ ...REQUIRED });
    expect(env.CORS_ORIGIN).toBeUndefined();
  });

  it("normalizes empty-string VAPID vars the same way", () => {
    const env = loadEnv({
      ...REQUIRED,
      VAPID_PUBLIC_KEY: "",
      VAPID_PRIVATE_KEY: "",
      VAPID_SUBJECT: "",
    });
    expect(env.VAPID_PUBLIC_KEY).toBeUndefined();
    expect(env.VAPID_PRIVATE_KEY).toBeUndefined();
    expect(env.VAPID_SUBJECT).toBeUndefined();
  });

  it("rejects an empty-string DATABASE_URL", () => {
    expect(() => loadEnv({ ...REQUIRED, DATABASE_URL: "" })).toThrow(/DATABASE_URL is required/);
  });

  it("rejects a missing DATABASE_URL", () => {
    const { DATABASE_URL: _omit, ...rest } = REQUIRED;
    expect(() => loadEnv(rest)).toThrow(/Required/);
  });

  it("rejects a SESSION_TOKEN_HMAC_SECRET shorter than 32 characters", () => {
    expect(() => loadEnv({ ...REQUIRED, SESSION_TOKEN_HMAC_SECRET: "too-short" })).toThrow(
      /at least 32 characters/,
    );
  });

  it("defaults NODE_ENV to development and PORT to 3000", () => {
    const env = loadEnv(REQUIRED);
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
  });
});
