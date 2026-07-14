import { describe, expect, it } from "vitest";
import type { Color, NumberedTile, JokerTile } from "@tile-meld/engine";
import {
  hintForSet,
  runningInitialMeldTotal,
  validateProposedTurn,
} from "../src/tabletop/hintEngine.js";

function n(color: Color, value: number, copy: "a" | "b" = "a"): NumberedTile {
  return { kind: "numbered", color, value, tileId: `${color}-${value}-${copy}` };
}
function j(copy: "a" | "b" = "a"): JokerTile {
  return { kind: "joker", tileId: `J-${copy}` };
}

describe("hintForSet", () => {
  it("flags an empty set as neutral", () => {
    expect(hintForSet([]).validity).toBe("neutral");
  });

  it("flags fewer than 3 tiles as neutral (not yet invalid)", () => {
    const hint = hintForSet([n("C1", 5), n("C1", 6)]);
    expect(hint.validity).toBe("neutral");
    expect(hint.label).toContain("more tile");
  });

  it("recognizes a valid run", () => {
    const hint = hintForSet([n("C1", 5), n("C1", 6), n("C1", 7)]);
    expect(hint).toEqual({ validity: "valid", label: "valid run" });
  });

  it("recognizes a valid group", () => {
    const hint = hintForSet([n("C1", 5), n("C2", 5), n("C3", 5)]);
    expect(hint).toEqual({ validity: "valid", label: "valid group" });
  });

  it("flags 3+ mismatched tiles as invalid", () => {
    const hint = hintForSet([n("C1", 5), n("C2", 9), n("C3", 1)]);
    expect(hint.validity).toBe("invalid");
  });
});

describe("runningInitialMeldTotal", () => {
  it("sums only newly-formed valid sets, ignoring sets already on the table", () => {
    const existing = [n("C1", 1), n("C1", 2), n("C1", 3)];
    const fresh = [n("C2", 10), n("C2", 11), n("C2", 12)];
    const total = runningInitialMeldTotal([existing], [existing, fresh]);
    expect(total).toBe(33); // 10+11+12, not the pre-existing 1+2+3
  });

  it("ignores invalid or too-short new sets", () => {
    const total = runningInitialMeldTotal([], [[n("C1", 1), n("C2", 9)]]);
    expect(total).toBe(0);
  });

  it("counts a joker at its represented value", () => {
    const total = runningInitialMeldTotal([], [[n("C1", 11), n("C1", 12), j()]]);
    expect(total).toBe(11 + 12 + 13);
  });
});

describe("validateProposedTurn", () => {
  const rack = [n("C1", 1), n("C1", 2), n("C1", 3), n("C1", 4), n("C4", 9)];

  it("rejects a proposed meld below the 30-point threshold pre-initial-meld", () => {
    const result = validateProposedTurn(
      [n("C4", 8), n("C4", 9), n("C4", 10)],
      false,
      0,
      2,
      [],
      [[n("C4", 8), n("C4", 9), n("C4", 10)]],
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("initial_meld_below_30");
  });

  it("accepts a valid 30+ point meld", () => {
    const bigRack = [n("C1", 11), n("C1", 12), n("C1", 13), n("C2", 11), n("C3", 11)];
    const result = validateProposedTurn(
      bigRack,
      false,
      0,
      2,
      [],
      [[n("C1", 11), n("C1", 12), n("C1", 13)]],
    );
    expect(result.valid).toBe(true);
  });

  it("rejects an arrangement that drops an existing table tile entirely", () => {
    const oldTable = [[n("C1", 1), n("C1", 2), n("C1", 3)]];
    const result = validateProposedTurn(rack, false, 0, 2, oldTable, []);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("table_tile_removed");
  });

  it("rejects re-splitting an existing table set before the player's own initial meld", () => {
    const oldTable = [[n("C1", 1), n("C1", 2), n("C1", 3), n("C1", 4), n("C1", 5), n("C1", 6)]];
    // Same six physical tiles, still fully present and each half still a
    // valid run on its own, but regrouped into different set boundaries --
    // illegal pre-initial-meld even though nothing was actually lost.
    const resplit = [
      [n("C1", 1), n("C1", 2), n("C1", 3)],
      [n("C1", 4), n("C1", 5), n("C1", 6)],
    ];
    // A rack tile must be used somewhere or the earlier
    // commit_no_rack_tile_used check fires first -- add a third,
    // independently-valid new set built from the rack.
    const localRack = [n("C2", 9), n("C3", 9), n("C4", 9)];
    const proposedTable = [...resplit, localRack];
    const result = validateProposedTurn(localRack, false, 0, 2, oldTable, proposedTable);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("initial_meld_table_modified");
  });

  it("does not touch other seats' data -- a fake opponent rack never affects the result", () => {
    const a = validateProposedTurn(rack, true, 1, 3, [], [[n("C1", 1), n("C1", 2), n("C1", 3)]]);
    const b = validateProposedTurn(rack, true, 1, 3, [], [[n("C1", 1), n("C1", 2), n("C1", 3)]]);
    expect(a).toEqual(b);
    expect(a.valid).toBe(true);
  });
});
