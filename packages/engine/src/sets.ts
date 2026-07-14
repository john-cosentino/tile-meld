import { COLORS, MAX_VALUE, MIN_VALUE } from "./types.js";
import type {
  Color,
  GroupValidationResult,
  JokerAssignment,
  NumberedTile,
  RunValidationResult,
  SetInvalidReason,
  SetValidationResult,
  Tile,
} from "./types.js";
import { hasDuplicateTileIds } from "./tiles.js";

export const MIN_SET_LENGTH = 3;
export const MAX_RUN_LENGTH = MAX_VALUE;
export const MAX_GROUP_LENGTH = COLORS.length;

function invalid(reason: SetInvalidReason): { valid: false; reason: SetInvalidReason } {
  return { valid: false, reason };
}

function isNumbered(tile: Tile): tile is NumberedTile {
  return tile.kind === "numbered";
}

/**
 * Validates an ordered arrangement of tiles as a run: 3+ tiles, same color,
 * strictly consecutive ascending values, no wraparound. Order matters --
 * position i is expected to hold value (base + i), and a joker at position i
 * represents that value. See docs/opus-implementation-plan.md §3.1, E-J1-4.
 */
export function validateRun(tiles: readonly Tile[]): RunValidationResult {
  if (hasDuplicateTileIds(tiles)) return invalid("duplicate_tile_id");
  if (tiles.length < MIN_SET_LENGTH) return invalid("too_few_tiles");
  if (tiles.length > MAX_RUN_LENGTH) return invalid("too_many_tiles");

  const anchors = tiles
    .map((tile, position) => ({ tile, position }))
    .filter((entry): entry is { tile: NumberedTile; position: number } => isNumbered(entry.tile));

  // Unreachable with tiles drawn from the real 106-tile catalog (only 2
  // jokers exist, minimum run length is 3), but handled so this function is
  // correct for any input, not just catalog-sourced ones.
  if (anchors.length === 0) return invalid("run_no_anchor");

  const color = anchors[0]!.tile.color;
  if (!anchors.every((entry) => entry.tile.color === color)) {
    return invalid("run_color_mismatch");
  }

  const values = anchors.map((entry) => entry.tile.value);
  if (new Set(values).size !== values.length) {
    return invalid("run_duplicate_value");
  }

  const bases = new Set(anchors.map((entry) => entry.tile.value - entry.position));
  if (bases.size !== 1) return invalid("run_inconsistent_positions");
  const base = [...bases][0]!;

  if (base < MIN_VALUE || base + tiles.length - 1 > MAX_VALUE) {
    return invalid("run_out_of_range");
  }

  const jokerAssignments: JokerAssignment[] = tiles
    .map((tile, position) => ({ tile, position }))
    .filter((entry) => entry.tile.kind === "joker")
    .map((entry) => ({
      tileId: entry.tile.tileId,
      represents: { color, value: base + entry.position },
    }));

  return {
    valid: true,
    kind: "run",
    color,
    tileIds: tiles.map((tile) => tile.tileId),
    jokerAssignments,
  };
}

/**
 * Validates a collection of tiles as a group: 3-4 tiles, all the same
 * value, all distinct colors. Order-independent. When jokers must fill in
 * missing colors and more than one assignment would be valid, the smallest
 * available colors (in canonical C1..C4 order) are chosen deterministically
 * -- see docs/opus-implementation-plan.md E-J2/E-J3.
 */
export function validateGroup(tiles: readonly Tile[]): GroupValidationResult {
  if (hasDuplicateTileIds(tiles)) return invalid("duplicate_tile_id");
  if (tiles.length < MIN_SET_LENGTH) return invalid("too_few_tiles");
  if (tiles.length > MAX_GROUP_LENGTH) return invalid("too_many_tiles");

  const numbered = tiles.filter(isNumbered);
  const jokers = tiles.filter((tile) => tile.kind === "joker");

  // Unreachable with tiles drawn from the real 106-tile catalog (only 2
  // jokers exist, minimum group length is 3), handled defensively.
  if (numbered.length === 0) return invalid("group_no_anchor");

  const value = numbered[0]!.value;
  if (!numbered.every((tile) => tile.value === value)) {
    return invalid("group_value_mismatch");
  }

  const usedColors = new Set(numbered.map((tile) => tile.color));
  if (usedColors.size !== numbered.length) {
    return invalid("group_duplicate_color");
  }

  // availableColors.length is always >= jokers.length here: tiles.length is
  // already bounded by MAX_GROUP_LENGTH (= COLORS.length), usedColors.size
  // equals numbered.length (no duplicate colors, checked above), and
  // jokers.length = tiles.length - numbered.length, so there is always
  // exactly enough room. No "insufficient colors" case can be reached.
  const availableColors: Color[] = COLORS.filter((color) => !usedColors.has(color));
  const chosenColors = availableColors.slice(0, jokers.length);
  const jokerAssignments: JokerAssignment[] = jokers.map((joker, index) => ({
    tileId: joker.tileId,
    represents: { color: chosenColors[index]!, value },
  }));

  return {
    valid: true,
    kind: "group",
    value,
    tileIds: tiles.map((tile) => tile.tileId),
    jokerAssignments,
  };
}

/**
 * Tries both interpretations of a tile arrangement. A run's validity
 * depends on the order the caller supplied; a group's does not. In the rare
 * case where an arrangement (typically one real tile plus both jokers) is
 * validly interpretable as either, the group interpretation is returned --
 * chosen because group validity doesn't depend on the (possibly incidental)
 * order of the input array, unlike run validity. This is a deliberate,
 * documented tie-break (see docs/opus-implementation-plan.md E-J2).
 */
export function validateSet(tiles: readonly Tile[]): SetValidationResult {
  const groupResult = validateGroup(tiles);
  if (groupResult.valid) return groupResult;

  const runResult = validateRun(tiles);
  if (runResult.valid) return runResult;

  return invalid("invalid_set");
}
