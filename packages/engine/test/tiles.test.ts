import { describe, expect, it } from "vitest";
import { COLORS, MAX_VALUE, MIN_VALUE } from "../src/types.js";
import { createTileCatalog, hasDuplicateTileIds } from "../src/tiles.js";

describe("createTileCatalog", () => {
  it("produces exactly 106 tiles", () => {
    expect(createTileCatalog()).toHaveLength(106);
  });

  it("produces 104 numbered tiles and 2 jokers", () => {
    const catalog = createTileCatalog();
    expect(catalog.filter((tile) => tile.kind === "numbered")).toHaveLength(104);
    expect(catalog.filter((tile) => tile.kind === "joker")).toHaveLength(2);
  });

  it("produces exactly two copies of each color/value combination", () => {
    const catalog = createTileCatalog();
    for (const color of COLORS) {
      for (let value = MIN_VALUE; value <= MAX_VALUE; value++) {
        const matches = catalog.filter(
          (tile) => tile.kind === "numbered" && tile.color === color && tile.value === value,
        );
        expect(matches).toHaveLength(2);
      }
    }
  });

  it("gives every tile a unique tileId, even across same color/value copies", () => {
    const catalog = createTileCatalog();
    expect(hasDuplicateTileIds(catalog)).toBe(false);
    expect(new Set(catalog.map((tile) => tile.tileId)).size).toBe(106);
  });

  it("distinguishes duplicate physical tiles from duplicate visible values", () => {
    // Two tiles can share (color, value) -- that's expected -- but they
    // must always have different tileIds (different physical tiles).
    const catalog = createTileCatalog();
    const red7s = catalog.filter(
      (tile) => tile.kind === "numbered" && tile.color === "C1" && tile.value === 7,
    );
    expect(red7s).toHaveLength(2);
    expect(red7s[0]!.tileId).not.toBe(red7s[1]!.tileId);
  });

  it("is deterministic across calls", () => {
    const a = createTileCatalog();
    const b = createTileCatalog();
    expect(a).toEqual(b);
  });
});

describe("hasDuplicateTileIds", () => {
  it("returns false for a set of distinct tiles", () => {
    expect(
      hasDuplicateTileIds([
        { kind: "numbered", color: "C1", value: 1, tileId: "C1-1-a" },
        { kind: "numbered", color: "C1", value: 2, tileId: "C1-2-a" },
      ]),
    ).toBe(false);
  });

  it("returns true when the same tileId appears twice", () => {
    expect(
      hasDuplicateTileIds([
        { kind: "numbered", color: "C1", value: 1, tileId: "C1-1-a" },
        { kind: "numbered", color: "C1", value: 1, tileId: "C1-1-a" },
      ]),
    ).toBe(true);
  });
});
