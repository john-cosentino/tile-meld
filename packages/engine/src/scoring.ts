import type { GameEndCheck, GameEndReason, GameState, ScoreEntry, Seat } from "./game-types.js";
import type { JokerAssignment, Tile } from "./types.js";
import { activeRotationFrom } from "./rotation.js";

/** A joker left on a rack at game end is always worth this penalty,
 * regardless of what it could have represented in a set. */
export const JOKER_RACK_PENALTY = 30;

export function rackFaceValue(rack: readonly Tile[]): number {
  return rack.reduce(
    (sum, tile) => sum + (tile.kind === "joker" ? JOKER_RACK_PENALTY : tile.value),
    0,
  );
}

/**
 * Total face value of a validated set, using each tile's own value (or a
 * joker's represented value from `jokerAssignments`). Used for the initial
 * meld's >=30 threshold. `jokerAssignments` normally comes straight from a
 * successful `validateSet`/`validateRun`/`validateGroup` call on `tiles`.
 */
export function setFaceValue(
  tiles: readonly Tile[],
  jokerAssignments: readonly JokerAssignment[],
): number {
  const jokerValues = new Map(jokerAssignments.map((a) => [a.tileId, a.represents.value]));
  return tiles.reduce((sum, tile) => {
    if (tile.kind === "numbered") return sum + tile.value;
    const value = jokerValues.get(tile.tileId);
    if (value === undefined) {
      throw new Error(`setFaceValue: no joker assignment provided for ${tile.tileId}`);
    }
    return sum + value;
  }, 0);
}

function activeSeatCount(state: GameState): number {
  return state.seats.filter((seat) => seat.status === "active").length;
}

/**
 * Determines whether the game has just ended and, if so, who won and why.
 * Does not compute scores -- see `score()`. Checked uniformly after every
 * state-mutating transition (docs/opus-implementation-plan.md §3.1, E-TIE,
 * E-RESIGN2/E-RESIGNN).
 */
export function detectGameEnd(state: GameState): GameEndCheck {
  if (state.status !== "active") return { ended: false };

  const emptyRackSeat = state.seats.find(
    (seat) => seat.status === "active" && seat.rack.length === 0,
  );
  if (emptyRackSeat) {
    return { ended: true, reason: "empty_rack", winnerSeatIndex: emptyRackSeat.seatIndex };
  }

  const remaining = activeSeatCount(state);
  if (remaining === 1) {
    const lastStanding = state.seats.find((seat) => seat.status === "active")!;
    return { ended: true, reason: "last_active_standing", winnerSeatIndex: lastStanding.seatIndex };
  }

  if (state.pool.length === 0 && state.consecutivePasses >= remaining) {
    return {
      ended: true,
      reason: "pool_exhausted",
      winnerSeatIndex: pickPoolExhaustionWinner(state),
    };
  }

  return { ended: false };
}

/** Tiebreak (E-TIE): lowest face value, then fewest tiles, then nearest in
 * turn order starting from the player who would act next. */
function pickPoolExhaustionWinner(state: GameState): number {
  const rotation = activeRotationFrom(state, state.activeSeat);
  const candidates = state.seats
    .filter((seat) => seat.status === "active")
    .map((seat) => ({
      seatIndex: seat.seatIndex,
      faceValue: rackFaceValue(seat.rack),
      tileCount: seat.rack.length,
      rotationDistance: rotation.indexOf(seat.seatIndex),
    }));
  candidates.sort(
    (a, b) =>
      a.faceValue - b.faceValue ||
      a.tileCount - b.tileCount ||
      a.rotationDistance - b.rotationDistance,
  );
  return candidates[0]!.seatIndex;
}

/** Every non-winner scores -(their own rack); winner scores the sum. Used
 * for both a normal (empty-rack) win and a last-active-standing win via
 * resignation -- these use the identical formula (E-RESIGN2: "score as a
 * normal win"). */
function scoreByOwnRack(seats: readonly Seat[], winnerSeatIndex: number): ScoreEntry[] {
  const losers = seats
    .filter((seat) => seat.seatIndex !== winnerSeatIndex)
    .map((seat) => ({ seatIndex: seat.seatIndex, points: -rackFaceValue(seat.rack) }));
  const winnerPoints = -losers.reduce((sum, entry) => sum + entry.points, 0);
  return [...losers, { seatIndex: winnerSeatIndex, points: winnerPoints }];
}

/** Active non-winners score -(theirRack - winnerRack); resigned players
 * score -(their entire frozen rack), never a difference, so a resigned
 * player can never gain from a small frozen rack. Winner takes the opposite
 * of the combined total. See docs/opus-implementation-plan.md E-RESIGNN. */
function scorePoolExhaustion(seats: readonly Seat[], winnerSeatIndex: number): ScoreEntry[] {
  const winner = seats.find((seat) => seat.seatIndex === winnerSeatIndex)!;
  const winnerRack = rackFaceValue(winner.rack);
  const losers = seats
    .filter((seat) => seat.seatIndex !== winnerSeatIndex)
    .map((seat) => {
      const rack = rackFaceValue(seat.rack);
      const points = seat.status === "resigned" ? -rack : -(rack - winnerRack);
      return { seatIndex: seat.seatIndex, points };
    });
  const winnerPoints = -losers.reduce((sum, entry) => sum + entry.points, 0);
  return [...losers, { seatIndex: winnerSeatIndex, points: winnerPoints }];
}

export function score(
  seats: readonly Seat[],
  winnerSeatIndex: number,
  reason: GameEndReason,
): ScoreEntry[] {
  return reason === "pool_exhausted"
    ? scorePoolExhaustion(seats, winnerSeatIndex)
    : scoreByOwnRack(seats, winnerSeatIndex);
}
