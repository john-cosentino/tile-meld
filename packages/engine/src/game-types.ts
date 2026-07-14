import type { Tile } from "./types.js";

export type SeatStatus = "active" | "resigned";

export type Seat = {
  readonly seatIndex: number;
  readonly rack: readonly Tile[];
  readonly status: SeatStatus;
  readonly hasInitialMeld: boolean;
};

/** A validated run or group currently on the table. */
export type TableSet = readonly Tile[];

export type GameStatus = "active" | "completed";

/**
 * The pure engine's view of a game. No `version`, deadlines, or DB
 * identifiers -- those are application/persistence concerns layered on top
 * (see docs/opus-implementation-plan.md §6/§8). `pool` is drawn from its
 * end (an arbitrary but consistent convention -- fairness comes from the
 * pool having already been shuffled, not from which end is popped).
 */
export type GameState = {
  readonly pool: readonly Tile[];
  readonly seats: readonly Seat[];
  readonly table: readonly TableSet[];
  readonly activeSeat: number;
  readonly consecutivePasses: number;
  readonly status: GameStatus;
};

// Note: individual-set failures (e.g. a run's color mismatch, a group's
// duplicate color) never surface here directly -- `validateSet` always
// collapses a doubly-invalid arrangement to the generic "invalid_set"
// (see docs/opus-implementation-plan.md Phase 1, and packages/engine
// src/sets.ts). Only "invalid_set" and "duplicate_tile_id" are reachable
// from that per-set validation step; the rest are turn-level checks.
export type TurnInvalidReason =
  | "invalid_set"
  | "duplicate_tile_id"
  | "table_tile_removed"
  | "commit_uses_untracked_tile"
  | "commit_no_rack_tile_used"
  | "initial_meld_table_modified"
  | "initial_meld_below_30";

export type ValidTurnResult = {
  readonly valid: true;
  readonly completesInitialMeld: boolean;
};
export type InvalidTurnResult = { readonly valid: false; readonly reason: TurnInvalidReason };
export type TurnValidationResult = ValidTurnResult | InvalidTurnResult;

export type TurnEvent =
  | { readonly type: "committed"; readonly seatIndex: number }
  | {
      readonly type: "invalid_commit";
      readonly seatIndex: number;
      readonly reason: TurnInvalidReason;
      readonly penaltyDrawn: number;
    }
  | { readonly type: "drawn"; readonly seatIndex: number }
  | { readonly type: "passed"; readonly seatIndex: number }
  | { readonly type: "resigned"; readonly seatIndex: number }
  | { readonly type: "timed_out"; readonly seatIndex: number; readonly penaltyDrawn: number };

export type GameEndReason = "empty_rack" | "last_active_standing" | "pool_exhausted";

export type GameEndCheck =
  | { readonly ended: false }
  | { readonly ended: true; readonly reason: GameEndReason; readonly winnerSeatIndex: number };

export type ScoreEntry = { readonly seatIndex: number; readonly points: number };

export type GameEndResult =
  | { readonly ended: false }
  | {
      readonly ended: true;
      readonly reason: GameEndReason;
      readonly winnerSeatIndex: number;
      readonly scores: readonly ScoreEntry[];
    };

export type TransitionResult = {
  readonly state: GameState;
  readonly event: TurnEvent;
  readonly gameEnd: GameEndResult;
};
