// The local draft: a player's in-progress rearrangement of the table +
// their own rack, entirely client-side until Commit (§10.2 "Local draft
// only ... refresh/disconnect discards the draft, the server never saw
// it"). Positions matter here, not just membership: a run's validity
// depends on tile order (packages/engine/src/sets.ts), so moving a tile
// into a set appends it, and precise ordering is a separate, explicit
// reorder step -- see tabletop/useDraftState.ts.

export type DraftSet = { readonly id: string; readonly tileIds: readonly string[] };
export type DraftState = { readonly sets: readonly DraftSet[]; readonly rack: readonly string[] };

export type Destination =
  | { readonly zone: "rack" }
  | { readonly zone: "set"; readonly setId: string }
  | { readonly zone: "new-set" };

export function buildInitialDraft(
  rack: readonly string[],
  table: readonly (readonly string[])[],
): DraftState {
  return {
    rack: [...rack],
    sets: table.map((tileIds) => ({ id: crypto.randomUUID(), tileIds: [...tileIds] })),
  };
}

function removeTileFromEverywhere(state: DraftState, tileId: string): DraftState {
  const rack = state.rack.filter((id) => id !== tileId);
  const sets = state.sets
    .map((s) => ({ ...s, tileIds: s.tileIds.filter((id) => id !== tileId) }))
    .filter((s) => s.tileIds.length > 0);
  return { rack, sets };
}

/** Moves a tile to `destination`, appending it at the end. Removing it from
 * wherever it was first (rack or another set) and dropping any set that's
 * left empty. */
export function moveTile(state: DraftState, tileId: string, destination: Destination): DraftState {
  const cleared = removeTileFromEverywhere(state, tileId);
  if (destination.zone === "rack") {
    return { ...cleared, rack: [...cleared.rack, tileId] };
  }
  if (destination.zone === "new-set") {
    return { ...cleared, sets: [...cleared.sets, { id: crypto.randomUUID(), tileIds: [tileId] }] };
  }
  // Dropping a tile back onto the very set it was the sole occupant of:
  // removeTileFromEverywhere already emptied and dropped that set, so
  // `destination.setId` no longer exists in `cleared.sets`. Recreate it
  // with just this tile rather than silently losing the tile.
  if (!cleared.sets.some((s) => s.id === destination.setId)) {
    return { ...cleared, sets: [...cleared.sets, { id: destination.setId, tileIds: [tileId] }] };
  }
  return {
    ...cleared,
    sets: cleared.sets.map((s) =>
      s.id === destination.setId ? { ...s, tileIds: [...s.tileIds, tileId] } : s,
    ),
  };
}

/** Swaps a tile with its left/right neighbor within one set -- the
 * explicit, keyboard-and-click-accessible way to fix run ordering, rather
 * than relying on drag-and-drop precision (§10.3 keyboard operability). */
export function reorderInSet(
  state: DraftState,
  setId: string,
  tileId: string,
  direction: "left" | "right",
): DraftState {
  return {
    ...state,
    sets: state.sets.map((s) => {
      if (s.id !== setId) return s;
      const idx = s.tileIds.indexOf(tileId);
      if (idx === -1) return s;
      const swapWith = direction === "left" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= s.tileIds.length) return s;
      const tiles = [...s.tileIds];
      [tiles[idx], tiles[swapWith]] = [tiles[swapWith]!, tiles[idx]!];
      return { ...s, tileIds: tiles };
    }),
  };
}

export function reorderRack(state: DraftState, newOrder: readonly string[]): DraftState {
  return { ...state, rack: newOrder };
}
