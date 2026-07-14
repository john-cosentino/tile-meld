import type { ConservationResult, Tile } from "./types.js";

/**
 * Checks that the tileIds across a set of locations (pool, racks, table,
 * ...) exactly match the catalog's tileIds -- no duplicates, nothing
 * missing, nothing unexpected. This is the reusable form of the game's
 * central invariant: tiles may never be created, lost, or duplicated. See
 * docs/opus-implementation-plan.md §5.3 invariant 1.
 */
export function checkConservation(
  catalog: readonly Tile[],
  locations: readonly (readonly Tile[])[],
): ConservationResult {
  const catalogIds = catalog.map((tile) => tile.tileId);
  const catalogIdSet = new Set(catalogIds);

  const seen = new Set<string>();
  const duplicated = new Set<string>();
  const unexpected = new Set<string>();

  for (const location of locations) {
    for (const tile of location) {
      if (seen.has(tile.tileId)) {
        duplicated.add(tile.tileId);
      }
      seen.add(tile.tileId);
      if (!catalogIdSet.has(tile.tileId)) {
        unexpected.add(tile.tileId);
      }
    }
  }

  const missing = catalogIds.filter((tileId) => !seen.has(tileId));

  if (duplicated.size === 0 && unexpected.size === 0 && missing.length === 0) {
    return { conserved: true };
  }

  return {
    conserved: false,
    duplicated: [...duplicated],
    missing,
    unexpected: [...unexpected],
  };
}
