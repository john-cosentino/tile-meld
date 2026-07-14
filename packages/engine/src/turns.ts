import type {
  GameEndResult,
  GameState,
  Seat,
  TransitionResult,
  TurnEvent,
  TurnValidationResult,
} from "./game-types.js";
import type { Tile } from "./types.js";
import { hasDuplicateTileIds } from "./tiles.js";
import { validateSet } from "./sets.js";
import { detectGameEnd, score, setFaceValue } from "./scoring.js";
import { nextActiveSeat } from "./rotation.js";

const INITIAL_MELD_THRESHOLD = 30;
const PENALTY_TILE_COUNT = 3;

function assertActiveGame(state: GameState): void {
  if (state.status !== "active") throw new Error("applyX called on a game that is not active");
}

function requireSeat(state: GameState, seatIndex: number): Seat {
  const seat = state.seats[seatIndex];
  if (!seat) throw new Error(`no such seat: ${seatIndex}`);
  return seat;
}

function setKey(tiles: readonly Tile[]): string {
  return tiles
    .map((tile) => tile.tileId)
    .slice()
    .sort()
    .join(",");
}

function drawPenaltyTiles(
  pool: readonly Tile[],
  count: number,
): { readonly drawn: readonly Tile[]; readonly remainingPool: readonly Tile[] } {
  const n = Math.min(count, pool.length);
  return { drawn: pool.slice(pool.length - n), remainingPool: pool.slice(0, pool.length - n) };
}

function replaceSeat(seats: readonly Seat[], seatIndex: number, patch: Partial<Seat>): Seat[] {
  return seats.map((seat) => (seat.seatIndex === seatIndex ? { ...seat, ...patch } : seat));
}

function finalizeTransition(state: GameState, event: TurnEvent): TransitionResult {
  const check = detectGameEnd(state);
  if (!check.ended) {
    return { state, event, gameEnd: { ended: false } };
  }
  const scores = score(state.seats, check.winnerSeatIndex, check.reason);
  const finalState: GameState = { ...state, status: "completed" };
  const gameEnd: GameEndResult = {
    ended: true,
    reason: check.reason,
    winnerSeatIndex: check.winnerSeatIndex,
    scores,
  };
  return { state: finalState, event, gameEnd };
}

/**
 * Validates a proposed final table arrangement against the canonical
 * turn-start state, without mutating anything. Safe to call for
 * non-authoritative client-side hints as well as server-side authority --
 * see docs/opus-implementation-plan.md §4.2 (packages/engine is imported by
 * both). Does not check whether it's actually `seatIndex`'s turn; that is
 * an authorization concern for the caller.
 *
 * Joker retrieval/replacement/rearrangement needs no special-cased logic
 * here: validating the *final* board (every set independently valid, no
 * table tile lost, >=1 rack tile added, and -- pre-initial-meld -- every
 * old set preserved byte-for-byte) fully captures the frozen rules' joker
 * provisions, since a joker is just another table tile once placed.
 */
export function validateTurn(
  state: GameState,
  seatIndex: number,
  proposedTable: readonly (readonly Tile[])[],
): TurnValidationResult {
  const seat = requireSeat(state, seatIndex);

  const setResults = proposedTable.map((tiles) => validateSet(tiles));
  // validateSet always collapses a doubly-invalid arrangement to
  // "invalid_set" (see packages/engine/src/sets.ts) -- the more specific
  // SetInvalidReason values it could theoretically produce never actually
  // occur here, so we use the literal rather than forwarding its type.
  if (setResults.some((result) => !result.valid)) {
    return { valid: false, reason: "invalid_set" };
  }

  const allNewTiles = proposedTable.flat();
  if (hasDuplicateTileIds(allNewTiles)) {
    return { valid: false, reason: "duplicate_tile_id" };
  }

  const oldTableTiles = state.table.flat();
  const oldTileIds = new Set(oldTableTiles.map((tile) => tile.tileId));
  const newTileIds = new Set(allNewTiles.map((tile) => tile.tileId));

  for (const tileId of oldTileIds) {
    if (!newTileIds.has(tileId)) {
      return { valid: false, reason: "table_tile_removed" };
    }
  }

  const addedTiles = allNewTiles.filter((tile) => !oldTileIds.has(tile.tileId));
  const rackTileIds = new Set(seat.rack.map((tile) => tile.tileId));
  for (const tile of addedTiles) {
    if (!rackTileIds.has(tile.tileId)) {
      return { valid: false, reason: "commit_uses_untracked_tile" };
    }
  }

  if (addedTiles.length === 0) {
    return { valid: false, reason: "commit_no_rack_tile_used" };
  }

  if (!seat.hasInitialMeld) {
    const oldSetKeys = state.table.map(setKey);
    const newSetKeys = new Set(proposedTable.map(setKey));
    for (const key of oldSetKeys) {
      if (!newSetKeys.has(key)) {
        return { valid: false, reason: "initial_meld_table_modified" };
      }
    }

    const oldSetKeySet = new Set(oldSetKeys);
    const newSetsThisTurn = proposedTable.filter((tiles) => !oldSetKeySet.has(setKey(tiles)));
    const totalFaceValue = newSetsThisTurn.reduce((sum, tiles) => {
      const result = validateSet(tiles);
      // Already confirmed valid above (setResults check); re-validating
      // here is cheap and avoids a fragile indexOf-based lookup.
      return result.valid ? sum + setFaceValue(tiles, result.jokerAssignments) : sum;
    }, 0);

    if (totalFaceValue < INITIAL_MELD_THRESHOLD) {
      return { valid: false, reason: "initial_meld_below_30" };
    }

    return { valid: true, completesInitialMeld: true };
  }

  return { valid: true, completesInitialMeld: false };
}

/**
 * The server-authoritative commit transition. Always produces a new state:
 * either the accepted table (on success) or the unchanged table plus a
 * 3-tile penalty and forfeited turn (on rejection). See §7.6 for exactly
 * when the penalty applies -- only here, never for stale/duplicate/
 * malformed/authorization failures, which are the caller's job to reject
 * before ever calling this function.
 */
export function applyCommit(
  state: GameState,
  seatIndex: number,
  proposedTable: readonly (readonly Tile[])[],
): TransitionResult {
  assertActiveGame(state);
  const seat = requireSeat(state, seatIndex);
  const validation = validateTurn(state, seatIndex, proposedTable);

  if (validation.valid) {
    const oldTileIds = new Set(state.table.flat().map((tile) => tile.tileId));
    const addedTiles = proposedTable.flat().filter((tile) => !oldTileIds.has(tile.tileId));
    const addedIds = new Set(addedTiles.map((tile) => tile.tileId));
    const newRack = seat.rack.filter((tile) => !addedIds.has(tile.tileId));

    const newSeats = replaceSeat(state.seats, seatIndex, {
      rack: newRack,
      hasInitialMeld: seat.hasInitialMeld || validation.completesInitialMeld,
    });

    const newState: GameState = {
      ...state,
      table: proposedTable,
      seats: newSeats,
      activeSeat: nextActiveSeat(state, seatIndex),
      consecutivePasses: 0,
    };
    return finalizeTransition(newState, { type: "committed", seatIndex });
  }

  const { drawn, remainingPool } = drawPenaltyTiles(state.pool, PENALTY_TILE_COUNT);
  const newSeats = replaceSeat(state.seats, seatIndex, { rack: [...seat.rack, ...drawn] });
  const newState: GameState = {
    ...state,
    pool: remainingPool,
    seats: newSeats,
    activeSeat: nextActiveSeat(state, seatIndex),
    consecutivePasses: state.consecutivePasses + 1,
  };
  return finalizeTransition(newState, {
    type: "invalid_commit",
    seatIndex,
    reason: validation.reason,
    penaltyDrawn: drawn.length,
  });
}

/** Draws exactly one tile and ends the turn. Requires a non-empty pool --
 * once the pool is empty, the caller should call `applyPass` instead (the
 * product-level "Draw" button becomes "Pass"; see D-EMPTYDRAW). */
export function applyDraw(state: GameState, seatIndex: number): TransitionResult {
  assertActiveGame(state);
  const seat = requireSeat(state, seatIndex);
  if (state.pool.length === 0) {
    throw new Error("applyDraw called with an empty pool -- use applyPass instead");
  }

  const drawnTile = state.pool[state.pool.length - 1]!;
  const remainingPool = state.pool.slice(0, -1);
  const newSeats = replaceSeat(state.seats, seatIndex, { rack: [...seat.rack, drawnTile] });
  const newState: GameState = {
    ...state,
    pool: remainingPool,
    seats: newSeats,
    activeSeat: nextActiveSeat(state, seatIndex),
    consecutivePasses: 0,
  };
  return finalizeTransition(newState, { type: "drawn", seatIndex });
}

/** Ends the turn without drawing or playing -- the only option once the
 * pool is empty and no legal play is available. Feeds stalemate detection
 * (docs/opus-implementation-plan.md E-STALE). */
export function applyPass(state: GameState, seatIndex: number): TransitionResult {
  assertActiveGame(state);
  requireSeat(state, seatIndex);
  const newState: GameState = {
    ...state,
    activeSeat: nextActiveSeat(state, seatIndex),
    consecutivePasses: state.consecutivePasses + 1,
  };
  return finalizeTransition(newState, { type: "passed", seatIndex });
}

/** Turn-deadline expiry: forfeits the turn and draws up to 3 penalty tiles
 * (0 if the pool is empty). */
export function applyTimeout(state: GameState, seatIndex: number): TransitionResult {
  assertActiveGame(state);
  const seat = requireSeat(state, seatIndex);
  const { drawn, remainingPool } = drawPenaltyTiles(state.pool, PENALTY_TILE_COUNT);
  const newSeats = replaceSeat(state.seats, seatIndex, { rack: [...seat.rack, ...drawn] });
  const newState: GameState = {
    ...state,
    pool: remainingPool,
    seats: newSeats,
    activeSeat: nextActiveSeat(state, seatIndex),
    consecutivePasses: state.consecutivePasses + 1,
  };
  return finalizeTransition(newState, {
    type: "timed_out",
    seatIndex,
    penaltyDrawn: drawn.length,
  });
}

/** Marks a seat resigned; its rack is frozen from this point on and never
 * touched again. If only one active seat remains afterward, that seat wins
 * immediately (this subsumes the 2-player E-RESIGN2 case as well as the
 * general 3-4 player "continue while >=2 active remain" rule). */
export function applyResign(state: GameState, seatIndex: number): TransitionResult {
  assertActiveGame(state);
  const seat = requireSeat(state, seatIndex);
  if (seat.status === "resigned") throw new Error(`seat ${seatIndex} has already resigned`);

  const seatsAfterResign = replaceSeat(state.seats, seatIndex, { status: "resigned" });
  const stateAfterResign: GameState = { ...state, seats: seatsAfterResign };
  const activeSeat =
    state.activeSeat === seatIndex ? nextActiveSeat(stateAfterResign, seatIndex) : state.activeSeat;

  const newState: GameState = { ...stateAfterResign, activeSeat };
  return finalizeTransition(newState, { type: "resigned", seatIndex });
}
