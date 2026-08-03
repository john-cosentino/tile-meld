import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "kysely";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import {
  createAccount,
  createPlayer,
  ensureComputerPlayer,
  findPlayerByCanonicalUsername,
  setEmail,
  setPassword,
  setPortrait,
  upgradeLegacyAccount,
} from "../../src/db/repositories/players.js";
import {
  RESET_TOKEN_TTL_MS,
  createResetToken,
  consumeResetToken,
} from "../../src/db/repositories/passwordResetTokens.js";
import { hashPassword, verifyPassword } from "../../src/security/hashing.js";
import { createMailer } from "../../src/email/mailer.js";
import { loadEnv } from "../../src/env.js";
import type { FastifyBaseLogger } from "fastify";

// User-accounts plan, Phase A: schema + repository foundation. No routes
// yet -- these tests pin the migration 0022/0023 invariants and the new
// repository semantics the account endpoints (Phase B) will build on.

const HMAC = "test-hmac-secret-at-least-32-characters-long";

describe("account credentials schema (migrations 0022/0023)", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("accepts a human with only a password credential (no recovery hash)", async () => {
    const db = await getTestDb();
    const outcome = await createAccount(db, {
      username: "Alice",
      email: "alice@example.com",
      passwordHash: await hashPassword("correct horse"),
    });
    expect(outcome.kind).toBe("created");
    if (outcome.kind !== "created") return;
    expect(outcome.player.recovery_hash).toBeNull();
    expect(outcome.player.password_hash).not.toBeNull();
    expect(outcome.player.username).toBe("Alice");
    expect(outcome.player.username_canonical).toBe("alice");
  });

  it("rejects a human with neither credential", async () => {
    const db = await getTestDb();
    await expect(
      sql`INSERT INTO players (kind) VALUES ('human')`.execute(db),
    ).rejects.toMatchObject({ constraint: "players_credentials_kind_ck" });
  });

  it("rejects any credential, email, or portrait on the computer player", async () => {
    const db = await getTestDb();
    await ensureComputerPlayer(db);
    for (const column of ["password_hash", "email"]) {
      await expect(
        sql`UPDATE players SET ${sql.raw(column)} = 'x' WHERE kind = 'computer'`.execute(db),
      ).rejects.toMatchObject({ constraint: "players_credentials_kind_ck" });
    }
    await expect(
      sql`UPDATE players SET portrait_id = 1 WHERE kind = 'computer'`.execute(db),
    ).rejects.toMatchObject({ constraint: "players_credentials_kind_ck" });
  });

  it("rejects a negative portrait id but accepts any non-negative one", async () => {
    const db = await getTestDb();
    const player = await createPlayer(db, "legacy-secret");
    await expect(setPortrait(db, player.id, -1)).rejects.toMatchObject({
      constraint: "players_portrait_id_ck",
    });
    // The 0..PORTRAIT_COUNT-1 upper bound is app-level by design (roster
    // growth without a migration), so the DB accepts large values.
    const updated = await setPortrait(db, player.id, 7);
    expect(updated.portrait_id).toBe(7);
    const cleared = await setPortrait(db, player.id, null);
    expect(cleared.portrait_id).toBeNull();
  });

  it("createAccount reports 'taken' when the canonical username is already claimed", async () => {
    const db = await getTestDb();
    const passwordHash = await hashPassword("pw-one-two-three");
    const first = await createAccount(db, {
      username: "Bob",
      email: "bob@example.com",
      passwordHash,
    });
    expect(first.kind).toBe("created");
    const second = await createAccount(db, {
      username: "BOB",
      email: "other@example.com",
      passwordHash,
    });
    expect(second.kind).toBe("taken");
  });

  it("findPlayerByCanonicalUsername finds accounts case-insensitively and only humans", async () => {
    const db = await getTestDb();
    await createAccount(db, {
      username: "Carol",
      email: "carol@example.com",
      passwordHash: await hashPassword("pw-one-two-three"),
    });
    const found = await findPlayerByCanonicalUsername(db, "carol");
    expect(found?.username).toBe("Carol");
    expect(await findPlayerByCanonicalUsername(db, "nobody")).toBeUndefined();
  });

  it("setPassword retires the recovery credential (one credential system per account)", async () => {
    const db = await getTestDb();
    const legacy = await createPlayer(db, "legacy-secret");
    expect(legacy.recovery_hash).not.toBeNull();
    const updated = await setPassword(db, legacy.id, await hashPassword("new-password-1"));
    expect(updated.recovery_hash).toBeNull();
    expect(updated.password_hash).not.toBeNull();
    expect(updated.password_updated_at).not.toBeNull();
    expect(await verifyPassword(updated.password_hash!, "new-password-1")).toBe(true);
  });

  it("upgradeLegacyAccount upgrades exactly once and reports precisely afterwards", async () => {
    const db = await getTestDb();
    const legacy = await createPlayer(db, "legacy-secret");
    const passwordHash = await hashPassword("upgrade-password");

    const first = await upgradeLegacyAccount(db, legacy.id, {
      email: "dan@example.com",
      passwordHash,
    });
    expect(first.kind).toBe("upgraded");
    if (first.kind !== "upgraded") return;
    expect(first.player.email).toBe("dan@example.com");
    expect(first.player.recovery_hash).toBeNull();

    const again = await upgradeLegacyAccount(db, legacy.id, {
      email: "dan@example.com",
      passwordHash,
    });
    expect(again.kind).toBe("already_upgraded");

    const computer = await ensureComputerPlayer(db);
    const bot = await upgradeLegacyAccount(db, computer.id, {
      email: "bot@example.com",
      passwordHash,
    });
    expect(bot.kind).toBe("not_eligible");
  });

  it("setEmail updates a human and never a computer", async () => {
    const db = await getTestDb();
    const player = await createPlayer(db, "legacy-secret");
    const updated = await setEmail(db, player.id, "eve@example.com");
    expect(updated.email).toBe("eve@example.com");
    const computer = await ensureComputerPlayer(db);
    await expect(setEmail(db, computer.id, "bot@example.com")).rejects.toThrow();
  });
});

describe("password reset tokens", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("a minted token consumes exactly once", async () => {
    const db = await getTestDb();
    const player = await createPlayer(db, "legacy-secret");
    const { token, row } = await createResetToken(db, player.id, HMAC);
    expect(row.token_hash).not.toContain(token);
    expect(row.expires_at.getTime()).toBeGreaterThan(Date.now());
    expect(row.expires_at.getTime()).toBeLessThanOrEqual(Date.now() + RESET_TOKEN_TTL_MS + 1000);

    expect(await consumeResetToken(db, token, HMAC)).toBe(player.id);
    expect(await consumeResetToken(db, token, HMAC)).toBeUndefined();
  });

  it("an unknown or expired token does not consume", async () => {
    const db = await getTestDb();
    const player = await createPlayer(db, "legacy-secret");
    expect(await consumeResetToken(db, "no-such-token", HMAC)).toBeUndefined();

    const { token } = await createResetToken(db, player.id, HMAC);
    await sql`UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'`.execute(
      db,
    );
    expect(await consumeResetToken(db, token, HMAC)).toBeUndefined();
  });

  it("a new request supersedes the previous outstanding token", async () => {
    const db = await getTestDb();
    const player = await createPlayer(db, "legacy-secret");
    const first = await createResetToken(db, player.id, HMAC);
    const second = await createResetToken(db, player.id, HMAC);
    expect(await consumeResetToken(db, first.token, HMAC)).toBeUndefined();
    expect(await consumeResetToken(db, second.token, HMAC)).toBe(player.id);
  });
});

describe("mailer fallbacks without SMTP configuration", () => {
  const REQUIRED = {
    DATABASE_URL: "postgres://unused/unused",
    SESSION_TOKEN_HMAC_SECRET: HMAC,
  };

  function fakeLogger() {
    const log = { info: vi.fn(), error: vi.fn() };
    return { log: log as unknown as FastifyBaseLogger, calls: log };
  }

  it("logs the reset link at info level outside production", async () => {
    const { log, calls } = fakeLogger();
    const mailer = createMailer(loadEnv({ ...REQUIRED, NODE_ENV: "test" }), log);
    await mailer.sendPasswordResetEmail({ to: "a@example.com", resetUrl: "http://x/reset?t=1" });
    expect(calls.info).toHaveBeenCalledWith(
      expect.objectContaining({ resetUrl: "http://x/reset?t=1" }),
      expect.any(String),
    );
    expect(calls.error).not.toHaveBeenCalled();
  });

  it("logs an error (never the link) in production and does not throw", async () => {
    const { log, calls } = fakeLogger();
    const mailer = createMailer(loadEnv({ ...REQUIRED, NODE_ENV: "production" }), log);
    await mailer.sendPasswordResetEmail({ to: "a@example.com", resetUrl: "http://x/reset?t=1" });
    expect(calls.error).toHaveBeenCalledWith(
      expect.not.objectContaining({ resetUrl: expect.anything() }),
      expect.any(String),
    );
    expect(calls.info).not.toHaveBeenCalled();
  });
});
