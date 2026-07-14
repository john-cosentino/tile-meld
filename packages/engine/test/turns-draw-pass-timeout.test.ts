import { describe, expect, it } from "vitest";
import { applyDraw, applyPass, applyTimeout } from "../src/turns.js";
import { buildGame, buildSeat, fillerTiles, numbered } from "./fixtures.js";

describe("applyDraw", () => {
  it("draws exactly one tile from the end of the pool and ends the turn", () => {
    const pool = fillerTiles(5);
    const lastTile = pool[pool.length - 1]!;
    const state = buildGame({
      pool,
      seats: [buildSeat({ seatIndex: 0, rack: [] }), buildSeat({ seatIndex: 1, rack: [] })],
    });
    const result = applyDraw(state, 0);
    expect(result.event).toEqual({ type: "drawn", seatIndex: 0 });
    expect(result.state.seats[0]!.rack).toEqual([lastTile]);
    expect(result.state.pool).toHaveLength(4);
    expect(result.state.activeSeat).toBe(1);
    expect(result.state.consecutivePasses).toBe(0);
  });

  it("resets consecutivePasses to 0", () => {
    const state = buildGame({
      pool: fillerTiles(3),
      consecutivePasses: 2,
      seats: [buildSeat({ seatIndex: 0, rack: [] }), buildSeat({ seatIndex: 1, rack: [] })],
    });
    const result = applyDraw(state, 0);
    expect(result.state.consecutivePasses).toBe(0);
  });

  it("throws if called with an empty pool (caller should use applyPass instead)", () => {
    const state = buildGame({
      pool: [],
      seats: [buildSeat({ seatIndex: 0, rack: [] }), buildSeat({ seatIndex: 1, rack: [] })],
    });
    expect(() => applyDraw(state, 0)).toThrow();
  });
});

describe("applyPass", () => {
  it("ends the turn without drawing and increments consecutivePasses", () => {
    const state = buildGame({
      pool: [],
      consecutivePasses: 1,
      seats: [buildSeat({ seatIndex: 0, rack: [] }), buildSeat({ seatIndex: 1, rack: [] })],
    });
    const result = applyPass(state, 0);
    expect(result.event).toEqual({ type: "passed", seatIndex: 0 });
    expect(result.state.consecutivePasses).toBe(2);
    expect(result.state.activeSeat).toBe(1);
    expect(result.state.seats[0]!.rack).toEqual([]);
  });
});

describe("applyTimeout -- penalty across pool sizes", () => {
  it("draws exactly 3 tiles when 5+ remain in the pool", () => {
    const state = buildGame({
      pool: fillerTiles(5),
      consecutivePasses: 0,
      seats: [buildSeat({ seatIndex: 0, rack: [] }), buildSeat({ seatIndex: 1, rack: [] })],
    });
    const result = applyTimeout(state, 0);
    expect(result.event).toEqual({ type: "timed_out", seatIndex: 0, penaltyDrawn: 3 });
    expect(result.state.seats[0]!.rack).toHaveLength(3);
    expect(result.state.pool).toHaveLength(2);
    expect(result.state.consecutivePasses).toBe(1);
  });

  it("draws exactly 2 tiles when only 2 remain", () => {
    const state = buildGame({
      pool: fillerTiles(2),
      seats: [buildSeat({ seatIndex: 0, rack: [] }), buildSeat({ seatIndex: 1, rack: [] })],
    });
    const result = applyTimeout(state, 0);
    expect(result.event).toMatchObject({ penaltyDrawn: 2 });
    expect(result.state.pool).toHaveLength(0);
  });

  it("draws exactly 1 tile when only 1 remains", () => {
    const state = buildGame({
      pool: fillerTiles(1),
      seats: [buildSeat({ seatIndex: 0, rack: [] }), buildSeat({ seatIndex: 1, rack: [] })],
    });
    const result = applyTimeout(state, 0);
    expect(result.event).toMatchObject({ penaltyDrawn: 1 });
    expect(result.state.pool).toHaveLength(0);
  });

  it("draws 0 tiles when the pool is empty, but still forfeits and advances the turn", () => {
    const state = buildGame({
      pool: [],
      seats: [buildSeat({ seatIndex: 0, rack: [] }), buildSeat({ seatIndex: 1, rack: [] })],
    });
    const result = applyTimeout(state, 0);
    expect(result.event).toEqual({ type: "timed_out", seatIndex: 0, penaltyDrawn: 0 });
    expect(result.state.seats[0]!.rack).toEqual([]);
    expect(result.state.activeSeat).toBe(1);
  });

  it("increments consecutivePasses like a Pass", () => {
    const state = buildGame({
      pool: [],
      consecutivePasses: 1,
      seats: [buildSeat({ seatIndex: 0, rack: [] }), buildSeat({ seatIndex: 1, rack: [] })],
    });
    const result = applyTimeout(state, 0);
    expect(result.state.consecutivePasses).toBe(2);
  });

  it("leaves other seats' racks and the table completely untouched", () => {
    const otherRack = [numbered("C1", 1)];
    const table = [[numbered("C2", 1), numbered("C2", 2), numbered("C2", 3)]];
    const state = buildGame({
      pool: fillerTiles(5),
      table,
      seats: [buildSeat({ seatIndex: 0, rack: [] }), buildSeat({ seatIndex: 1, rack: otherRack })],
    });
    const result = applyTimeout(state, 0);
    expect(result.state.seats[1]!.rack).toEqual(otherRack);
    expect(result.state.table).toBe(state.table);
  });
});
