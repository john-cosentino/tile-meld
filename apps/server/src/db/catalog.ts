import { createTileCatalog, type Tile } from "@tile-meld/engine";

// The 106-tile catalog, seeded once. Persistence stores tileId arrays
// (compact, DB-friendly); this resolves them back to full Tile objects the
// engine operates on. Deliberately looks the tile up in the canonical
// catalog rather than parsing the tileId string's structure, so nothing
// here depends on the engine's internal tileId encoding.
const catalog = createTileCatalog();
const byId = new Map(catalog.map((tile) => [tile.tileId, tile]));

export function resolveTiles(tileIds: readonly string[]): Tile[] {
  return tileIds.map((tileId) => {
    const tile = byId.get(tileId);
    if (!tile) throw new Error(`resolveTiles: unknown tileId: ${tileId}`);
    return tile;
  });
}

export function tileIdsOf(tiles: readonly Tile[]): string[] {
  return tiles.map((tile) => tile.tileId);
}

export { catalog };
