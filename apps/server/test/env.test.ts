import { describe, expect, it } from "vitest";
import { loadEnv, isRetentionSweepEnabled, isE2ERateLimitBypassEnabled } from "../src/env.js";

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

// Phase 7 -- the destructive retention sweep's kill switch. Opposite
// polarity from ENABLE_COMPUTER_OPPONENT deliberately: OFF unless
// explicitly "true", since this one permanently deletes live data.
describe("ENABLE_RETENTION_SWEEP / isRetentionSweepEnabled", () => {
  it("defaults to disabled when the var is entirely absent", () => {
    const env = loadEnv(REQUIRED);
    expect(env.ENABLE_RETENTION_SWEEP).toBeUndefined();
    expect(isRetentionSweepEnabled(env)).toBe(false);
  });

  it("rejects an empty-string value, exactly like ENABLE_COMPUTER_OPPONENT already does", () => {
    // Unlike CORS_ORIGIN/VAPID_* (optionalString(), which specifically
    // normalizes a container platform's `${VAR:-}` empty-string
    // interpolation to "absent"), this boolean-style flag follows
    // ENABLE_COMPUTER_OPPONENT's existing plain z.enum(["true","false"])
    // convention -- an empty string is simply not one of the two valid
    // values, and is rejected the same way any other invalid string is.
    expect(() => loadEnv({ ...REQUIRED, ENABLE_RETENTION_SWEEP: "" })).toThrow();
  });

  it('is disabled for an explicit "false"', () => {
    const env = loadEnv({ ...REQUIRED, ENABLE_RETENTION_SWEEP: "false" });
    expect(isRetentionSweepEnabled(env)).toBe(false);
  });

  it('is enabled only for an explicit "true"', () => {
    const env = loadEnv({ ...REQUIRED, ENABLE_RETENTION_SWEEP: "true" });
    expect(isRetentionSweepEnabled(env)).toBe(true);
  });

  it("rejects an invalid value the same way other boolean-style env vars are validated", () => {
    expect(() => loadEnv({ ...REQUIRED, ENABLE_RETENTION_SWEEP: "yes" })).toThrow();
    expect(() => loadEnv({ ...REQUIRED, ENABLE_RETENTION_SWEEP: "1" })).toThrow();
  });

  it("has no env var for the retention window itself -- only the boolean switch exists", () => {
    // The 48-hour window is a fixed code constant (retentionSweep.ts's
    // RETENTION_WINDOW_MS), never read from the environment. Asserting the
    // schema accepts no such key: an unrecognized env var is simply
    // ignored by zod's default (non-strict) object parsing, so the real
    // guarantee is source-level (see retentionSweep.ts) -- this test just
    // documents that no RETENTION_COMPLETED_GAME_HOURS-shaped var is ever
    // consulted by loadEnv's result.
    const env = loadEnv({ ...REQUIRED, RETENTION_COMPLETED_GAME_HOURS: "4" });
    expect((env as Record<string, unknown>)["RETENTION_COMPLETED_GAME_HOURS"]).toBeUndefined();
  });
});

// Release-CI-stabilization follow-up -- the E2E-only rate-limit bypass.
// Like ENABLE_RETENTION_SWEEP, off unless explicitly "true"; unlike it,
// also requires NODE_ENV !== "production" so the flag alone can never
// disable production's real per-IP limits.
describe("E2E_DISABLE_RATE_LIMITS / isE2ERateLimitBypassEnabled", () => {
  it("keeps rate limits enabled by default when the var is entirely absent", () => {
    const env = loadEnv(REQUIRED);
    expect(env.E2E_DISABLE_RATE_LIMITS).toBeUndefined();
    expect(isE2ERateLimitBypassEnabled(env)).toBe(false);
  });

  it('keeps rate limits enabled for an explicit "false"', () => {
    const env = loadEnv({ ...REQUIRED, E2E_DISABLE_RATE_LIMITS: "false" });
    expect(isE2ERateLimitBypassEnabled(env)).toBe(false);
  });

  it('bypasses rate limits only for an explicit "true" outside production', () => {
    const env = loadEnv({ ...REQUIRED, E2E_DISABLE_RATE_LIMITS: "true", NODE_ENV: "test" });
    expect(isE2ERateLimitBypassEnabled(env)).toBe(true);
  });

  it('never bypasses rate limits when NODE_ENV is "production", even with the flag "true"', () => {
    // The exact accidental-misconfiguration scenario this function must
    // resist: someone (or some deploy config) sets both at once.
    const env = loadEnv({
      ...REQUIRED,
      E2E_DISABLE_RATE_LIMITS: "true",
      NODE_ENV: "production",
    });
    expect(isE2ERateLimitBypassEnabled(env)).toBe(false);
  });

  it("rejects an invalid value the same way other boolean-style env vars are validated", () => {
    expect(() => loadEnv({ ...REQUIRED, E2E_DISABLE_RATE_LIMITS: "yes" })).toThrow();
    expect(() => loadEnv({ ...REQUIRED, E2E_DISABLE_RATE_LIMITS: "1" })).toThrow();
  });
});
