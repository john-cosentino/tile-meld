import {
  validateSet,
  validateTurn,
  setFaceValue,
  type Tile,
  type GameState,
  type Seat,
  type TurnValidationResult,
} from "@tile-meld/engine";

// Client-side hints only -- never authoritative (CLAUDE.md: "the client's
// copy of the engine is hints only, never a source of truth"). Every
// function here calls straight into packages/engine rather than
// re-implementing any rule, so a hint can never disagree with what the
// server will actually decide on Commit.

export type SetHint = {
  readonly validity: "valid" | "invalid" | "neutral";
  readonly label: string;
};

/** Per-set validity, for highlighting one table-set container. */
export function hintForSet(tiles: readonly Tile[]): SetHint {
  if (tiles.length === 0) return { validity: "neutral", label: "empty" };
  const result = validateSet(tiles);
  if (result.valid) {
    return { validity: "valid", label: result.kind === "run" ? "valid run" : "valid group" };
  }
  if (tiles.length < 3) {
    return { validity: "neutral", label: `needs ${3 - tiles.length} more tile(s)` };
  }
  return { validity: "invalid", label: "not a valid run or group" };
}

function setKey(tiles: readonly Tile[]): string {
  return tiles
    .map((t) => t.tileId)
    .slice()
    .sort()
    .join(",");
}

/** The running initial-meld total: sum of face values of newly-formed
 * valid sets this turn (sets that didn't already exist on the table),
 * mirroring the engine's own totalFaceValue computation in validateTurn --
 * see packages/engine/src/turns.ts. Only meaningful pre-initial-meld. */
export function runningInitialMeldTotal(
  oldTable: readonly (readonly Tile[])[],
  proposedTable: readonly (readonly Tile[])[],
): number {
  const oldKeys = new Set(oldTable.map(setKey));
  let total = 0;
  for (const tiles of proposedTable) {
    if (oldKeys.has(setKey(tiles))) continue;
    const result = validateSet(tiles);
    if (result.valid) total += setFaceValue(tiles, result.jokerAssignments);
  }
  return total;
}

/**
 * Runs the real, authoritative-shaped `validateTurn` against a
 * minimal GameState built from only what the client actually knows: its
 * own rack/hasInitialMeld and the public table. `validateTurn` never reads
 * any other seat's data, so the placeholder entries for opponent seats are
 * never touched -- this is not a re-implementation, it's the same function
 * the server calls, given a state that happens to be missing hidden data
 * the function never needed in the first place.
 */
export function validateProposedTurn(
  myRack: readonly Tile[],
  hasInitialMeld: boolean,
  mySeatIndex: number,
  seatCount: number,
  oldTable: readonly (readonly Tile[])[],
  proposedTable: readonly (readonly Tile[])[],
): TurnValidationResult {
  const seats: Seat[] = Array.from({ length: seatCount }, (_, i) =>
    i === mySeatIndex
      ? { seatIndex: mySeatIndex, rack: myRack, status: "active", hasInitialMeld }
      : { seatIndex: i, rack: [], status: "active", hasInitialMeld: true },
  );
  const state: GameState = {
    pool: [],
    seats,
    table: oldTable,
    activeSeat: mySeatIndex,
    consecutivePasses: 0,
    status: "active",
  };
  return validateTurn(state, mySeatIndex, proposedTable);
}
