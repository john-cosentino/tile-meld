import { describe, expect, it } from "vitest";
import { applyCommit } from "../src/turns.js";
import { checkConservation } from "../src/conservation.js";
import { createTileCatalog } from "../src/tiles.js";
import { buildGame, buildSeat, fillerTiles, joker, numbered } from "./fixtures.js";

describe("applyCommit -- normal play (post initial meld)", () => {
  it("extends an existing table run using a rack tile", () => {
    const table = [[numbered("C1", 5), numbered("C1", 6), numbered("C1", 7)]];
    const rack = [numbered("C1", 8)];
    const state = buildGame({
      table,
      seats: [buildSeat({ seatIndex: 0, rack, hasInitialMeld: true })],
    });
    const proposedTable = [
      [numbered("C1", 5), numbered("C1", 6), numbered("C1", 7), numbered("C1", 8)],
    ];
    const result = applyCommit(state, 0, proposedTable);
    expect(result.event).toEqual({ type: "committed", seatIndex: 0 });
    expect(result.state.table).toEqual(proposedTable);
    expect(result.state.seats[0]!.rack).toEqual([]);
  });

  it("splits a table run into two while adding a rack tile", () => {
    const table = [
      [
        numbered("C1", 1),
        numbered("C1", 2),
        numbered("C1", 3),
        numbered("C1", 4),
        numbered("C1", 5),
        numbered("C1", 6),
        numbered("C1", 7),
      ],
    ];
    const rack = [numbered("C1", 8)];
    const state = buildGame({
      table,
      seats: [buildSeat({ seatIndex: 0, rack, hasInitialMeld: true })],
    });
    const proposedTable = [
      [numbered("C1", 1), numbered("C1", 2), numbered("C1", 3)],
      [
        numbered("C1", 4),
        numbered("C1", 5),
        numbered("C1", 6),
        numbered("C1", 7),
        numbered("C1", 8),
      ],
    ];
    const result = applyCommit(state, 0, proposedTable);
    expect(result.event).toEqual({ type: "committed", seatIndex: 0 });
    expect(result.state.table).toEqual(proposedTable);
  });

  it("combines two table runs into one using a rack tile to bridge the gap", () => {
    const table = [
      [numbered("C1", 1), numbered("C1", 2), numbered("C1", 3)],
      [numbered("C1", 5), numbered("C1", 6), numbered("C1", 7)],
    ];
    const rack = [numbered("C1", 4)];
    const state = buildGame({
      table,
      seats: [buildSeat({ seatIndex: 0, rack, hasInitialMeld: true })],
    });
    const proposedTable = [
      [
        numbered("C1", 1),
        numbered("C1", 2),
        numbered("C1", 3),
        numbered("C1", 4),
        numbered("C1", 5),
        numbered("C1", 6),
        numbered("C1", 7),
      ],
    ];
    const result = applyCommit(state, 0, proposedTable);
    expect(result.event).toEqual({ type: "committed", seatIndex: 0 });
    expect(result.state.table).toEqual(proposedTable);
  });

  it("rejects a rearrangement that adds no rack tile at all", () => {
    const table = [
      [
        numbered("C1", 1),
        numbered("C1", 2),
        numbered("C1", 3),
        numbered("C1", 4),
        numbered("C1", 5),
        numbered("C1", 6),
      ],
    ];
    const state = buildGame({
      pool: fillerTiles(5),
      table,
      seats: [buildSeat({ seatIndex: 0, rack: [numbered("C3", 1)], hasInitialMeld: true })],
    });
    // Splits the run without touching the rack at all.
    const proposedTable = [
      [numbered("C1", 1), numbered("C1", 2), numbered("C1", 3)],
      [numbered("C1", 4), numbered("C1", 5), numbered("C1", 6)],
    ];
    const result = applyCommit(state, 0, proposedTable);
    expect(result.event).toMatchObject({
      type: "invalid_commit",
      reason: "commit_no_rack_tile_used",
    });
  });

  it("rejects a table tile silently disappearing (attempted table-to-rack move)", () => {
    // 4-tile table run reduced to a 3-tile run -- the proposed table is
    // still individually a *valid* set on its own, so this genuinely
    // isolates the "old tile vanished" check rather than tripping the
    // more basic "too few tiles" check first.
    const table = [[numbered("C1", 1), numbered("C1", 2), numbered("C1", 3), numbered("C1", 4)]];
    const state = buildGame({
      pool: fillerTiles(5),
      table,
      seats: [buildSeat({ seatIndex: 0, rack: [numbered("C3", 1)], hasInitialMeld: true })],
    });
    // C1-4 is nowhere in the proposed table -- an attempt to smuggle it
    // into the rack.
    const proposedTable = [[numbered("C1", 1), numbered("C1", 2), numbered("C1", 3)]];
    const result = applyCommit(state, 0, proposedTable);
    expect(result.event).toMatchObject({ type: "invalid_commit", reason: "table_tile_removed" });
  });

  it("rejects using a tile that belongs to another seat's rack", () => {
    const state = buildGame({
      pool: fillerTiles(5),
      seats: [
        buildSeat({
          seatIndex: 0,
          rack: [numbered("C1", 9), numbered("C1", 10)],
          hasInitialMeld: true,
        }),
        buildSeat({ seatIndex: 1, rack: [numbered("C1", 11)], hasInitialMeld: true }),
      ],
    });
    const proposedTable = [[numbered("C1", 9), numbered("C1", 10), numbered("C1", 11)]];
    const result = applyCommit(state, 0, proposedTable);
    expect(result.event).toMatchObject({
      type: "invalid_commit",
      reason: "commit_uses_untracked_tile",
    });
  });

  it("retrieves a table joker, replaces it, and plays it into a new set in the same turn", () => {
    // Table group C1-7/C2-7/joker(=C3-7, the canonically smallest missing
    // color). The active player has the real C3-7 to replace it, plus
    // C4-9/C4-10 to build a brand new run using the retrieved joker.
    const table = [[numbered("C1", 7), numbered("C2", 7), joker()]];
    const rack = [numbered("C3", 7), numbered("C4", 9), numbered("C4", 10)];
    const state = buildGame({
      table,
      seats: [buildSeat({ seatIndex: 0, rack, hasInitialMeld: true })],
    });
    const proposedTable = [
      [numbered("C1", 7), numbered("C2", 7), numbered("C3", 7)],
      [joker(), numbered("C4", 9), numbered("C4", 10)],
    ];
    const result = applyCommit(state, 0, proposedTable);
    expect(result.event).toEqual({ type: "committed", seatIndex: 0 });
    expect(result.state.table).toEqual(proposedTable);
    expect(result.state.seats[0]!.rack).toEqual([]);
  });

  it("rejects retrieving a joker without repairing the set it leaves behind (E-J4)", () => {
    const table = [[numbered("C1", 7), numbered("C2", 7), joker()]];
    const rack = [numbered("C4", 9), numbered("C4", 10)];
    const state = buildGame({
      pool: fillerTiles(5),
      table,
      seats: [buildSeat({ seatIndex: 0, rack, hasInitialMeld: true })],
    });
    // Joker moved out, but the remaining C1-7/C2-7 pair is left as an
    // invalid 2-tile "set" -- stranded, per E-J4. validateSet collapses
    // any individually-invalid set (regardless of the specific underlying
    // reason) to "invalid_set".
    const proposedTable = [
      [numbered("C1", 7), numbered("C2", 7)],
      [joker(), numbered("C4", 9), numbered("C4", 10)],
    ];
    const result = applyCommit(state, 0, proposedTable);
    expect(result.event).toMatchObject({ type: "invalid_commit", reason: "invalid_set" });
  });

  it("conserves every tile across an accepted commit (no creation, loss, or duplication)", () => {
    const catalog = createTileCatalog();
    const table = [[numbered("C1", 5), numbered("C1", 6), numbered("C1", 7)]];
    const rack0 = [numbered("C1", 8)];
    const rack1 = [numbered("C2", 1), numbered("C2", 2), numbered("C2", 3)];
    const usedTileIds = new Set([...table.flat(), ...rack0, ...rack1].map((tile) => tile.tileId));
    const pool = catalog.filter((tile) => !usedTileIds.has(tile.tileId));

    const state = buildGame({
      pool,
      table,
      seats: [
        buildSeat({ seatIndex: 0, rack: rack0, hasInitialMeld: true }),
        buildSeat({ seatIndex: 1, rack: rack1, hasInitialMeld: true }),
      ],
    });
    const proposedTable = [
      [numbered("C1", 5), numbered("C1", 6), numbered("C1", 7), numbered("C1", 8)],
    ];
    const result = applyCommit(state, 0, proposedTable);
    expect(result.event.type).toBe("committed");

    const locations = [
      result.state.table.flat(),
      ...result.state.seats.map((seat) => seat.rack),
      result.state.pool,
    ];
    expect(checkConservation(catalog, locations)).toEqual({ conserved: true });
  });
});

describe("applyCommit -- invalid-commit 3-tile penalty across pool sizes", () => {
  function belowThresholdTable() {
    return [[numbered("C1", 5), numbered("C1", 6), numbered("C1", 7)]]; // 18, below 30
  }

  it("draws exactly 3 tiles when the pool has 5 or more", () => {
    const rack = [numbered("C1", 5), numbered("C1", 6), numbered("C1", 7)];
    const state = buildGame({
      pool: fillerTiles(5),
      seats: [buildSeat({ seatIndex: 0, rack, hasInitialMeld: false })],
    });
    const result = applyCommit(state, 0, belowThresholdTable());
    expect(result.event).toMatchObject({ type: "invalid_commit", penaltyDrawn: 3 });
    expect(result.state.seats[0]!.rack).toHaveLength(rack.length + 3);
    expect(result.state.pool).toHaveLength(2);
  });

  it("draws exactly 2 tiles when only 2 remain in the pool", () => {
    const rack = [numbered("C1", 5), numbered("C1", 6), numbered("C1", 7)];
    const state = buildGame({
      pool: fillerTiles(2),
      seats: [buildSeat({ seatIndex: 0, rack, hasInitialMeld: false })],
    });
    const result = applyCommit(state, 0, belowThresholdTable());
    expect(result.event).toMatchObject({ type: "invalid_commit", penaltyDrawn: 2 });
    expect(result.state.pool).toHaveLength(0);
  });

  it("draws exactly 1 tile when only 1 remains in the pool", () => {
    const rack = [numbered("C1", 5), numbered("C1", 6), numbered("C1", 7)];
    const state = buildGame({
      pool: fillerTiles(1),
      seats: [buildSeat({ seatIndex: 0, rack, hasInitialMeld: false })],
    });
    const result = applyCommit(state, 0, belowThresholdTable());
    expect(result.event).toMatchObject({ type: "invalid_commit", penaltyDrawn: 1 });
    expect(result.state.pool).toHaveLength(0);
  });

  it("draws 0 tiles when the pool is empty, but still forfeits and advances the turn", () => {
    const rack = [numbered("C1", 5), numbered("C1", 6), numbered("C1", 7)];
    const state = buildGame({
      pool: [],
      seats: [
        buildSeat({ seatIndex: 0, rack, hasInitialMeld: false }),
        buildSeat({ seatIndex: 1, rack: [numbered("C4", 1)], hasInitialMeld: false }),
      ],
    });
    const result = applyCommit(state, 0, belowThresholdTable());
    expect(result.event).toMatchObject({ type: "invalid_commit", penaltyDrawn: 0 });
    expect(result.state.seats[0]!.rack).toHaveLength(rack.length);
    expect(result.state.activeSeat).toBe(1);
  });

  it("leaves the table completely unchanged on rejection", () => {
    const table = [[numbered("C4", 1), numbered("C4", 2), numbered("C4", 3)]];
    const state = buildGame({
      pool: fillerTiles(5, 5),
      table,
      seats: [
        buildSeat({
          seatIndex: 0,
          rack: [numbered("C1", 5), numbered("C1", 6), numbered("C1", 7)],
          hasInitialMeld: false,
        }),
        buildSeat({ seatIndex: 1, rack: [], hasInitialMeld: true }),
      ],
    });
    const result = applyCommit(state, 0, belowThresholdTable());
    expect(result.state.table).toBe(state.table);
  });
});
