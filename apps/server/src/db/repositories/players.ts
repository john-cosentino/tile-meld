import type { Kysely, Selectable, Transaction } from "kysely";
import { canonicalizeUsername } from "@tile-meld/shared";
import type { Database, PlayersTable } from "../types.js";
import { COMPUTER_DISPLAY_NAME, COMPUTER_PLAYER_ID } from "../botIdentity.js";

export type PlayerRow = Selectable<PlayersTable>;

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
 * bot member is created). Never creates any credential -- the row is
 * `kind='computer'` with every credential column NULL, which the DB CHECK
 * requires.
 *
 * If the fixed id is already occupied by a row that does NOT satisfy the
 * computer-player invariant (kind='computer', password_hash=NULL, the
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
    row.password_hash !== null ||
    row.display_name_default !== COMPUTER_DISPLAY_NAME
  ) {
    throw new Error(
      `ensureComputerPlayer: id ${COMPUTER_PLAYER_ID} is occupied by an incompatible row ` +
        `(kind=${row.kind}, hasCredential=${row.password_hash !== null}, ` +
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

export type CreateAccountOutcome =
  { readonly kind: "created"; readonly player: PlayerRow } | { readonly kind: "taken" };

/**
 * Creates a password-credentialed human identity with its username claimed
 * in one INSERT. The partial unique index on username_canonical is the
 * concurrency arbiter: a losing racer catches 23505 and reports "taken".
 * Reserved-name policy stays at the route layer.
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

/** Sets a new password (change-password and reset-confirm). */
export async function setPassword(
  db: Kysely<Database> | Transaction<Database>,
  playerId: string,
  passwordHash: string,
): Promise<PlayerRow> {
  return db
    .updateTable("players")
    .set({ password_hash: passwordHash, password_updated_at: new Date() })
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

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}
