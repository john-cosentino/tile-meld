import type { Kysely, Selectable, Transaction } from "kysely";
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
