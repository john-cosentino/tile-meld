import type { Transaction } from "kysely";
import {
  applyCommit,
  applyDraw,
  applyPass,
  applyResign,
  applyTimeout,
  type GameState,
  type GameEndResult,
  type TransitionResult,
  type Tile,
} from "@tile-meld/engine";
import type { AppInstance } from "../http/types.js";
import type { Database } from "../db/types.js";
import {
  findGameSeatForPlayer,
  listGameSeatPlayerIds,
  loadGameState,
  persistTransition,
  type GameRow,
} from "../db/repositories/games.js";
import { findRoomById, updateRoomStatus } from "../db/repositories/rooms.js";
import { appendGameEvent } from "../db/repositories/gameEvents.js";
import {
  getRoomScores,
  recordGameResult,
  type RoomScoreRow,
} from "../db/repositories/roomScores.js";
import {
  findIdempotentResult,
  recordIdempotentResult,
} from "../db/repositories/idempotencyKeys.js";
import { resolveTiles } from "../db/catalog.js";

// The full turn lifecycle -- docs/opus-implementation-plan.md §6.2 (turn-
// commit and timeout are "the critical sections"), §7.5 (idempotency +
// optimistic concurrency), §7.6 (exactly when the invalid-commit penalty
// fires), §8.3 (the timeout transaction). Both the Socket.IO gateway and
// the deadline sweep call into this module rather than touching the engine
// or persistence layer directly, so there is exactly one place that gets
// the transaction boundaries and rule ordering right.

export type ActionErrorCode = "not_found" | "forbidden" | "conflict" | "stale" | "invalid";

export class ActionError extends Error {
  readonly code: ActionErrorCode;
  constructor(code: ActionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type TurnActionResult = {
  readonly version: number;
  readonly event: TransitionResult["event"];
  readonly gameEnd: GameEndResult;
  readonly nextTurn?: { readonly seatIndex: number; readonly deadlineAt: string };
  readonly roomCumulative?: readonly RoomScoreRow[];
};

/**
 * Applies a completed engine TransitionResult's side effects that live
 * outside the pure state (§6.2 steps 3-4): appends the redaction-safe
 * event, and -- if the transition ended the game -- flips the room to
 * between_games and folds the result into room_scores. Returns the fields
 * a caller needs to build a wire-level result/broadcast, since the engine's
 * own TransitionResult has no notion of a persisted deadline or room
 * scores (those are application concerns layered on top; see
 * packages/engine/src/game-types.ts).
 */
async function applySideEffects(
  trx: Transaction<Database>,
  gameRow: GameRow,
  seatIndex: number,
  result: TransitionResult,
): Promise<Pick<TurnActionResult, "nextTurn" | "roomCumulative">> {
  const room = await requireRoom(trx, gameRow);
  await persistTransition(trx, gameRow.id, gameRow.version, result, room.turn_limit_hours);
  await appendGameEvent(
    trx,
    gameRow.id,
    gameRow.version + 1,
    result.event.type,
    seatIndex,
    result.event,
  );

  const gameEnd = result.gameEnd;
  if (gameEnd.ended) {
    await updateRoomStatus(trx, gameRow.room_id, "between_games");
    const seatPlayerIds = await listGameSeatPlayerIds(trx, gameRow.id);
    const results = gameEnd.scores.map((entry) => ({
      playerId: seatPlayerIds.get(entry.seatIndex)!,
      points: entry.points,
      won: entry.seatIndex === gameEnd.winnerSeatIndex,
    }));
    await recordGameResult(trx, gameRow.room_id, results);
    const roomCumulative = await getRoomScores(trx, gameRow.room_id);
    return { roomCumulative };
  }

  const updatedGame = await trx
    .selectFrom("games")
    .select(["current_turn_id"])
    .where("id", "=", gameRow.id)
    .executeTakeFirstOrThrow();
  if (!updatedGame.current_turn_id) return {};
  const newTurn = await trx
    .selectFrom("turns")
    .select(["seat_index", "deadline_at"])
    .where("id", "=", updatedGame.current_turn_id)
    .executeTakeFirst();
  if (!newTurn) return {};
  return {
    nextTurn: { seatIndex: newTurn.seat_index, deadlineAt: newTurn.deadline_at.toISOString() },
  };
}

async function requireRoom(trx: Transaction<Database>, gameRow: GameRow) {
  const room = await findRoomById(trx, gameRow.room_id);
  if (!room) throw new ActionError("not_found", "no such room");
  return room;
}

/**
 * Settles the game's current turn if it is active and past its deadline
 * (§8.3). The caller must already hold the `games` row lock (FOR UPDATE, or
 * FOR UPDATE SKIP LOCKED having confirmed it won the row) -- this function
 * never locks anything itself. That means every code path that ever
 * touches a `turns` row (on-read catch-up, live turn actions, and the
 * sweep) does so only while already holding the corresponding `games` row
 * lock -- one single, consistent lock order. This is a deliberate
 * simplification of the plan's illustrative sweep SQL, which locks `turns`
 * first: with only one row ever explicitly locked, there is no ordering to
 * invert and therefore no deadlock possible between the sweep and the
 * on-read catch-up path (see game/deadlineSweep.ts).
 */
export async function settleOverdueTurnIfNeeded(
  trx: Transaction<Database>,
  gameRow: GameRow,
): Promise<TurnActionResult | undefined> {
  if (gameRow.status !== "active" || !gameRow.current_turn_id) return undefined;
  const turn = await trx
    .selectFrom("turns")
    .selectAll()
    .where("id", "=", gameRow.current_turn_id)
    .executeTakeFirst();
  if (!turn || turn.status !== "active") return undefined;
  if (turn.deadline_at.getTime() > Date.now()) return undefined;

  const loaded = await loadGameState(trx, gameRow.id);
  const result = applyTimeout(loaded, gameRow.active_seat);
  const extra = await applySideEffects(trx, gameRow, gameRow.active_seat, result);

  return { version: gameRow.version + 1, event: result.event, gameEnd: result.gameEnd, ...extra };
}

export type TurnActionParams = {
  readonly gameId: string;
  readonly playerId: string;
  readonly expectedVersion: number;
  readonly turnId: string;
  readonly idempotencyKey: string;
};

/**
 * Shared machinery for commit/draw/pass: lock the game row (serializing all
 * concurrent actions on it, including duplicate idempotent submissions),
 * settle any already-overdue turn first (on-read catch-up, §8.1), then
 * enforce optimistic concurrency and turn ownership before finally running
 * the caller's engine transition. Resign does not use this -- it has no
 * expectedVersion/turnId and is allowed out of turn (§7.3), so it has its
 * own flow below.
 */
async function executeTransition(
  app: AppInstance,
  params: TurnActionParams,
  apply: (state: GameState, seatIndex: number) => TransitionResult,
): Promise<TurnActionResult> {
  return app.db.transaction().execute(async (trx) => {
    const gameRow = await trx
      .selectFrom("games")
      .selectAll()
      .where("id", "=", params.gameId)
      .forUpdate()
      .executeTakeFirst();
    if (!gameRow) throw new ActionError("not_found", "no such game");

    // Re-check idempotency only after acquiring the lock: a concurrent
    // duplicate submission that missed this check before blocking on the
    // lock above will see the first submission's committed result here.
    const existing = await findIdempotentResult(trx, params.playerId, params.idempotencyKey);
    if (existing) return existing.result_payload as TurnActionResult;

    const seat = await findGameSeatForPlayer(trx, params.gameId, params.playerId);
    if (!seat) throw new ActionError("forbidden", "not a seat holder in this game");

    if (gameRow.status !== "active") throw new ActionError("conflict", "game is not active");

    const settled = await settleOverdueTurnIfNeeded(trx, gameRow);
    if (settled) throw new ActionError("stale", "your turn had already expired");

    if (gameRow.version !== params.expectedVersion || gameRow.current_turn_id !== params.turnId) {
      throw new ActionError("stale", "stale version or turn");
    }
    if (gameRow.active_seat !== seat.seatIndex) {
      throw new ActionError("forbidden", "not your turn");
    }

    const loaded = await loadGameState(trx, params.gameId);
    const result = apply(loaded, seat.seatIndex);
    const extra = await applySideEffects(trx, gameRow, seat.seatIndex, result);

    const payload: TurnActionResult = {
      version: gameRow.version + 1,
      event: result.event,
      gameEnd: result.gameEnd,
      ...extra,
    };
    await recordIdempotentResult(
      trx,
      params.playerId,
      params.idempotencyKey,
      params.gameId,
      payload,
    );
    return payload;
  });
}

export type CommitParams = TurnActionParams & {
  readonly arrangement: readonly (readonly string[])[];
};

export async function commitTurn(
  app: AppInstance,
  params: CommitParams,
): Promise<TurnActionResult> {
  let proposedTable: readonly (readonly Tile[])[];
  try {
    proposedTable = params.arrangement.map((ids) => resolveTiles(ids));
  } catch {
    // A structurally-invalid payload (unknown tileId) fails before the
    // engine ever sees it -- per §7.6 step 3, this is a rejected request,
    // not an invalid-commit penalty.
    throw new ActionError("invalid", "arrangement references an unknown tile");
  }
  return executeTransition(app, params, (state, seatIndex) =>
    applyCommit(state, seatIndex, proposedTable),
  );
}

export async function drawTurn(
  app: AppInstance,
  params: TurnActionParams,
): Promise<TurnActionResult> {
  return executeTransition(app, params, (state, seatIndex) => {
    if (state.pool.length === 0) {
      throw new ActionError("invalid", "pool is empty -- pass instead of draw");
    }
    return applyDraw(state, seatIndex);
  });
}

export async function passTurn(
  app: AppInstance,
  params: TurnActionParams,
): Promise<TurnActionResult> {
  return executeTransition(app, params, (state, seatIndex) => {
    if (state.pool.length > 0) {
      throw new ActionError("invalid", "pool is not empty -- draw instead of pass");
    }
    return applyPass(state, seatIndex);
  });
}

export type ResignParams = {
  readonly gameId: string;
  readonly playerId: string;
  readonly idempotencyKey: string;
};

/**
 * Resign has no expectedVersion/turnId and is allowed out of turn (§7.3),
 * so it can't share executeTransition's active-seat gate. It still locks
 * the games row first (serializing against any concurrent action on this
 * game, including a same-tick timeout) and still settles an overdue turn
 * before proceeding, for the same on-read-catch-up correctness reasons.
 */
export async function resignTurn(
  app: AppInstance,
  params: ResignParams,
): Promise<TurnActionResult> {
  return app.db.transaction().execute(async (trx) => {
    const gameRow = await trx
      .selectFrom("games")
      .selectAll()
      .where("id", "=", params.gameId)
      .forUpdate()
      .executeTakeFirst();
    if (!gameRow) throw new ActionError("not_found", "no such game");

    const existing = await findIdempotentResult(trx, params.playerId, params.idempotencyKey);
    if (existing) return existing.result_payload as TurnActionResult;

    const seat = await findGameSeatForPlayer(trx, params.gameId, params.playerId);
    if (!seat) throw new ActionError("forbidden", "not a seat holder in this game");
    if (gameRow.status !== "active") throw new ActionError("conflict", "game is not active");

    await settleOverdueTurnIfNeeded(trx, gameRow);
    const freshGameRow = await trx
      .selectFrom("games")
      .selectAll()
      .where("id", "=", params.gameId)
      .executeTakeFirstOrThrow();
    if (freshGameRow.status !== "active") throw new ActionError("conflict", "game is not active");

    const loaded = await loadGameState(trx, params.gameId);
    const seatState = loaded.seats.find((s) => s.seatIndex === seat.seatIndex);
    if (seatState?.status === "resigned") throw new ActionError("conflict", "already resigned");

    const result = applyResign(loaded, seat.seatIndex);
    const extra = await applySideEffects(trx, freshGameRow, seat.seatIndex, result);

    const payload: TurnActionResult = {
      version: freshGameRow.version + 1,
      event: result.event,
      gameEnd: result.gameEnd,
      ...extra,
    };
    await recordIdempotentResult(
      trx,
      params.playerId,
      params.idempotencyKey,
      params.gameId,
      payload,
    );
    return payload;
  });
}

export type CatchUpResult = Awaited<ReturnType<typeof loadGameState>> & {
  readonly settled?: TurnActionResult;
};

/**
 * On-read/on-connect catch-up (§8.1 point 2): whenever a request or socket
 * touches a game, settle any overdue deadline first, then load the
 * (possibly just-settled) canonical state. Used by GET /api/games/:id and
 * by the Socket.IO gateway's game:join handler.
 */
export async function catchUpAndLoad(app: AppInstance, gameId: string): Promise<CatchUpResult> {
  return app.db.transaction().execute(async (trx) => {
    const gameRow = await trx
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .forUpdate()
      .executeTakeFirst();
    if (!gameRow) throw new ActionError("not_found", "no such game");

    const settled = await settleOverdueTurnIfNeeded(trx, gameRow);
    const loaded = await loadGameState(trx, gameId);
    return settled ? { ...loaded, settled } : loaded;
  });
}
