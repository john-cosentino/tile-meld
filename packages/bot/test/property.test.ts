import { describe, expect } from "vitest";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { COLORS, createTileCatalog, type Tile } from "@tile-meld/engine";
import {
  compareCandidates,
  countJokers,
  generateBotTurn,
  generateCandidates,
  search,
} from "../src/index.js";
import { assertLegalCommit, input, num } from "./helpers.js";

// Phase B property/invariant tests (docs plan §12). All inputs are drawn from
// the real 106-tile catalog, so jokers and duplicate copies occur naturally.

const catalog = createTileCatalog();
const PROP_MAX_NODES = 20_000; // budget only affects optimality, never legality

const rackArb = fc.subarray(catalog, { minLength: 1, maxLength: 16 });

const inputArb = fc
  .record({
    rack: rackArb,
    hasInitialMeld: fc.boolean(),
    poolNonEmpty: fc.boolean(),
  })
  .map((r) => input(r));

/** A valid run built from copy-'a' tiles, plus the rack with any overlapping
 * tiles removed so the table and rack are disjoint. */
const tableAndRackArb = fc
  .record({
    color: fc.constantFrom(...COLORS),
    base: fc.integer({ min: 1, max: 9 }),
    len: fc.integer({ min: 3, max: 5 }),
    rack: rackArb,
  })
  .map(({ color, base, len, rack }) => {
    const clampedLen = Math.min(len, 13 - base + 1);
    const set: Tile[] = [];
    for (let v = base; v < base + clampedLen; v++) set.push(num(color, v, "a"));
    const tableIds = new Set(set.map((t) => t.tileId));
    const disjointRack = rack.filter((t) => !tableIds.has(t.tileId));
    return input({
      rack: disjointRack.length > 0 ? disjointRack : [num("C4", 13, "b")],
      table: [set],
      hasInitialMeld: true,
    });
  });

describe("move-generator invariants", () => {
  test.prop([inputArb])("every commit is legal and conserves tiles", (inp) => {
    const decision = generateBotTurn(inp, { maxNodes: PROP_MAX_NODES });
    if (decision.kind === "commit") assertLegalCommit(inp, decision);
    else expect(decision.kind === "draw" || decision.kind === "pass").toBe(true);
  });

  test.prop([tableAndRackArb])("commits against a populated table stay legal", (inp) => {
    const decision = generateBotTurn(inp, { maxNodes: PROP_MAX_NODES });
    if (decision.kind === "commit") assertLegalCommit(inp, decision);
    else expect(decision.kind === "draw" || decision.kind === "pass").toBe(true);
  });

  test.prop([inputArb])("draw/pass fallback matches pool emptiness", (inp) => {
    const decision = generateBotTurn(inp, { maxNodes: PROP_MAX_NODES });
    if (decision.kind === "draw") expect(inp.poolNonEmpty).toBe(true);
    if (decision.kind === "pass") expect(inp.poolNonEmpty).toBe(false);
  });

  test.prop([inputArb])("is deterministic: identical input yields identical output", (inp) => {
    const a = generateBotTurn(inp, { maxNodes: PROP_MAX_NODES });
    const b = generateBotTurn(inp, { maxNodes: PROP_MAX_NODES });
    expect(a).toEqual(b);
  });

  test.prop([inputArb])("candidate generation is deterministic and canonically ordered", (inp) => {
    const first = generateCandidates(inp).sort(compareCandidates);
    const second = generateCandidates(inp).sort(compareCandidates);
    expect(first.map((c) => c.resourceKey)).toEqual(second.map((c) => c.resourceKey));
  });

  test.prop([inputArb])("search terminates within the node budget", (inp) => {
    const candidates = generateCandidates(inp).sort(compareCandidates);
    const result = search(
      { hasInitialMeld: inp.hasInitialMeld, rackSize: inp.rack.length },
      candidates,
      countJokers(inp.rack),
      5_000,
    );
    expect(result.nodesVisited).toBeLessThanOrEqual(5_001);
  });

  test.prop([inputArb])(
    "plays only tiles from its own rack (never a tile it was not given)",
    (inp) => {
      const decision = generateBotTurn(inp, { maxNodes: PROP_MAX_NODES });
      if (decision.kind !== "commit") return;
      const rackIds = new Set(inp.rack.map((t) => t.tileId));
      const tableIds = new Set(inp.table.flat().map((t) => t.tileId));
      for (const id of decision.arrangement.flat()) {
        expect(rackIds.has(id) || tableIds.has(id)).toBe(true);
      }
    },
  );
});
