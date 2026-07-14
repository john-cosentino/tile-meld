import { describe, expect, it } from "vitest";
import { applyCommit } from "../src/turns.js";
import { buildGame, buildSeat, fillerTiles, joker, numbered } from "./fixtures.js";

describe("applyCommit -- initial meld gate", () => {
  it("rejects an initial meld totaling exactly 29 (just below the 30 threshold)", () => {
    const rack = [
      numbered("C1", 4),
      numbered("C1", 5),
      numbered("C1", 6),
      numbered("C2", 2),
      numbered("C2", 3),
      numbered("C2", 4),
      numbered("C2", 5),
    ];
    const state = buildGame({
      pool: fillerTiles(5),
      seats: [buildSeat({ seatIndex: 0, rack, hasInitialMeld: false })],
    });
    const proposedTable = [
      [numbered("C1", 4), numbered("C1", 5), numbered("C1", 6)], // 15
      [numbered("C2", 2), numbered("C2", 3), numbered("C2", 4), numbered("C2", 5)], // 14 -> 29 total
    ];
    const result = applyCommit(state, 0, proposedTable);
    expect(result.event).toMatchObject({ type: "invalid_commit", reason: "initial_meld_below_30" });
    expect(result.state.table).toEqual([]);
    expect(result.state.seats[0]!.hasInitialMeld).toBe(false);
  });

  it("accepts an initial meld totaling exactly 30", () => {
    const rack = [numbered("C1", 9), numbered("C1", 10), numbered("C1", 11)];
    const state = buildGame({
      seats: [buildSeat({ seatIndex: 0, rack, hasInitialMeld: false })],
    });
    const proposedTable = [[numbered("C1", 9), numbered("C1", 10), numbered("C1", 11)]];
    const result = applyCommit(state, 0, proposedTable);
    expect(result.event).toEqual({ type: "committed", seatIndex: 0 });
    expect(result.state.seats[0]!.hasInitialMeld).toBe(true);
    expect(result.state.seats[0]!.rack).toEqual([]);
  });

  it("accepts an initial meld totaling 31 (above threshold), combining two new sets", () => {
    const rack = [
      numbered("C1", 4, "a"),
      numbered("C1", 5, "a"),
      numbered("C1", 6, "a"),
      numbered("C1", 4, "b"),
      numbered("C2", 4, "a"),
      numbered("C3", 4, "a"),
      numbered("C4", 4, "a"),
    ];
    const state = buildGame({
      seats: [buildSeat({ seatIndex: 0, rack, hasInitialMeld: false })],
    });
    const proposedTable = [
      [numbered("C1", 4, "a"), numbered("C1", 5, "a"), numbered("C1", 6, "a")], // run, 15
      [
        numbered("C1", 4, "b"),
        numbered("C2", 4, "a"),
        numbered("C3", 4, "a"),
        numbered("C4", 4, "a"),
      ], // group of value 4, 16 -> 31 total
    ];
    const result = applyCommit(state, 0, proposedTable);
    expect(result.event).toEqual({ type: "committed", seatIndex: 0 });
    expect(result.state.seats[0]!.hasInitialMeld).toBe(true);
  });

  it("counts a joker's represented value toward the 30 threshold", () => {
    const rack = [numbered("C1", 11), numbered("C1", 12), joker()];
    const state = buildGame({
      seats: [buildSeat({ seatIndex: 0, rack, hasInitialMeld: false })],
    });
    // Joker fills position 2, representing C1-13: 11 + 12 + 13 = 36.
    const proposedTable = [[numbered("C1", 11), numbered("C1", 12), joker()]];
    const result = applyCommit(state, 0, proposedTable);
    expect(result.event).toEqual({ type: "committed", seatIndex: 0 });
    expect(result.state.seats[0]!.hasInitialMeld).toBe(true);
  });

  it("uses only rack tiles for the initial meld -- rejects a tile not actually in the rack", () => {
    const rack = [numbered("C1", 9), numbered("C1", 10)]; // missing C1-11
    const state = buildGame({
      pool: fillerTiles(5),
      seats: [buildSeat({ seatIndex: 0, rack, hasInitialMeld: false })],
    });
    const proposedTable = [[numbered("C1", 9), numbered("C1", 10), numbered("C1", 11)]];
    const result = applyCommit(state, 0, proposedTable);
    expect(result.event).toMatchObject({
      type: "invalid_commit",
      reason: "commit_uses_untracked_tile",
    });
  });

  it("rejects manipulating an existing table set before completing the initial meld", () => {
    const existingSet = [numbered("C2", 1), numbered("C2", 2), numbered("C2", 3)];
    const rack = [numbered("C2", 4), numbered("C1", 9), numbered("C1", 10), numbered("C1", 11)];
    const state = buildGame({
      pool: fillerTiles(5),
      table: [existingSet],
      seats: [
        buildSeat({ seatIndex: 0, rack, hasInitialMeld: false }),
        buildSeat({ seatIndex: 1, rack: [], hasInitialMeld: true }),
      ],
    });
    // Extends the existing run with a rack tile -- not allowed pre-meld,
    // even though the resulting arrangement would otherwise be legal.
    const proposedTable = [
      [numbered("C2", 1), numbered("C2", 2), numbered("C2", 3), numbered("C2", 4)],
      [numbered("C1", 9), numbered("C1", 10), numbered("C1", 11)],
    ];
    const result = applyCommit(state, 0, proposedTable);
    expect(result.event).toMatchObject({
      type: "invalid_commit",
      reason: "initial_meld_table_modified",
    });
    expect(result.state.table).toEqual([existingSet]);
  });

  it("accepts an initial meld that leaves a pre-existing table set untouched", () => {
    const existingSet = [numbered("C2", 1), numbered("C2", 2), numbered("C2", 3)];
    const rack = [numbered("C1", 9), numbered("C1", 10), numbered("C1", 11)];
    const state = buildGame({
      table: [existingSet],
      seats: [
        buildSeat({ seatIndex: 0, rack, hasInitialMeld: false }),
        buildSeat({ seatIndex: 1, rack: [], hasInitialMeld: true }),
      ],
    });
    const proposedTable = [
      existingSet,
      [numbered("C1", 9), numbered("C1", 10), numbered("C1", 11)],
    ];
    const result = applyCommit(state, 0, proposedTable);
    expect(result.event).toEqual({ type: "committed", seatIndex: 0 });
    expect(result.state.seats[0]!.hasInitialMeld).toBe(true);
    expect(result.state.table).toEqual(proposedTable);
  });
});
