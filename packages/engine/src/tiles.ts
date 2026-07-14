import { COLORS, MAX_VALUE, MIN_VALUE, type Tile } from "./types.js";

const COPIES = ["a", "b"] as const;

/**
 * Builds the fixed 106-tile catalog: 4 colors x 13 values x 2 copies = 104
 * numbered tiles, plus 2 jokers. Deterministic -- same output every call.
 * See docs/opus-implementation-plan.md §3.1.
 */
export function createTileCatalog(): Tile[] {
  const tiles: Tile[] = [];
  for (const color of COLORS) {
    for (let value = MIN_VALUE; value <= MAX_VALUE; value++) {
      for (const copy of COPIES) {
        tiles.push({ kind: "numbered", color, value, tileId: `${color}-${value}-${copy}` });
      }
    }
  }
  for (const copy of COPIES) {
    tiles.push({ kind: "joker", tileId: `J-${copy}` });
  }
  return tiles;
}

export function hasDuplicateTileIds(tiles: readonly Tile[]): boolean {
  const seen = new Set<string>();
  for (const tile of tiles) {
    if (seen.has(tile.tileId)) return true;
    seen.add(tile.tileId);
  }
  return false;
}
