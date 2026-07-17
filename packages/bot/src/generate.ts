import { validateTurn } from "@tile-meld/engine";
import type { GameState, Tile } from "@tile-meld/engine";
import type { BotConfig, BotDecision, BotTurnInput } from "./types.js";
import { JOKER_SLOT, countJokers, generateCandidates, type Candidate } from "./candidates.js";
import { DEFAULT_MAX_NODES, compareCandidates, search } from "./search.js";

// Top-level pure entry point. Builds the supported candidate turns, packs the
// best one deterministically, emits it preserving existing table order, and
// CONFIRMS it against the authoritative validateTurn before returning. If no
// supported legal turn exists, draws (pool non-empty) or passes (pool empty).

/** A single-seat synthetic state is enough for validateTurn: it only reads the
 * acting seat's rack/hasInitialMeld and the table. Building it here guarantees
 * the human's rack is never even present in what the bot validates against. */
function syntheticState(input: BotTurnInput): GameState {
  return {
    pool: [],
    seats: [
      { seatIndex: 0, rack: input.rack, status: "active", hasInitialMeld: input.hasInitialMeld },
    ],
    table: input.table,
    activeSeat: 0,
    consecutivePasses: 0,
    status: "active",
  };
}

function tileLookup(input: BotTurnInput): ReadonlyMap<string, Tile> {
  const byId = new Map<string, Tile>();
  for (const tile of input.rack) byId.set(tile.tileId, tile);
  for (const set of input.table) for (const tile of set) byId.set(tile.tileId, tile);
  return byId;
}

/**
 * Builds the concrete tileId arrangement from the chosen combination while
 * preserving established table order (docs plan §6 emission rule): every
 * existing set stays at its position -- extended in place if chosen -- and
 * brand-new melds are appended in deterministic (resource-key) order. Rack
 * jokers are bound to JOKER slots canonically (sorted joker ids, left to
 * right over the appended new sets).
 */
function emitArrangement(
  input: BotTurnInput,
  combo: readonly Candidate[],
  jokerIds: readonly string[],
): string[][] {
  const extensionByIndex = new Map<number, Candidate>();
  const newSets: Candidate[] = [];
  for (const candidate of combo) {
    if (candidate.kind === "extend") extensionByIndex.set(candidate.targetIndex!, candidate);
    else newSets.push(candidate);
  }
  newSets.sort((a, b) =>
    a.resourceKey < b.resourceKey ? -1 : a.resourceKey > b.resourceKey ? 1 : 0,
  );

  let jokerCursor = 0;
  const assign = (layout: readonly string[]): string[] =>
    layout.map((slot) => {
      if (slot !== JOKER_SLOT) return slot;
      const id = jokerIds[jokerCursor++];
      if (!id) throw new Error("emitArrangement: ran out of rack jokers");
      return id;
    });

  const arrangement: string[][] = [];
  for (let ti = 0; ti < input.table.length; ti++) {
    const extension = extensionByIndex.get(ti);
    if (extension) arrangement.push(assign(extension.layout));
    else arrangement.push(input.table[ti]!.map((tile) => tile.tileId)); // unchanged, original order
  }
  for (const newSet of newSets) arrangement.push(assign(newSet.layout));
  return arrangement;
}

export function generateBotTurn(input: BotTurnInput, config: BotConfig = {}): BotDecision {
  const maxNodes = config.maxNodes ?? DEFAULT_MAX_NODES;
  const jokerCount = countJokers(input.rack);
  const candidates = [...generateCandidates(input)].sort(compareCandidates);

  const { combo } = search(
    { hasInitialMeld: input.hasInitialMeld, rackSize: input.rack.length },
    candidates,
    jokerCount,
    maxNodes,
  );

  if (combo && combo.length > 0) {
    const idx = tileLookup(input);
    const jokerIds = input.rack
      .filter((t) => t.kind === "joker")
      .map((t) => t.tileId)
      .sort();
    const arrangement = emitArrangement(input, combo, jokerIds);

    const proposed = arrangement.map((ids) =>
      ids.map((id) => {
        const tile = idx.get(id);
        if (!tile) throw new Error(`generateBotTurn: emitted unknown tile ${id}`);
        return tile;
      }),
    );

    // Authoritative gate: the returned commit MUST pass validateTurn against
    // the same canonical state. If it somehow does not, discard it and fall
    // back rather than ever proposing an illegal arrangement.
    const validation = validateTurn(syntheticState(input), 0, proposed);
    if (validation.valid) {
      const tilesPlayed = combo.reduce((sum, c) => sum + c.tilesPlayed, 0);
      const faceValuePlayed = combo.reduce((sum, c) => sum + c.faceValuePlayed, 0);
      return {
        kind: "commit",
        arrangement,
        tilesPlayed,
        faceValuePlayed,
        wins: tilesPlayed === input.rack.length,
      };
    }
  }

  return input.poolNonEmpty ? { kind: "draw" } : { kind: "pass" };
}
