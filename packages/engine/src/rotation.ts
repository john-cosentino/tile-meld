import type { GameState } from "./game-types.js";

/**
 * Active seat indices in rotation order, starting at `startIndex` itself
 * (distance 0) and wrapping cyclically through all seats, skipping resigned
 * ones. Used both for turn advancement and for the pool-exhaustion tiebreak
 * ("nearest in turn order starting from the player who would act next").
 */
export function activeRotationFrom(state: GameState, startIndex: number): number[] {
  const n = state.seats.length;
  const order: number[] = [];
  for (let i = 0; i < n; i++) {
    const idx = (startIndex + i) % n;
    if (state.seats[idx]!.status === "active") order.push(idx);
  }
  return order;
}

/**
 * The next active seat after `afterSeatIndex`, cyclically, skipping
 * resigned seats. Throws if no active seats remain -- by this engine's
 * invariants, a game transitions to `status: "completed"` the moment only
 * one active seat is left, so this should never be reached in practice.
 */
export function nextActiveSeat(state: GameState, afterSeatIndex: number): number {
  const rotation = activeRotationFrom(state, (afterSeatIndex + 1) % state.seats.length);
  const next = rotation[0];
  if (next === undefined) throw new Error("no active seats remain");
  return next;
}
