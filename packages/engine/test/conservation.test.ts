import { describe, expect, it } from "vitest";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { checkConservation } from "../src/conservation.js";
import { createTileCatalog } from "../src/tiles.js";
import { shuffle } from "../src/shuffle.js";
import type { Tile } from "../src/types.js";

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

/** Splits a shuffled catalog into N non-empty, non-overlapping groups that
 * together cover every tile exactly once. */
function partitionInto(tiles: readonly Tile[], groupCount: number): Tile[][] {
  const groups: Tile[][] = Array.from({ length: groupCount }, () => []);
  tiles.forEach((tile, i) => {
    groups[i % groupCount]!.push(tile);
  });
  return groups;
}

describe("checkConservation", () => {
  it("reports conserved when the catalog is fully and exactly covered", () => {
    const catalog = createTileCatalog();
    const [pool, rackA, rackB, table] = partitionInto(catalog, 4);
    expect(checkConservation(catalog, [pool!, rackA!, rackB!, table!])).toEqual({
      conserved: true,
    });
  });

  it("reports conserved for a single location holding the entire catalog", () => {
    const catalog = createTileCatalog();
    expect(checkConservation(catalog, [catalog])).toEqual({ conserved: true });
  });

  it("flags a duplicated tile across two locations", () => {
    const catalog = createTileCatalog();
    const [pool, rack] = partitionInto(catalog, 2);
    const corruptedRack = [...rack!, pool![0]!];
    const result = checkConservation(catalog, [pool!, corruptedRack]);
    expect(result.conserved).toBe(false);
    if (!result.conserved) {
      expect(result.duplicated).toEqual([pool![0]!.tileId]);
      expect(result.missing).toEqual([]);
    }
  });

  it("flags a missing tile", () => {
    const catalog = createTileCatalog();
    const [pool, rack] = partitionInto(catalog, 2);
    const droppedTileId = rack![0]!.tileId;
    const shrunkRack = rack!.slice(1);
    const result = checkConservation(catalog, [pool!, shrunkRack]);
    expect(result.conserved).toBe(false);
    if (!result.conserved) {
      expect(result.missing).toEqual([droppedTileId]);
      expect(result.duplicated).toEqual([]);
    }
  });

  it("flags an unexpected tile not from the catalog", () => {
    const catalog = createTileCatalog();
    const foreignTile: Tile = { kind: "numbered", color: "C1", value: 1, tileId: "not-in-catalog" };
    const result = checkConservation(catalog, [catalog, [foreignTile]]);
    expect(result.conserved).toBe(false);
    if (!result.conserved) {
      expect(result.unexpected).toEqual(["not-in-catalog"]);
    }
  });

  it("distinguishes duplicate physical tiles from duplicate visible values", () => {
    // Two different physical tiles that both look like "red 7" is fine
    // (they're distinct tileIds); the SAME tileId appearing twice is not.
    const catalog = createTileCatalog();
    const red7a = catalog.find((t) => t.tileId === "C1-7-a")!;
    const red7b = catalog.find((t) => t.tileId === "C1-7-b")!;
    const rest = catalog.filter((t) => t.tileId !== "C1-7-a" && t.tileId !== "C1-7-b");
    expect(checkConservation(catalog, [rest, [red7a, red7b]])).toEqual({ conserved: true });

    // But the same physical tile twice is a real conservation violation.
    const restWithoutOneCopy = catalog.filter((t) => t.tileId !== "C1-7-b");
    const result = checkConservation(catalog, [restWithoutOneCopy, [red7a]]);
    expect(result).toEqual({
      conserved: false,
      duplicated: ["C1-7-a"],
      missing: ["C1-7-b"],
      unexpected: [],
    });
  });

  test.prop([fc.integer({ min: 1, max: 10 }), fc.integer({ min: 0 })])(
    "conserves the full catalog across any random shuffle and partition",
    (groupCount, seed) => {
      const catalog = createTileCatalog();
      const shuffled = shuffle(catalog, seededRandomInt(seed));
      const groups = partitionInto(shuffled, groupCount);
      expect(checkConservation(catalog, groups)).toEqual({ conserved: true });
    },
  );
});
