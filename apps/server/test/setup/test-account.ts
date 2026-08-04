import type { Kysely, Transaction } from "kysely";
import type { Database } from "../../src/db/types.js";
import { createAccount, type PlayerRow } from "../../src/db/repositories/players.js";
import { createSession } from "../../src/db/repositories/sessions.js";
import { SESSION_COOKIE_NAME } from "../../src/security/session.js";

// Since migration 0024 every human player must carry a password_hash. Most
// tests only need *a* player row, not a verifiable credential, so this is a
// plain marker string: argon2id hashing costs real CPU per call and would
// slow the whole DB suite for nothing. Tests that exercise login/verify
// flows hash a real password themselves.
export const FAKE_PASSWORD_HASH = "$argon2id$fake-test-hash-never-verifiable";

let seq = 0;

/**
 * Inserts a human account with a fake (non-verifiable) password credential.
 * Usernames are globally unique, so the default generates a fresh one per
 * call; pass `username` only when the test asserts on the name.
 */
export async function createTestAccount(
  db: Kysely<Database> | Transaction<Database>,
  username?: string,
): Promise<PlayerRow> {
  const name = username ?? `test-user-${++seq}`;
  const outcome = await createAccount(db, {
    username: name,
    email: `${name.toLowerCase()}@example.test`,
    passwordHash: FAKE_PASSWORD_HASH,
  });
  if (outcome.kind !== "created") {
    throw new Error(`createTestAccount: username "${name}" already taken in the test database`);
  }
  return outcome.player;
}

export type SessionPlayer = {
  readonly playerId: string;
  readonly cookie: string;
  readonly username: string;
};

/**
 * createTestAccount plus a live session cookie -- the DB-layer equivalent
 * of registering over HTTP, used by route tests so they neither pay
 * argon2id per player nor burn the register route's 5/min rate limit.
 */
export async function createSessionPlayer(
  db: Kysely<Database>,
  hmacSecret: string,
  username?: string,
): Promise<SessionPlayer> {
  const player = await createTestAccount(db, username);
  const { token } = await createSession(db, player.id, hmacSecret, 3_600_000);
  return {
    playerId: player.id,
    cookie: `${SESSION_COOKIE_NAME}=${token}`,
    username: player.username!,
  };
}

/**
 * A signed-in human with NO username -- unreachable through the register
 * route (which always claims one) but still representable in the schema,
 * so the routes' defensive `username_required` guards keep real coverage.
 */
export async function createUsernamelessSession(
  db: Kysely<Database>,
  hmacSecret: string,
): Promise<{ readonly playerId: string; readonly cookie: string }> {
  const player = await db
    .insertInto("players")
    .values({ kind: "human", password_hash: FAKE_PASSWORD_HASH })
    .returningAll()
    .executeTakeFirstOrThrow();
  const { token } = await createSession(db, player.id, hmacSecret, 3_600_000);
  return { playerId: player.id, cookie: `${SESSION_COOKIE_NAME}=${token}` };
}
