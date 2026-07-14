// Core domain types for the pure, server-authoritative game-rules engine.
// See docs/opus-implementation-plan.md §3.1 (formal rules) and §5.1 (domain
// concepts). This module has no runtime logic -- types only.

export const COLORS = ["C1", "C2", "C3", "C4"] as const;
export type Color = (typeof COLORS)[number];

export const MIN_VALUE = 1;
export const MAX_VALUE = 13;

/** A tile's face value, always an integer in [MIN_VALUE, MAX_VALUE]. */
export type Value = number;

export type NumberedTile = {
  readonly tileId: string;
  readonly kind: "numbered";
  readonly color: Color;
  readonly value: Value;
};

export type JokerTile = {
  readonly tileId: string;
  readonly kind: "joker";
};

/**
 * A physical tile. Every tile has a unique immutable tileId, even when
 * another tile shares the same visible color/value (there are always two
 * physical copies of each color/value combination).
 */
export type Tile = NumberedTile | JokerTile;

/** What a joker represents at its position within a validated set. */
export type JokerAssignment = {
  readonly tileId: string;
  readonly represents: { readonly color: Color; readonly value: Value };
};

export type SetInvalidReason =
  | "too_few_tiles"
  | "too_many_tiles"
  | "duplicate_tile_id"
  | "run_color_mismatch"
  | "run_duplicate_value"
  | "run_inconsistent_positions"
  | "run_out_of_range"
  | "run_no_anchor"
  | "group_value_mismatch"
  | "group_duplicate_color"
  | "group_no_anchor"
  | "invalid_set";

export type InvalidSetResult = {
  readonly valid: false;
  readonly reason: SetInvalidReason;
};

export type ValidRunResult = {
  readonly valid: true;
  readonly kind: "run";
  readonly color: Color;
  readonly tileIds: readonly string[];
  readonly jokerAssignments: readonly JokerAssignment[];
};

export type ValidGroupResult = {
  readonly valid: true;
  readonly kind: "group";
  readonly value: Value;
  readonly tileIds: readonly string[];
  readonly jokerAssignments: readonly JokerAssignment[];
};

export type RunValidationResult = ValidRunResult | InvalidSetResult;
export type GroupValidationResult = ValidGroupResult | InvalidSetResult;
export type SetValidationResult = ValidRunResult | ValidGroupResult | InvalidSetResult;

/** Returns an integer in [0, maxExclusive). Injected by the caller so the
 * pure engine never touches Math.random() or a specific RNG implementation
 * itself -- see docs/opus-implementation-plan.md D-SHUFFLE. */
export type RandomInt = (maxExclusive: number) => number;

export type ConservedResult = { readonly conserved: true };
export type UnconservedResult = {
  readonly conserved: false;
  readonly duplicated: readonly string[];
  readonly missing: readonly string[];
  readonly unexpected: readonly string[];
};
export type ConservationResult = ConservedResult | UnconservedResult;
