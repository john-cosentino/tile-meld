import type { Kysely, Selectable, Transaction } from "kysely";
import type { Database, PasswordResetTokensTable } from "../types.js";
import { generateResetToken, hashSessionToken } from "../../security/hashing.js";

export type PasswordResetTokenRow = Selectable<PasswordResetTokensTable>;

/** 30 minutes -- long enough to read an email, short enough that a leaked
 * link goes stale fast. A code constant, not configuration. */
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Mints a reset token for a player, superseding any outstanding unused
 * tokens (each new "forgot password" request invalidates the previous
 * email's link -- only the latest link works). Returns the raw token for
 * the email; only its keyed HMAC is stored.
 */
export async function createResetToken(
  db: Kysely<Database> | Transaction<Database>,
  playerId: string,
  hmacSecret: string,
): Promise<{ token: string; row: PasswordResetTokenRow }> {
  await db
    .updateTable("password_reset_tokens")
    .set({ used_at: new Date() })
    .where("player_id", "=", playerId)
    .where("used_at", "is", null)
    .execute();

  const token = generateResetToken();
  const row = await db
    .insertInto("password_reset_tokens")
    .values({
      player_id: playerId,
      token_hash: hashSessionToken(token, hmacSecret),
      expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return { token, row };
}

/**
 * Atomically consumes a live token: the single guarded UPDATE is both the
 * validity check and the single-use marking, so two concurrent confirms
 * with the same token cannot both succeed. Returns the owning player id,
 * or undefined for an unknown, expired, or already-used token.
 */
export async function consumeResetToken(
  db: Kysely<Database> | Transaction<Database>,
  token: string,
  hmacSecret: string,
): Promise<string | undefined> {
  const consumed = await db
    .updateTable("password_reset_tokens")
    .set({ used_at: new Date() })
    .where("token_hash", "=", hashSessionToken(token, hmacSecret))
    .where("used_at", "is", null)
    .where("expires_at", ">", new Date())
    .returning("player_id")
    .executeTakeFirst();
  return consumed?.player_id;
}
