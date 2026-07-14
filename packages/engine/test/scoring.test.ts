import { describe, expect, it } from "vitest";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { score } from "../src/scoring.js";
import { buildSeat, joker, numbered } from "./fixtures.js";

describe("score -- normal win (empty_rack / last_active_standing)", () => {
  it("scores each non-winner as -(their own rack); winner gets the sum", () => {
    const seats = [
      buildSeat({ seatIndex: 0, rack: [] }), // winner
      buildSeat({ seatIndex: 1, rack: [numbered("C1", 5), numbered("C1", 6)] }), // 11
      buildSeat({ seatIndex: 2, rack: [numbered("C2", 9)] }), // 9
    ];
    const result = score(seats, 0, "empty_rack");
    expect(result).toEqual(
      expect.arrayContaining([
        { seatIndex: 1, points: -11 },
        { seatIndex: 2, points: -9 },
        { seatIndex: 0, points: 20 },
      ]),
    );
  });

  it("values a joker left on a rack at 30 points, not its potential represented value", () => {
    const seats = [
      buildSeat({ seatIndex: 0, rack: [] }),
      buildSeat({ seatIndex: 1, rack: [joker()] }),
    ];
    const result = score(seats, 0, "empty_rack");
    expect(result).toEqual(
      expect.arrayContaining([
        { seatIndex: 1, points: -30 },
        { seatIndex: 0, points: 30 },
      ]),
    );
  });

  it("uses the same formula for a resignation-triggered (last_active_standing) win", () => {
    const seats = [
      buildSeat({ seatIndex: 0, rack: [numbered("C1", 5), numbered("C1", 6)] }),
      buildSeat({ seatIndex: 1, rack: [] }),
    ];
    const result = score(seats, 1, "last_active_standing");
    expect(result).toEqual(
      expect.arrayContaining([
        { seatIndex: 0, points: -11 },
        { seatIndex: 1, points: 11 },
      ]),
    );
  });
});

describe("score -- pool exhaustion", () => {
  it("matches the plan's worked example exactly", () => {
    // Winner rack 5; active non-winner rack 12 -> -(12-5) = -7;
    // resigned rack 3 -> -3 (not +2); winner +(7+3) = +10.
    const seats = [
      buildSeat({ seatIndex: 0, rack: [numbered("C1", 5)] }), // winner, rack=5
      buildSeat({ seatIndex: 1, rack: [numbered("C1", 12)] }), // active non-winner, rack=12
      buildSeat({ seatIndex: 2, rack: [numbered("C1", 3)], status: "resigned" }), // resigned, rack=3
    ];
    const result = score(seats, 0, "pool_exhausted");
    expect(result).toEqual(
      expect.arrayContaining([
        { seatIndex: 1, points: -7 },
        { seatIndex: 2, points: -3 },
        { seatIndex: 0, points: 10 },
      ]),
    );
  });

  it("never rewards a resigned player for a smaller frozen rack than the winner's", () => {
    // Resigned rack (3) is smaller than the winner's rack (5) -- a naive
    // difference formula would give the resigned player +2, which must
    // never happen.
    const seats = [
      buildSeat({ seatIndex: 0, rack: [numbered("C1", 5)] }),
      buildSeat({ seatIndex: 1, rack: [numbered("C1", 3)], status: "resigned" }),
    ];
    const result = score(seats, 0, "pool_exhausted");
    const resignedEntry = result.find((entry) => entry.seatIndex === 1)!;
    expect(resignedEntry.points).toBeLessThanOrEqual(0);
    expect(resignedEntry.points).toBe(-3);
  });

  it("active non-winners use the difference formula, not the full-rack formula", () => {
    const seats = [
      buildSeat({ seatIndex: 0, rack: [numbered("C1", 5)] }),
      buildSeat({ seatIndex: 1, rack: [numbered("C1", 8)] }),
    ];
    const result = score(seats, 0, "pool_exhausted");
    expect(result).toEqual(
      expect.arrayContaining([
        { seatIndex: 1, points: -3 }, // -(8-5), not -8
        { seatIndex: 0, points: 3 },
      ]),
    );
  });
});

describe("score -- zero-sum property", () => {
  const rackValuesArb = fc.array(fc.integer({ min: 1, max: 13 }), { minLength: 0, maxLength: 6 });

  test.prop([fc.array(rackValuesArb, { minLength: 2, maxLength: 4 }), fc.nat()])(
    "normal-win scores always sum to zero",
    (rawRacks, winnerPick) => {
      const seats = rawRacks.map((values, i) =>
        buildSeat({ seatIndex: i, rack: values.map((v) => numbered("C1", v)) }),
      );
      const winnerSeatIndex = winnerPick % seats.length;
      const result = score(seats, winnerSeatIndex, "empty_rack");
      expect(result.reduce((sum, entry) => sum + entry.points, 0)).toBe(0);
    },
  );

  test.prop([
    fc.array(rackValuesArb, { minLength: 2, maxLength: 4 }),
    fc.nat(),
    fc.array(fc.boolean(), { minLength: 2, maxLength: 4 }),
  ])(
    "pool-exhaustion scores always sum to zero, regardless of active/resigned mix",
    (rawRacks, winnerPick, resignedFlags) => {
      const seats = rawRacks.map((values, i) =>
        buildSeat({
          seatIndex: i,
          rack: values.map((v) => numbered("C1", v)),
          status: resignedFlags[i] ? "resigned" : "active",
        }),
      );
      const winnerSeatIndex = winnerPick % seats.length;
      seats[winnerSeatIndex] = { ...seats[winnerSeatIndex]!, status: "active" };
      const result = score(seats, winnerSeatIndex, "pool_exhausted");
      expect(result.reduce((sum, entry) => sum + entry.points, 0)).toBe(0);
    },
  );
});
