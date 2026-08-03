import type { Kysely, Selectable, Transaction } from "kysely";
import { canonicalizeUsername } from "@tile-meld/shared";
import type { Database, PlayersTable } from "../types.js";
import { hashRecoverySecret } from "../../security/hashing.js";
import { COMPUTER_DISPLAY_NAME, COMPUTER_PLAYER_ID } from "../botIdentity.js";

export type PlayerRow = Selectable<PlayersTable>;

export async function createPlayer(
  db: Kysely<Database> | Transaction<Database>,
  recoverySecret: string,
): Promise<PlayerRow> {
  const recoveryHash = await hashRecoverySecret(recoverySecret);
  return db
    .insertInto("players")
    .values({ recovery_hash: recoveryHash, kind: "human" })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** True for the one global computer-opponent actor. Identity authority is
 * `players.kind='computer'`; this id-based check is the cheap equivalent used
 * where a player id is already in hand. */
export function isComputerPlayerId(playerId: string): boolean {
  return playerId === COMPUTER_PLAYER_ID;
}

/**
 * Idempotently ensures the single credential-less computer player exists.
 * Migration 0018 seeds it for production; this makes the invariant hold on a
 * fresh or truncated database too (tests, and as defense-in-depth before a
 * bot member is created). Never creates a recovery secret -- the row is
 * `kind='computer'` with a NULL `recovery_hash`, which the DB CHECK requires.
 *
 * If the fixed id is already occupied by a row that does NOT satisfy the
 * computer-player invariant (kind='computer', recovery_hash=NULL, the
 * intended display name), this throws rather than silently returning an
 * incompatible row -- the caller must never treat some other actor as the
 * bot.
 */
export async function ensureComputerPlayer(
  db: Kysely<Database> | Transaction<Database>,
): Promise<PlayerRow> {
  await db
    .insertInto("players")
    .values({
      id: COMPUTER_PLAYER_ID,
      kind: "computer",
      recovery_hash: null,
      display_name_default: COMPUTER_DISPLAY_NAME,
    })
    .onConflict((oc) => oc.column("id").doNothing())
    .execute();

  const row = await db
    .selectFrom("players")
    .selectAll()
    .where("id", "=", COMPUTER_PLAYER_ID)
    .executeTakeFirstOrThrow();

  if (
    row.kind !== "computer" ||
    row.recovery_hash !== null ||
    row.display_name_default !== COMPUTER_DISPLAY_NAME
  ) {
    throw new Error(
      `ensureComputerPlayer: id ${COMPUTER_PLAYER_ID} is occupied by an incompatible row ` +
        `(kind=${row.kind}, hasCredential=${row.recovery_hash !== null}, ` +
        `displayName=${String(row.display_name_default)}); refusing to treat it as the computer player`,
    );
  }
  return row;
}

export async function findPlayerById(
  db: Kysely<Database> | Transaction<Database>,
  id: string,
): Promise<PlayerRow | undefined> {
  return db.selectFrom("players").selectAll().where("id", "=", id).executeTakeFirst();
}

export async function rotateRecoverySecret(
  db: Kysely<Database> | Transaction<Database>,
  playerId: string,
  newSecret: string,
): Promise<PlayerRow> {
  const recoveryHash = await hashRecoverySecret(newSecret);
  return db
    .updateTable("players")
    .set({ recovery_hash: recoveryHash, recovery_rotated_at: new Date() })
    .where("id", "=", playerId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export type CreateAccountOutcome =
  | { readonly kind: "created"; readonly player: PlayerRow }
  | { readonly kind: "taken" };

/**
 * Creates a password-credentialed human identity with its username claimed
 * in the same INSERT (accounts merge the old mint-then-claim two-step). The
 * partial unique index on username_canonical is the concurrency arbiter,
 * exactly as in claimUsername: a losing racer catches 23505 and reports
 * "taken". Reserved-name policy stays at the route layer.
 */
export async function createAccount(
  db: Kysely<Database> | Transaction<Database>,
  input: { readonly username: string; readonly email: string; readonly passwordHash: string },
): Promise<CreateAccountOutcome> {
  try {
    const player = await db
      .insertInto("players")
      .values({
        kind: "human",
        username: input.username,
        username_canonical: canonicalizeUsername(input.username),
        email: input.email,
        password_hash: input.passwordHash,
        password_updated_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { kind: "created", player };
  } catch (err) {
    if (isUniqueViolation(err)) return { kind: "taken" };
    throw err;
  }
}

export async function findPlayerByCanonicalUsername(
  db: Kysely<Database> | Transaction<Database>,
  usernameCanonical: string,
): Promise<PlayerRow | undefined> {
  return db
    .selectFrom("players")
    .selectAll()
    .where("username_canonical", "=", usernameCanonical)
    .where("kind", "=", "human")
    .executeTakeFirst();
}

/** Sets a new password and retires the legacy recovery credential -- one
 * credential system per account (accounts plan D4). recovery_rotated_at is
 * left as history. */
export async function setPassword(
  db: Kysely<Database> | Transaction<Database>,
  playerId: string,
  passwordHash: string,
): Promise<PlayerRow> {
  return db
    .updateTable("players")
    .set({ password_hash: passwordHash, password_updated_at: new Date(), recovery_hash: null })
    .where("id", "=", playerId)
    .where("kind", "=", "human")
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function setEmail(
  db: Kysely<Database> | Transaction<Database>,
  playerId: string,
  email: string,
): Promise<PlayerRow> {
  return db
    .updateTable("players")
    .set({ email })
    .where("id", "=", playerId)
    .where("kind", "=", "human")
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function setPortrait(
  db: Kysely<Database> | Transaction<Database>,
  playerId: string,
  portraitId: number | null,
): Promise<PlayerRow> {
  return db
    .updateTable("players")
    .set({ portrait_id: portraitId })
    .where("id", "=", playerId)
    .where("kind", "=", "human")
    .returningAll()
    .executeTakeFirstOrThrow();
}

export type UpgradeLegacyAccountOutcome =
  | { readonly kind: "upgraded"; readonly player: PlayerRow }
  | { readonly kind: "already_upgraded" }
  | { readonly kind: "not_eligible" };

/**
 * Converts a legacy recovery-code identity into a password account: sets
 * email + password and retires the recovery credential in one guarded
 * UPDATE. Like claimUsername, the WHERE clause is the decision and the
 * follow-up read is diagnostic only.
 */
export async function upgradeLegacyAccount(
  db: Kysely<Database> | Transaction<Database>,
  playerId: string,
  input: { readonly email: string; readonly passwordHash: string },
): Promise<UpgradeLegacyAccountOutcome> {
  const updated = await db
    .updateTable("players")
    .set({
      email: input.email,
      password_hash: input.passwordHash,
      password_updated_at: new Date(),
      recovery_hash: null,
    })
    .where("id", "=", playerId)
    .where("kind", "=", "human")
    .where("password_hash", "is", null)
    .where("recovery_hash", "is not", null)
    .returningAll()
    .executeTakeFirst();

  if (updated) return { kind: "upgraded", player: updated };

  const current = await db
    .selectFrom("players")
    .selectAll()
    .where("id", "=", playerId)
    .executeTakeFirst();
  if (current && current.kind === "human" && current.password_hash !== null) {
    return { kind: "already_upgraded" };
  }
  return { kind: "not_eligible" };
}

export type ClaimUsernameOutcome =
  | { readonly kind: "claimed"; readonly player: PlayerRow }
  | { readonly kind: "already_claimed_same"; readonly player: PlayerRow }
  | { readonly kind: "already_claimed_different" }
  | { readonly kind: "not_human" }
  | { readonly kind: "taken" };

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

/**
 * Claims a globally unique username for a human identity.
 *
 * The UPDATE's own WHERE clause (kind='human' AND username_canonical IS
 * NULL) is the primary guard; the partial unique index on
 * username_canonical (migration 0019) is the final concurrency arbiter for
 * two different identities racing for the same name -- exactly one of two
 * concurrent claims for the same canonical username succeeds, the other
 * catches a 23505 here and reports "taken".
 *
 * Idempotent: reclaiming the identity's own current username (same
 * canonical form) reports "already_claimed_same" without a write, rather
 * than an error. An attempt to change an already-claimed username to a
 * different value is rejected ("already_claimed_different") -- claims are
 * one-shot by design (docs plan DR-4: reserved indefinitely).
 */
export async function claimUsername(
  db: Kysely<Database> | Transaction<Database>,
  playerId: string,
  username: string,
): Promise<ClaimUsernameOutcome> {
  const usernameCanonical = canonicalizeUsername(username);

  let updated: PlayerRow | undefined;
  try {
    updated = await db
      .updateTable("players")
      .set({ username, username_canonical: usernameCanonical })
      .where("id", "=", playerId)
      .where("kind", "=", "human")
      .where("username_canonical", "is", null)
      .returningAll()
      .executeTakeFirst();
  } catch (err) {
    if (isUniqueViolation(err)) return { kind: "taken" };
    throw err;
  }

  if (updated) return { kind: "claimed", player: updated };

  // Nothing matched the WHERE clause above: the identity doesn't exist,
  // isn't human, or already has a username. This read is purely diagnostic
  // (to report a precise reason) -- the UPDATE already made the actual
  // decision, so there's no new race introduced by reading again here.
  const current = await db
    .selectFrom("players")
    .selectAll()
    .where("id", "=", playerId)
    .executeTakeFirst();

  if (!current || current.kind !== "human") return { kind: "not_human" };
  if (current.username_canonical === usernameCanonical) {
    return { kind: "already_claimed_same", player: current };
  }
  return { kind: "already_claimed_different" };
}
