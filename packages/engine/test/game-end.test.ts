import { describe, expect, it } from "vitest";
import { detectGameEnd } from "../src/scoring.js";
import { buildGame, buildSeat, numbered } from "./fixtures.js";

describe("detectGameEnd", () => {
  it("reports not ended for an ordinary in-progress game", () => {
    const state = buildGame({
      pool: [numbered("C1", 1)],
      seats: [
        buildSeat({ seatIndex: 0, rack: [numbered("C1", 2)] }),
        buildSeat({ seatIndex: 1, rack: [numbered("C1", 3)] }),
      ],
    });
    expect(detectGameEnd(state)).toEqual({ ended: false });
  });

  it("detects a normal win when an active seat's rack is empty", () => {
    const state = buildGame({
      seats: [
        buildSeat({ seatIndex: 0, rack: [] }),
        buildSeat({ seatIndex: 1, rack: [numbered("C1", 1)] }),
      ],
    });
    expect(detectGameEnd(state)).toEqual({
      ended: true,
      reason: "empty_rack",
      winnerSeatIndex: 0,
    });
  });

  it("detects a last-active-standing win when only one active seat remains", () => {
    const state = buildGame({
      seats: [
        buildSeat({ seatIndex: 0, rack: [numbered("C1", 1)], status: "resigned" }),
        buildSeat({ seatIndex: 1, rack: [numbered("C1", 2)] }),
      ],
    });
    expect(detectGameEnd(state)).toEqual({
      ended: true,
      reason: "last_active_standing",
      winnerSeatIndex: 1,
    });
  });

  it("does not trigger pool-exhaustion stalemate before a full rotation of non-advancing turns", () => {
    const state = buildGame({
      pool: [],
      consecutivePasses: 2, // 3 active seats -- needs to reach 3
      seats: [
        buildSeat({ seatIndex: 0, rack: [numbered("C1", 5)] }),
        buildSeat({ seatIndex: 1, rack: [numbered("C1", 6)] }),
        buildSeat({ seatIndex: 2, rack: [numbered("C1", 7)] }),
      ],
    });
    expect(detectGameEnd(state)).toEqual({ ended: false });
  });

  it("triggers pool-exhaustion stalemate once consecutivePasses reaches the active seat count", () => {
    const state = buildGame({
      pool: [],
      consecutivePasses: 3,
      activeSeat: 0,
      seats: [
        buildSeat({ seatIndex: 0, rack: [numbered("C1", 5)] }), // lowest, 5
        buildSeat({ seatIndex: 1, rack: [numbered("C1", 6)] }),
        buildSeat({ seatIndex: 2, rack: [numbered("C1", 7)] }),
      ],
    });
    expect(detectGameEnd(state)).toEqual({
      ended: true,
      reason: "pool_exhausted",
      winnerSeatIndex: 0,
    });
  });

  describe("E-TIE pool-exhaustion tiebreak", () => {
    it("picks the lowest face value outright when there is no tie", () => {
      const state = buildGame({
        pool: [],
        consecutivePasses: 2,
        activeSeat: 1,
        seats: [
          buildSeat({ seatIndex: 0, rack: [numbered("C1", 10)] }),
          buildSeat({ seatIndex: 1, rack: [numbered("C1", 4)] }),
        ],
      });
      const result = detectGameEnd(state);
      expect(result).toMatchObject({ ended: true, winnerSeatIndex: 1 });
    });

    it("breaks a face-value tie by fewest tiles", () => {
      // Both seats total 10: seat0 has 2 tiles (4+6), seat1 has 1 tile (10).
      const state = buildGame({
        pool: [],
        consecutivePasses: 2,
        activeSeat: 0,
        seats: [
          buildSeat({ seatIndex: 0, rack: [numbered("C1", 4), numbered("C1", 6)] }),
          buildSeat({ seatIndex: 1, rack: [numbered("C2", 10)] }),
        ],
      });
      const result = detectGameEnd(state);
      expect(result).toMatchObject({ ended: true, winnerSeatIndex: 1 });
    });

    it("breaks a face-value and tile-count tie by nearest upcoming turn order", () => {
      // seat0 and seat1 are tied at faceValue=10/tileCount=1; seat2 has a
      // clearly higher rack so it isn't a tiebreak candidate itself.
      // activeSeat is 2, so rotation order (starting at 2) is [2, 0, 1] --
      // seat0 (distance 1) is closer than seat1 (distance 2).
      const state = buildGame({
        pool: [],
        consecutivePasses: 3,
        activeSeat: 2,
        seats: [
          buildSeat({ seatIndex: 0, rack: [numbered("C1", 10)] }),
          buildSeat({ seatIndex: 1, rack: [numbered("C2", 10)] }),
          buildSeat({ seatIndex: 2, rack: [numbered("C3", 13)] }),
        ],
      });
      const result = detectGameEnd(state);
      expect(result).toMatchObject({ ended: true, winnerSeatIndex: 0 });
    });

    it("never selects a resigned seat as the pool-exhaustion winner", () => {
      // 3 seats total, 2 still active (seat0 resigned) -- keeps this on the
      // pool_exhausted path rather than tripping the separate
      // last-active-standing check, which would pass for the wrong reason.
      const state = buildGame({
        pool: [],
        consecutivePasses: 2,
        activeSeat: 1,
        seats: [
          // Resigned seat has the lowest rack, but is not eligible to win.
          buildSeat({ seatIndex: 0, rack: [numbered("C1", 1)], status: "resigned" }),
          buildSeat({ seatIndex: 1, rack: [numbered("C1", 9)] }),
          buildSeat({ seatIndex: 2, rack: [numbered("C1", 13)] }),
        ],
      });
      const result = detectGameEnd(state);
      expect(result).toMatchObject({
        ended: true,
        reason: "pool_exhausted",
        winnerSeatIndex: 1,
      });
    });
  });
});
