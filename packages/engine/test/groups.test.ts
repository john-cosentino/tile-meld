import { describe, expect, it } from "vitest";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { validateGroup } from "../src/sets.js";
import { MAX_VALUE, MIN_VALUE } from "../src/types.js";
import { joker, numbered } from "./fixtures.js";

describe("validateGroup -- valid groups", () => {
  it("accepts a 3-tile group of distinct colors", () => {
    const result = validateGroup([numbered("C1", 7), numbered("C2", 7), numbered("C3", 7)]);
    expect(result).toMatchObject({ valid: true, kind: "group", value: 7 });
  });

  it("accepts a 4-tile group (all colors)", () => {
    const result = validateGroup([
      numbered("C1", 9),
      numbered("C2", 9),
      numbered("C3", 9),
      numbered("C4", 9),
    ]);
    expect(result).toMatchObject({ valid: true, kind: "group", value: 9 });
  });

  it("validity does not depend on input order (tileIds preserve the order given)", () => {
    const a = validateGroup([numbered("C3", 4), numbered("C1", 4), numbered("C2", 4)]);
    const b = validateGroup([numbered("C1", 4), numbered("C2", 4), numbered("C3", 4)]);
    expect(a).toMatchObject({ valid: true, kind: "group", value: 4, jokerAssignments: [] });
    expect(b).toMatchObject({ valid: true, kind: "group", value: 4, jokerAssignments: [] });
    // Output tileIds preserve the order given, by design -- so the two
    // results are permutations of each other, not identical arrays.
    expect(a.valid && [...a.tileIds].sort()).toEqual(b.valid && [...b.tileIds].sort());
  });

  it("forces the joker's color in a 4-tile group with exactly one missing color", () => {
    // Real tiles use C1, C2, C4 -- only C3 remains, so the joker is forced.
    const result = validateGroup([
      numbered("C1", 3),
      numbered("C2", 3),
      numbered("C4", 3),
      joker(),
    ]);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.jokerAssignments).toEqual([
        { tileId: "J-a", represents: { color: "C3", value: 3 } },
      ]);
    }
  });

  it("deterministically picks the smallest missing color for a 3-tile group with one joker (E-J3)", () => {
    // Real tiles use C3, C4 -- C1 and C2 both remain; the joker
    // deterministically represents the smallest, C1.
    const result = validateGroup([numbered("C3", 8), numbered("C4", 8), joker()]);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.jokerAssignments).toEqual([
        { tileId: "J-a", represents: { color: "C1", value: 8 } },
      ]);
    }
  });

  it("deterministically picks the two smallest missing colors for a 3-tile group with two jokers", () => {
    // One real tile uses C4 -- C1, C2, C3 remain; the two jokers
    // deterministically take the two smallest, C1 and C2.
    const result = validateGroup([numbered("C4", 11), joker("a"), joker("b")]);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.jokerAssignments).toEqual([
        { tileId: "J-a", represents: { color: "C1", value: 11 } },
        { tileId: "J-b", represents: { color: "C2", value: 11 } },
      ]);
    }
  });

  it("is deterministic across repeated calls (stable joker canonicalization)", () => {
    const build = () => validateGroup([numbered("C3", 8), numbered("C4", 8), joker()]);
    expect(build()).toEqual(build());
  });
});

describe("validateGroup -- invalid groups", () => {
  it("rejects fewer than 3 tiles", () => {
    expect(validateGroup([numbered("C1", 7), numbered("C2", 7)])).toEqual({
      valid: false,
      reason: "too_few_tiles",
    });
  });

  it("rejects more than 4 tiles", () => {
    // 5 "tiles" of the same value -- impossible from the real catalog (only
    // 4 colors), but validateGroup must still handle it and reject on
    // length before ever reasoning about colors.
    const tiles = [
      numbered("C1", 7),
      numbered("C2", 7),
      numbered("C3", 7),
      numbered("C4", 7),
      { kind: "joker" as const, tileId: "J-a" },
    ];
    expect(validateGroup(tiles)).toEqual({ valid: false, reason: "too_many_tiles" });
  });

  it("rejects mismatched values among real tiles", () => {
    expect(validateGroup([numbered("C1", 7), numbered("C2", 8), numbered("C3", 7)])).toEqual({
      valid: false,
      reason: "group_value_mismatch",
    });
  });

  it("rejects a repeated color among real tiles", () => {
    expect(validateGroup([numbered("C1", 7), numbered("C1", 7, "b"), numbered("C2", 7)])).toEqual({
      valid: false,
      reason: "group_duplicate_color",
    });
  });

  it("rejects the same physical tile appearing twice", () => {
    const tile = numbered("C1", 7);
    expect(validateGroup([tile, tile, numbered("C2", 7)])).toEqual({
      valid: false,
      reason: "duplicate_tile_id",
    });
  });

  it("rejects a 5-tile group (more than any color count could support) on length alone", () => {
    // There are only 4 colors, so a group can never legitimately need more
    // than 4 tiles; this is caught by the length check, not a "not enough
    // colors for the jokers" check -- there is no reachable state where a
    // group has too few colors for its jokers once the length is <= 4.
    const tiles = [numbered("C1", 5), numbered("C2", 5), numbered("C3", 5), joker("a"), joker("b")];
    expect(validateGroup(tiles)).toEqual({ valid: false, reason: "too_many_tiles" });
  });

  it("is defensively correct for an all-joker input (unreachable from the real catalog)", () => {
    expect(validateGroup([joker("a"), joker("b"), joker("a")]).valid).toBe(false);
  });
});

describe("validateGroup -- property tests", () => {
  test.prop([
    fc.integer({ min: MIN_VALUE, max: MAX_VALUE }),
    fc.subarray(["C1", "C2", "C3", "C4"] as const, { minLength: 3, maxLength: 4 }),
  ])(
    "accepts any real (non-joker) group of 3-4 distinct colors sharing a value",
    (value, colors) => {
      const tiles = colors.map((color) => numbered(color, value));
      const result = validateGroup(tiles);
      expect(result).toMatchObject({ valid: true, kind: "group", value });
    },
  );
});
