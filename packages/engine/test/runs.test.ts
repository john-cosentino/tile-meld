import { describe, expect, it } from "vitest";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { validateRun } from "../src/sets.js";
import { COLORS, MAX_VALUE, MIN_VALUE } from "../src/types.js";
import { joker, numbered } from "./fixtures.js";

describe("validateRun -- valid runs", () => {
  it("accepts the minimum length (3) run", () => {
    const result = validateRun([numbered("C1", 5), numbered("C1", 6), numbered("C1", 7)]);
    expect(result).toMatchObject({ valid: true, kind: "run", color: "C1" });
  });

  it("accepts a full 13-tile run covering the whole suit", () => {
    const tiles = Array.from({ length: 13 }, (_, i) => numbered("C2", i + 1));
    const result = validateRun(tiles);
    expect(result).toMatchObject({ valid: true, kind: "run", color: "C2" });
  });

  it("accepts a run with a joker filling a middle gap", () => {
    const result = validateRun([numbered("C1", 5), joker(), numbered("C1", 7)]);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.jokerAssignments).toEqual([
        { tileId: "J-a", represents: { color: "C1", value: 6 } },
      ]);
    }
  });

  it("accepts a run with a joker extending the low end", () => {
    const result = validateRun([joker(), numbered("C1", 6), numbered("C1", 7)]);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.jokerAssignments).toEqual([
        { tileId: "J-a", represents: { color: "C1", value: 5 } },
      ]);
    }
  });

  it("accepts a run with a joker extending the high end", () => {
    const result = validateRun([numbered("C1", 5), numbered("C1", 6), joker()]);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.jokerAssignments).toEqual([
        { tileId: "J-a", represents: { color: "C1", value: 7 } },
      ]);
    }
  });

  it("accepts a run using both jokers at once", () => {
    const result = validateRun([numbered("C3", 10), joker("a"), joker("b")]);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.jokerAssignments).toEqual([
        { tileId: "J-a", represents: { color: "C3", value: 11 } },
        { tileId: "J-b", represents: { color: "C3", value: 12 } },
      ]);
    }
  });
});

describe("validateRun -- invalid runs", () => {
  it("rejects fewer than 3 tiles", () => {
    expect(validateRun([numbered("C1", 5), numbered("C1", 6)])).toEqual({
      valid: false,
      reason: "too_few_tiles",
    });
  });

  it("rejects more than 13 tiles", () => {
    const tiles = Array.from({ length: 14 }, (_, i) =>
      numbered("C1", (i % 13) + 1, i < 13 ? "a" : "b"),
    );
    expect(validateRun(tiles).valid).toBe(false);
    expect(validateRun(tiles)).toMatchObject({ reason: "too_many_tiles" });
  });

  it("rejects mixed colors", () => {
    expect(validateRun([numbered("C1", 5), numbered("C2", 6), numbered("C1", 7)])).toEqual({
      valid: false,
      reason: "run_color_mismatch",
    });
  });

  it("rejects a duplicate value among real tiles", () => {
    expect(validateRun([numbered("C1", 5), numbered("C1", 5, "b"), numbered("C1", 7)])).toEqual({
      valid: false,
      reason: "run_duplicate_value",
    });
  });

  it("rejects the same physical tile appearing twice", () => {
    const tile = numbered("C1", 5);
    expect(validateRun([tile, tile, numbered("C1", 7)])).toEqual({
      valid: false,
      reason: "duplicate_tile_id",
    });
  });

  it("never allows 13 to wrap to 1 -- rejects 12,13,+1-out-of-range", () => {
    // 12, 13, then a joker would need to represent 14, which doesn't exist.
    expect(validateRun([numbered("C1", 12), numbered("C1", 13), joker()])).toEqual({
      valid: false,
      reason: "run_out_of_range",
    });
  });

  it("never allows wraparound the other direction -- rejects a joker needing value 0", () => {
    expect(validateRun([joker(), numbered("C1", 1), numbered("C1", 2)])).toEqual({
      valid: false,
      reason: "run_out_of_range",
    });
  });

  it("rejects 13 directly followed by 1 (no wraparound) even with matching color", () => {
    // Positions imply consecutive ascending values; 13 then 1 is not
    // consecutive under any base, so this fails on inconsistent positions
    // rather than reaching the range check -- either way it must be invalid.
    const result = validateRun([numbered("C1", 13), numbered("C1", 1, "b"), numbered("C1", 2)]);
    expect(result.valid).toBe(false);
  });

  it("rejects inconsistent positions (real tiles imply different bases)", () => {
    // position 0 -> value 5 implies base 5; position 2 -> value 9 implies
    // base 7. Inconsistent.
    expect(validateRun([numbered("C1", 5), joker(), numbered("C1", 9)])).toEqual({
      valid: false,
      reason: "run_inconsistent_positions",
    });
  });

  it("is defensively correct for an all-joker input (unreachable from the real catalog)", () => {
    expect(validateRun([joker("a"), joker("b"), joker("a")]).valid).toBe(false);
  });
});

describe("validateRun -- property tests", () => {
  test.prop([
    fc.constantFrom(...COLORS),
    fc.integer({ min: MIN_VALUE, max: MAX_VALUE }),
    fc.integer({ min: 3, max: 13 }),
  ])(
    "accepts any real (non-joker) consecutive run that fits within [1,13]",
    (color, base, length) => {
      fc.pre(base + length - 1 <= MAX_VALUE);
      const tiles = Array.from({ length }, (_, i) => numbered(color, base + i));
      const result = validateRun(tiles);
      expect(result).toMatchObject({ valid: true, kind: "run", color });
    },
  );

  it("rejects a valid run with one tile's color flipped", () => {
    const otherColor = COLORS.find((color) => color !== "C1")!;
    const result = validateRun([numbered("C1", 5), numbered(otherColor, 6), numbered("C1", 7)]);
    expect(result).toEqual({ valid: false, reason: "run_color_mismatch" });
  });
});
