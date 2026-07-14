import type { Kysely, Selectable, Transaction } from "kysely";
import type { Database, SessionsTable } from "../types.js";
import { generateSessionToken, hashSessionToken } from "../../security/hashing.js";

export type SessionRow = Selectable<SessionsTable>;

export async function createSession(
  db: Kysely<Database> | Transaction<Database>,
  playerId: string,
  hmacSecret: string,
  ttlMs: number,
): Promise<{ token: string; session: SessionRow }> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token, hmacSecret);
  const expiresAt = new Date(Date.now() + ttlMs);
  const session = await db
    .insertInto("sessions")
    .values({ player_id: playerId, token_hash: tokenHash, expires_at: expiresAt })
    .returningAll()
    .executeTakeFirstOrThrow();
  return { token, session };
}

/** Only returns a session that is neither revoked nor expired. */
export async function findActiveSessionByToken(
  db: Kysely<Database> | Transaction<Database>,
  token: string,
  hmacSecret: string,
): Promise<SessionRow | undefined> {
  const tokenHash = hashSessionToken(token, hmacSecret);
  return db
    .selectFrom("sessions")
    .selectAll()
    .where("token_hash", "=", tokenHash)
    .where("revoked_at", "is", null)
    .where("expires_at", ">", new Date())
    .executeTakeFirst();
}

export async function revokeSession(
  db: Kysely<Database> | Transaction<Database>,
  sessionId: string,
): Promise<void> {
  await db
    .updateTable("sessions")
    .set({ revoked_at: new Date() })
    .where("id", "=", sessionId)
    .execute();
}

export async function revokeAllSessionsForPlayer(
  db: Kysely<Database> | Transaction<Database>,
  playerId: string,
): Promise<void> {
  await db
    .updateTable("sessions")
    .set({ revoked_at: new Date() })
    .where("player_id", "=", playerId)
    .where("revoked_at", "is", null)
    .execute();
}
