import { describe, expect, it } from "vitest";
import type { Color, Tile } from "@tile-meld/engine";
import {
  DEFAULT_MAX_NODES,
  compareCandidates,
  countJokers,
  generateBotTurn,
  generateCandidates,
  search,
} from "../src/index.js";
import { assertLegalCommit, input, jok, num } from "./helpers.js";

// Deterministic search-cost measurements (docs plan §12/§Performance). These
// assert on NODE COUNTS and candidate counts -- reproducible integers -- never
// on wall-clock time, so they can never flake on a slow machine.

/** A deliberately demanding rack: a full colour ladder plus a partial second
 * colour and both jokers -- far richer than a real 14-tile opening rack, to
 * probe the worst case for candidate generation and packing. */
function stressRack(): Tile[] {
  const tiles: Tile[] = [];
  for (let v = 1; v <= 13; v++) tiles.push(num("C1", v, "a"));
  for (let v = 1; v <= 6; v++) tiles.push(num("C2", v, "a"));
  tiles.push(jok("a"), jok("b"));
  return tiles;
}

function measure(rack: Tile[], hasInitialMeld: boolean, maxNodes: number) {
  const inp = input({ rack, hasInitialMeld });
  const candidates = generateCandidates(inp).sort(compareCandidates);
  const result = search(
    { hasInitialMeld, rackSize: rack.length },
    candidates,
    countJokers(rack),
    maxNodes,
  );
  return { candidateCount: candidates.length, ...result };
}

describe("search cost", () => {
  it("keeps candidate counts modest even for a rich rack", () => {
    const a = generateCandidates(input({ rack: stressRack(), hasInitialMeld: true }));
    const b = generateCandidates(input({ rack: stressRack(), hasInitialMeld: true }));
    // Deterministic and bounded -- the candidate pool never explodes.
    expect(a.length).toBe(b.length);
    expect(a.length).toBeLessThan(500);
  });

  it("node count is deterministic for a fixed rack and budget", () => {
    const first = measure(stressRack(), true, DEFAULT_MAX_NODES);
    const second = measure(stressRack(), true, DEFAULT_MAX_NODES);
    expect(first.nodesVisited).toBe(second.nodesVisited);
  });

  it("never exceeds the node budget and still returns a legal, winning-quality move", () => {
    const rack = stressRack();
    const inp = input({ rack, hasInitialMeld: true });
    const measured = measure(rack, true, DEFAULT_MAX_NODES);
    expect(measured.nodesVisited).toBeLessThanOrEqual(DEFAULT_MAX_NODES + 1);

    const decision = generateBotTurn(inp);
    expect(decision.kind).toBe("commit");
    if (decision.kind === "commit") {
      assertLegalCommit(inp, decision);
      // This rack can be fully melded, so a competent search empties the rack.
      expect(decision.wins).toBe(true);
    }
  });

  it("a tightened budget still yields a legal move (graceful degradation)", () => {
    const rack = stressRack();
    const inp = input({ rack, hasInitialMeld: true });
    const decision = generateBotTurn(inp, { maxNodes: 50 });
    expect(decision.kind).toBe("commit");
    if (decision.kind === "commit") assertLegalCommit(inp, decision);
  });

  it("scales across colours without unbounded growth", () => {
    const rack: Tile[] = [];
    const colors: Color[] = ["C1", "C2", "C3", "C4"];
    for (const c of colors) for (let v = 1; v <= 6; v++) rack.push(num(c, v, "a"));
    const measured = measure(rack, true, DEFAULT_MAX_NODES);
    expect(measured.candidateCount).toBeLessThan(500);
    expect(measured.nodesVisited).toBeLessThanOrEqual(DEFAULT_MAX_NODES + 1);
    const decision = generateBotTurn(input({ rack, hasInitialMeld: true }));
    if (decision.kind === "commit")
      assertLegalCommit(input({ rack, hasInitialMeld: true }), decision);
  });
});
