import { randomInt } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/types.js";
import type { RoomRow } from "../db/repositories/rooms.js";
import { updateRoomStatus } from "../db/repositories/rooms.js";
import {
  addRoomMember,
  listRoomMembers,
  resetReadiness,
  type RoomMemberRow,
} from "../db/repositories/roomMembers.js";
import { dealNewGame, findLatestGameForRoom } from "../db/repositories/games.js";
import { lockRoomForUpdate } from "../db/transactions.js";

// The single authoritative, race-safe path for every way a room can deal a
// new game (Phase 4: docs/next-changes-implementation-plan.md, DR-9
// corrected). Every entry point below opens exactly one transaction, locks
// the room row FIRST (SELECT ... FOR UPDATE via lockRoomForUpdate -- the
// same helper Phase 3's join-by-name already used), rechecks status and
// membership under that lock, and deals at most one game through the same
// dealForRoom() primitive. No caller ever locks a `games` row while holding
// a room lock (dealNewGame only INSERTs fresh game/seat/rack/turn rows, it
// never locks an existing one), so there is no room-then-game vs
// game-then-room ordering to conflict with turnActions.ts's separate
// game-row locking (persistTransition) -- the two subsystems' locks are
// disjoint by construction, not by convention.

/** Existing minimum-ready-members rule for a manual Start/Rematch,
 * unchanged from before Phase 4. Auto-start (see joinRoomAndMaybeAutoStart)
 * uses a different rule entirely -- member count reaching capacity,
 * regardless of readiness -- so this constant does not apply there. */
export const MIN_READY_TO_START = 2;

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

/**
 * Deals a new game for exactly `seatMembers` (the caller has already
 * decided who gets seated -- every current member for auto-start, or only
 * the ready ones for a manual Start/Rematch) and transitions the room to
 * in_game, resetting readiness. Must be called with an already-locked room
 * row, inside the caller's own transaction; opens no transaction itself.
 * The unique (room_id, seq) constraint (games table) remains a secondary
 * backstop against a genuine bug in the locking above -- it is never the
 * primary concurrency mechanism, which is the room-row lock every caller
 * below takes before reaching here.
 */
async function dealForRoom(
  trx: Transaction<Database>,
  room: RoomRow,
  seatMembers: readonly RoomMemberRow[],
  seq: number,
): Promise<string> {
  const readyMembers = seatMembers.map((m) => ({
    roomMemberId: m.id,
    playerId: m.player_id,
    displayName: m.display_name,
    controllerType: m.controller_type,
  }));
  const { gameId } = await dealNewGame(
    trx,
    room.id,
    seq,
    readyMembers,
    room.turn_limit_hours,
    randomInt,
  );
  await updateRoomStatus(trx, room.id, "in_game");
  await resetReadiness(trx, room.id);
  return gameId;
}

export type JoinRoomOutcome =
  | { readonly kind: "joined"; readonly gameId: string | null }
  | { readonly kind: "computer_room" }
  | { readonly kind: "not_open" }
  | { readonly kind: "full" }
  | { readonly kind: "display_name_taken" };

/**
 * The one authoritative, race-safe entry point for every human join path
 * (join-by-code, join-by-name, quick-join, and any future one) -- per-route
 * callers only decide *which room* and *what error message* each outcome
 * maps to; the locking, capacity check, member insert, and auto-start
 * decision all live here, once.
 *
 * Locks the room row, rechecks computer-room exclusion / status / capacity
 * under that lock, inserts the member, and -- if the room has now reached
 * its configured capacity -- deals a game and transitions to in_game, ALL
 * inside one transaction. Auto-start seats every CURRENT member regardless
 * of readiness (DR-9, corrected): reaching capacity is the trigger, not a
 * Ready toggle. Always seq=1 -- auto-start can only ever apply to a room's
 * first game (status must be 'open', which no room returns to after a
 * rematch).
 *
 * Does not check "is this player already a member" -- callers that support
 * idempotent reconnect (all of them) must do that check themselves before
 * calling this, exactly as they already do (unchanged from Phase 3).
 */
export async function joinRoomAndMaybeAutoStart(
  db: Kysely<Database>,
  roomId: string,
  playerId: string,
  displayName: string,
): Promise<JoinRoomOutcome> {
  try {
    return await db.transaction().execute(async (trx) => {
      const room = await lockRoomForUpdate(trx, roomId);
      if (room.has_computer) return { kind: "computer_room" };
      if (room.status !== "open") return { kind: "not_open" };

      const membersBefore = await listRoomMembers(trx, room.id);
      if (membersBefore.length >= room.capacity) return { kind: "full" };

      await addRoomMember(trx, room.id, playerId, displayName);

      if (membersBefore.length + 1 < room.capacity) {
        return { kind: "joined", gameId: null };
      }

      // Capacity just reached with this join -- auto-start, seating every
      // current member (not just ready ones).
      const membersAfter = await listRoomMembers(trx, room.id);
      const gameId = await dealForRoom(trx, room, membersAfter, 1);
      return { kind: "joined", gameId };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { kind: "display_name_taken" };
    throw err;
  }
}

export type ManualStartOutcome =
  | { readonly kind: "started"; readonly gameId: string }
  | { readonly kind: "not_open" }
  | { readonly kind: "insufficient_ready" };

/**
 * The host-controlled Start Game action. Locks the room row, rechecks
 * status and readiness under that lock (host authorization itself is the
 * caller's job -- unchanged from before Phase 4, it needs no lock), and
 * deals a game seating only the currently-ready members -- unfilled seats
 * close, exactly as before. A 3- or 4-player room can still start below
 * capacity this way; auto-start (joinRoomAndMaybeAutoStart) is a separate,
 * non-exclusive trigger that fires from the join path instead.
 */
export async function manualStartRoom(
  db: Kysely<Database>,
  roomId: string,
): Promise<ManualStartOutcome> {
  return db.transaction().execute(async (trx) => {
    const room = await lockRoomForUpdate(trx, roomId);
    if (room.status !== "open") return { kind: "not_open" };

    const members = await listRoomMembers(trx, room.id);
    const ready = members.filter((m) => m.is_ready);
    if (ready.length < MIN_READY_TO_START) return { kind: "insufficient_ready" };

    const gameId = await dealForRoom(trx, room, ready, 1);
    return { kind: "started", gameId };
  });
}

/** Minimum current room members required for a one-click rematch (Phase 5).
 * Distinct from MIN_READY_TO_START -- a rematch no longer depends on
 * readiness at all, it seats every current member, so the floor is simply
 * "enough current members to play" (a human + the computer member counts
 * as two for a Play vs Computer room). */
export const MIN_REMATCH_MEMBERS = 2;

export type ManualRematchOutcome =
  | { readonly kind: "started"; readonly gameId: string }
  | { readonly kind: "not_between_games" }
  | { readonly kind: "insufficient_members" };

/**
 * The host-controlled, one-click rematch action (Phase 5: docs/next-
 * changes-implementation-plan.md). Unlike manualStartRoom, this no longer
 * gates on readiness -- it seats every CURRENT room member (listRoomMembers
 * already excludes anyone who has left, via left_at IS NULL), so neither
 * the host nor any other member needs to mark Ready first. A player who
 * resigned from the completed game is still a current room member (game_
 * seats.status is per-game, not per-membership) and is eligible again here.
 * Same locking discipline as every other entry point in this module: lock
 * the room row first, recheck status/eligibility under that lock, deal at
 * most one game.
 */
export async function manualRematchRoom(
  db: Kysely<Database>,
  roomId: string,
): Promise<ManualRematchOutcome> {
  return db.transaction().execute(async (trx) => {
    const room = await lockRoomForUpdate(trx, roomId);
    if (room.status !== "between_games") return { kind: "not_between_games" };

    const members = await listRoomMembers(trx, room.id);
    if (members.length < MIN_REMATCH_MEMBERS) return { kind: "insufficient_members" };

    const latestGame = await findLatestGameForRoom(trx, room.id);
    const nextSeq = (latestGame?.seq ?? 0) + 1;
    const gameId = await dealForRoom(trx, room, members, nextSeq);
    return { kind: "started", gameId };
  });
}
