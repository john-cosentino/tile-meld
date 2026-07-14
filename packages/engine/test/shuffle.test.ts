import { describe, expect, it } from "vitest";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { shuffle } from "../src/shuffle.js";
import { createTileCatalog } from "../src/tiles.js";

/** Deterministic, seedable RandomInt for reproducible tests -- never uses
 * Math.random() or crypto; a plain mulberry32-style PRNG confined to the
 * test file. */
function seededRandomInt(seed: number): (maxExclusive: number) => number {
  let state = seed >>> 0;
  return (maxExclusive: number) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const fraction = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(fraction * maxExclusive);
  };
}

describe("shuffle", () => {
  it("does not mutate the input array", () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffle(input, seededRandomInt(1));
    expect(input).toEqual(copy);
  });

  it("returns a permutation of the input (same elements, same length)", () => {
    const catalog = createTileCatalog();
    const shuffled = shuffle(catalog, seededRandomInt(42));
    expect(shuffled).toHaveLength(catalog.length);
    expect(new Set(shuffled.map((tile) => tile.tileId))).toEqual(
      new Set(catalog.map((tile) => tile.tileId)),
    );
  });

  it("actually reorders elements for a nontrivial input (not a no-op)", () => {
    const input = Array.from({ length: 106 }, (_, i) => i);
    const shuffled = shuffle(input, seededRandomInt(7));
    expect(shuffled).not.toEqual(input);
  });

  it("is deterministic for a given randomInt sequence", () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const a = shuffle(input, seededRandomInt(123));
    const b = shuffle(input, seededRandomInt(123));
    expect(a).toEqual(b);
  });

  test.prop([fc.array(fc.integer(), { maxLength: 200 }), fc.integer({ min: 0 })])(
    "is always a permutation of its input for any array and seed",
    (items, seed) => {
      const result = shuffle(items, seededRandomInt(seed));
      expect(result).toHaveLength(items.length);
      expect(result.slice().sort()).toEqual(items.slice().sort());
    },
  );
});
