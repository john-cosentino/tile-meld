import { expect } from "vitest";
import {
  validateTurn,
  type Color,
  type GameState,
  type JokerTile,
  type NumberedTile,
  type TableSet,
  type Tile,
} from "@tile-meld/engine";
import type { BotDecision, BotTurnInput } from "../src/index.js";

/** Builds a numbered tile with the engine's canonical tileId format. */
export function num(color: Color, value: number, copy: "a" | "b" = "a"): NumberedTile {
  return { tileId: `${color}-${value}-${copy}`, kind: "numbered", color, value };
}

/** Builds a joker tile. */
export function jok(copy: "a" | "b" = "a"): JokerTile {
  return { tileId: `J-${copy}`, kind: "joker" };
}

export function input(over: Partial<BotTurnInput> & { rack: readonly Tile[] }): BotTurnInput {
  return {
    table: [],
    hasInitialMeld: false,
    poolNonEmpty: true,
    ...over,
  };
}

function syntheticState(inp: BotTurnInput): GameState {
  return {
    pool: [],
    seats: [{ seatIndex: 0, rack: inp.rack, status: "active", hasInitialMeld: inp.hasInitialMeld }],
    table: inp.table,
    activeSeat: 0,
    consecutivePasses: 0,
    status: "active",
  };
}

function lookup(inp: BotTurnInput): Map<string, Tile> {
  const byId = new Map<string, Tile>();
  for (const t of inp.rack) byId.set(t.tileId, t);
  for (const set of inp.table) for (const t of set) byId.set(t.tileId, t);
  return byId;
}

/**
 * Resolves a commit arrangement of tileIds back to Tiles, asserting each id is
 * known (rack or table) -- proving the bot never emits a tile outside what it
 * was given (it certainly cannot emit a human's rack tile, which is not even
 * representable in BotTurnInput).
 */
export function resolveArrangement(
  inp: BotTurnInput,
  arrangement: readonly (readonly string[])[],
): TableSet[] {
  const byId = lookup(inp);
  return arrangement.map((ids) =>
    ids.map((id) => {
      const tile = byId.get(id);
      if (!tile) throw new Error(`arrangement references unknown tile ${id}`);
      return tile;
    }),
  );
}

/** Asserts a commit is legal against the authoritative engine and conserves
 * tiles, and returns the set of played (rack) tileIds. */
export function assertLegalCommit(
  inp: BotTurnInput,
  decision: Extract<BotDecision, { kind: "commit" }>,
): { playedRackIds: Set<string> } {
  const proposed = resolveArrangement(inp, decision.arrangement);
  const validation = validateTurn(syntheticState(inp), 0, proposed);
  expect(
    validation.valid,
    `validateTurn rejected the bot's commit: ${JSON.stringify(validation)}`,
  ).toBe(true);

  // No duplicate tileIds across the arrangement.
  const allIds = proposed.flat().map((t) => t.tileId);
  expect(new Set(allIds).size).toBe(allIds.length);

  // Every old table tile is still present exactly where conservation requires.
  const oldIds = new Set(inp.table.flat().map((t) => t.tileId));
  const newIds = new Set(allIds);
  for (const id of oldIds) expect(newIds.has(id)).toBe(true);

  // Added tiles (not previously on the table) all come from the rack.
  const rackIds = new Set(inp.rack.map((t) => t.tileId));
  const playedRackIds = new Set<string>();
  for (const id of allIds) {
    if (!oldIds.has(id)) {
      expect(rackIds.has(id), `bot played a tile not in its rack: ${id}`).toBe(true);
      playedRackIds.add(id);
    }
  }
  expect(playedRackIds.size).toBeGreaterThan(0);
  expect(decision.tilesPlayed).toBe(playedRackIds.size);
  return { playedRackIds };
}
