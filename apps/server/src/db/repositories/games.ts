import type { Kysely, Selectable, Transaction } from "kysely";
import {
  createTileCatalog,
  shuffle,
  validateSet,
  type RandomInt,
  type TransitionResult,
  type Tile,
} from "@tile-meld/engine";
import type { Database, GamesTable } from "../types.js";
import type { PersistedGameView, SeatWithDisplayName } from "../redact.js";
import { resolveTiles, tileIdsOf } from "../catalog.js";

const RACK_SIZE = 14;

export type GameRow = Selectable<GamesTable>;

export type ReadyMember = {
  readonly roomMemberId: string;
  readonly playerId: string;
  readonly displayName: string;
};

/**
 * Deals a new game: shuffles the full catalog, deals RACK_SIZE tiles to
 * each ready member's seat, persists the remainder as the game's pool, and
 * picks a starting seat uniformly at random (E-START). Must run inside a
 * transaction the caller controls (room status transitions, readiness
 * reset, etc. all belong in the same one).
 */
export async function dealNewGame(
  trx: Transaction<Database>,
  roomId: string,
  seq: number,
  readyMembers: readonly ReadyMember[],
  turnLimitHours: number,
  randomInt: RandomInt,
): Promise<{ gameId: string }> {
  const seatCount = readyMembers.length;
  const shuffled = shuffle(createTileCatalog(), randomInt);

  const racks: Tile[][] = [];
  let cursor = 0;
  for (let i = 0; i < seatCount; i++) {
    racks.push(shuffled.slice(cursor, cursor + RACK_SIZE));
    cursor += RACK_SIZE;
  }
  const poolAtDeal = shuffled.slice(cursor);
  const startingSeat = randomInt(seatCount);

  const gameRow = await trx
    .insertInto("games")
    .values({
      room_id: roomId,
      seq,
      status: "active",
      pool_order: tileIdsOf(poolAtDeal),
      pool_cursor: 0,
      active_seat: startingSeat,
      version: 0,
      consecutive_passes: 0,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  for (let seatIndex = 0; seatIndex < seatCount; seatIndex++) {
    const member = readyMembers[seatIndex]!;
    await trx
      .insertInto("game_seats")
      .values({
        game_id: gameRow.id,
        room_member_id: member.roomMemberId,
        player_id: member.playerId,
        seat_index: seatIndex,
        display_name: member.displayName,
        status: "active",
        has_initial_meld: false,
        join_order: seatIndex,
      })
      .execute();

    await trx
      .insertInto("racks")
      .values({
        game_id: gameRow.id,
        seat_index: seatIndex,
        tiles: tileIdsOf(racks[seatIndex]!),
      })
      .execute();
  }

  const deadlineAt = new Date(Date.now() + turnLimitHours * 3_600_000);
  const turnRow = await trx
    .insertInto("turns")
    .values({
      game_id: gameRow.id,
      seat_index: startingSeat,
      status: "active",
      deadline_at: deadlineAt,
      version_at_start: 0,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  await trx
    .updateTable("games")
    .set({ current_turn_id: turnRow.id })
    .where("id", "=", gameRow.id)
    .execute();

  return { gameId: gameRow.id };
}

export type LoadedGame = PersistedGameView & { readonly gameId: string; readonly version: number };

/** Reconstructs the engine-shape game state (with display names attached)
 * from persisted rows. Used both to feed the pure engine's apply* functions
 * and to build a redacted view via redactGameFor. */
export async function loadGameState(
  db: Kysely<Database> | Transaction<Database>,
  gameId: string,
): Promise<LoadedGame> {
  const gameRow = await db
    .selectFrom("games")
    .selectAll()
    .where("id", "=", gameId)
    .executeTakeFirstOrThrow();

  const seatRows = await db
    .selectFrom("game_seats")
    .selectAll()
    .where("game_id", "=", gameId)
    .orderBy("seat_index", "asc")
    .execute();

  const rackRows = await db.selectFrom("racks").selectAll().where("game_id", "=", gameId).execute();
  const rackBySeat = new Map(rackRows.map((row) => [row.seat_index, row.tiles]));

  const tableRows = await db
    .selectFrom("table_sets")
    .selectAll()
    .where("game_id", "=", gameId)
    .orderBy("ordinal", "asc")
    .execute();

  const seats: SeatWithDisplayName[] = seatRows.map((row) => ({
    seatIndex: row.seat_index,
    rack: resolveTiles(rackBySeat.get(row.seat_index) ?? []),
    status: row.status,
    hasInitialMeld: row.has_initial_meld,
    displayName: row.display_name,
  }));

  const table = tableRows.map((row) => resolveTiles(row.tiles));

  const remainingPoolIds = gameRow.pool_order.slice(
    0,
    gameRow.pool_order.length - gameRow.pool_cursor,
  );
  const pool = resolveTiles(remainingPoolIds);

  return {
    gameId: gameRow.id,
    table,
    pool,
    seats,
    activeSeat: gameRow.active_seat,
    consecutivePasses: gameRow.consecutive_passes,
    status: gameRow.status,
    version: gameRow.version,
  };
}

/**
 * Persists an engine TransitionResult. Locks the games row and checks
 * `expectedVersion` first (optimistic concurrency -- docs/opus-
 * implementation-plan.md §6.2/§7.5); throws on a stale version rather than
 * silently applying over newer state. Replaces table_sets wholesale
 * (mirrors the engine's own whole-table replacement), updates every seat's
 * rack/status/initial-meld flag, rotates the turn row when the active seat
 * actually changed, and marks the game completed when the transition ended
 * it.
 */
export async function persistTransition(
  trx: Transaction<Database>,
  gameId: string,
  expectedVersion: number,
  result: TransitionResult,
  turnLimitHours: number,
): Promise<void> {
  const gameRow = await trx
    .selectFrom("games")
    .selectAll()
    .where("id", "=", gameId)
    .forUpdate()
    .executeTakeFirstOrThrow();

  if (gameRow.version !== expectedVersion) {
    throw new Error(
      `persistTransition: stale version (expected ${expectedVersion}, found ${gameRow.version})`,
    );
  }

  const newState = result.state;

  await trx.deleteFrom("table_sets").where("game_id", "=", gameId).execute();
  for (let ordinal = 0; ordinal < newState.table.length; ordinal++) {
    const tiles = newState.table[ordinal]!;
    const validation = validateSet(tiles);
    if (!validation.valid) {
      throw new Error("persistTransition: an accepted commit produced an invalid table set");
    }
    const jokerRepr = Object.fromEntries(
      validation.jokerAssignments.map((assignment) => [assignment.tileId, assignment.represents]),
    );
    await trx
      .insertInto("table_sets")
      .values({
        game_id: gameId,
        ordinal,
        kind: validation.kind,
        tiles: tileIdsOf(tiles),
        joker_repr: JSON.stringify(jokerRepr),
      })
      .execute();
  }

  for (const seat of newState.seats) {
    await trx
      .updateTable("racks")
      .set({ tiles: tileIdsOf(seat.rack) })
      .where("game_id", "=", gameId)
      .where("seat_index", "=", seat.seatIndex)
      .execute();

    await trx
      .updateTable("game_seats")
      .set({ status: seat.status, has_initial_meld: seat.hasInitialMeld })
      .where("game_id", "=", gameId)
      .where("seat_index", "=", seat.seatIndex)
      .execute();
  }

  const newPoolCursor = gameRow.pool_order.length - newState.pool.length;
  const turnAdvanced = newState.activeSeat !== gameRow.active_seat;

  if (turnAdvanced && gameRow.current_turn_id) {
    await trx
      .updateTable("turns")
      .set({ status: result.event.type, resolved_at: new Date() })
      .where("id", "=", gameRow.current_turn_id)
      .execute();
  }

  let newCurrentTurnId: string | undefined;
  if (turnAdvanced && !result.gameEnd.ended) {
    const deadlineAt = new Date(Date.now() + turnLimitHours * 3_600_000);
    const newTurn = await trx
      .insertInto("turns")
      .values({
        game_id: gameId,
        seat_index: newState.activeSeat,
        status: "active",
        deadline_at: deadlineAt,
        version_at_start: gameRow.version + 1,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    newCurrentTurnId = newTurn.id;
  }

  await trx
    .updateTable("games")
    .set({
      active_seat: newState.activeSeat,
      consecutive_passes: newState.consecutivePasses,
      pool_cursor: newPoolCursor,
      version: gameRow.version + 1,
      status: newState.status,
      ...(result.gameEnd.ended
        ? { completed_at: new Date(), winner_seat: result.gameEnd.winnerSeatIndex }
        : {}),
      ...(newCurrentTurnId ? { current_turn_id: newCurrentTurnId } : {}),
    })
    .where("id", "=", gameId)
    .execute();
}

/** The room's most recent game (highest seq), if any -- used to determine
 * the next rematch's seq number and to check whether a rematch is
 * currently allowed (the room must be between_games; see room lifecycle
 * logic in the HTTP layer). */
export async function findLatestGameForRoom(
  db: Kysely<Database> | Transaction<Database>,
  roomId: string,
): Promise<GameRow | undefined> {
  return db
    .selectFrom("games")
    .selectAll()
    .where("room_id", "=", roomId)
    .orderBy("seq", "desc")
    .limit(1)
    .executeTakeFirst();
}

/**
 * A player's seat in a specific game, if any. Authorization for viewing a
 * game's redacted state is based on this -- game_seats are immutable
 * historical records, so this still resolves after the seat's room_member
 * has left the room or the game has completed.
 */
export async function findGameSeatForPlayer(
  db: Kysely<Database> | Transaction<Database>,
  gameId: string,
  playerId: string,
): Promise<{ readonly seatIndex: number } | undefined> {
  const row = await db
    .selectFrom("game_seats")
    .select(["seat_index"])
    .where("game_id", "=", gameId)
    .where("player_id", "=", playerId)
    .executeTakeFirst();
  return row ? { seatIndex: row.seat_index } : undefined;
}
