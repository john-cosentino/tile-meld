import { describe, expect, it } from "vitest";
import { applyResign, applyTimeout } from "../src/turns.js";
import { buildGame, buildSeat, fillerTiles, numbered } from "./fixtures.js";

describe("applyResign -- 2-player game (E-RESIGN2)", () => {
  it("immediately awards the game to the other player", () => {
    const resignerRack = [numbered("C1", 5), numbered("C1", 6)];
    const state = buildGame({
      activeSeat: 0,
      seats: [
        buildSeat({ seatIndex: 0, rack: resignerRack }),
        buildSeat({ seatIndex: 1, rack: [numbered("C2", 9)] }),
      ],
    });
    const result = applyResign(state, 0);
    expect(result.event).toEqual({ type: "resigned", seatIndex: 0 });
    expect(result.gameEnd).toMatchObject({
      ended: true,
      reason: "last_active_standing",
      winnerSeatIndex: 1,
    });
    expect(result.state.status).toBe("completed");
    expect(result.state.seats[0]!.status).toBe("resigned");
  });

  it("scores the resignation as a normal win using the resigner's rack", () => {
    // Resigner's rack: 5 + 6 = 11.
    const state = buildGame({
      activeSeat: 0,
      seats: [
        buildSeat({ seatIndex: 0, rack: [numbered("C1", 5), numbered("C1", 6)] }),
        buildSeat({ seatIndex: 1, rack: [numbered("C2", 9)] }),
      ],
    });
    const result = applyResign(state, 0);
    expect(result.gameEnd).toMatchObject({ ended: true });
    if (result.gameEnd.ended) {
      expect(result.gameEnd.scores).toEqual(
        expect.arrayContaining([
          { seatIndex: 0, points: -11 },
          { seatIndex: 1, points: 11 },
        ]),
      );
    }
  });

  it("still awards the game to the other player when the resigning seat was not the active one", () => {
    const state = buildGame({
      activeSeat: 1,
      seats: [
        buildSeat({ seatIndex: 0, rack: [numbered("C1", 5)] }),
        buildSeat({ seatIndex: 1, rack: [numbered("C2", 9)] }),
      ],
    });
    const result = applyResign(state, 0);
    expect(result.gameEnd).toMatchObject({ ended: true, winnerSeatIndex: 1 });
  });
});

describe("applyResign -- 3/4-player games", () => {
  it("continues play while at least two active players remain (3 players)", () => {
    const state = buildGame({
      activeSeat: 0,
      seats: [
        buildSeat({ seatIndex: 0, rack: [numbered("C1", 1)] }),
        buildSeat({ seatIndex: 1, rack: [numbered("C1", 2)] }),
        buildSeat({ seatIndex: 2, rack: [numbered("C1", 3)] }),
      ],
    });
    const result = applyResign(state, 0);
    expect(result.gameEnd).toEqual({ ended: false });
    expect(result.state.status).toBe("active");
    // The active seat resigned, so the turn advances to the next active one.
    expect(result.state.activeSeat).toBe(1);
  });

  it("ends the game once a second resignation drops active count to 1 (4 players)", () => {
    const seats = [
      buildSeat({ seatIndex: 0, rack: [numbered("C1", 1)], status: "resigned" as const }),
      buildSeat({ seatIndex: 1, rack: [numbered("C1", 2)] }),
      buildSeat({ seatIndex: 2, rack: [numbered("C1", 3)] }),
      buildSeat({ seatIndex: 3, rack: [numbered("C1", 4)] }),
    ];
    const state = buildGame({ activeSeat: 1, seats });
    const result = applyResign(state, 2);
    expect(result.gameEnd).toEqual({ ended: false });

    const secondResult = applyResign(result.state, 1);
    expect(secondResult.gameEnd).toMatchObject({
      ended: true,
      reason: "last_active_standing",
      winnerSeatIndex: 3,
    });
  });

  it("does not change whose turn it is when a non-active seat resigns", () => {
    const state = buildGame({
      activeSeat: 2,
      seats: [
        buildSeat({ seatIndex: 0, rack: [numbered("C1", 1)] }),
        buildSeat({ seatIndex: 1, rack: [numbered("C1", 2)] }),
        buildSeat({ seatIndex: 2, rack: [numbered("C1", 3)] }),
      ],
    });
    const result = applyResign(state, 0);
    expect(result.state.activeSeat).toBe(2);
  });

  it("freezes the resigned seat's rack -- later transitions never touch it", () => {
    const resignedRack = [numbered("C1", 5), numbered("C1", 6)];
    const seats = [
      buildSeat({ seatIndex: 0, rack: resignedRack, status: "resigned" as const }),
      buildSeat({ seatIndex: 1, rack: [] }),
      buildSeat({ seatIndex: 2, rack: [] }),
    ];
    const state = buildGame({ pool: fillerTiles(5), activeSeat: 1, seats });
    const result = applyTimeout(state, 1);
    expect(result.state.seats[0]!.rack).toEqual(resignedRack);
  });
});

describe("applyResign -- misuse guards", () => {
  it("throws when resigning a seat that has already resigned", () => {
    const state = buildGame({
      seats: [
        buildSeat({ seatIndex: 0, rack: [], status: "resigned" as const }),
        buildSeat({ seatIndex: 1, rack: [] }),
      ],
    });
    expect(() => applyResign(state, 0)).toThrow();
  });

  it("throws when called on a completed game", () => {
    const state = buildGame({
      status: "completed" as const,
      seats: [buildSeat({ seatIndex: 0, rack: [] }), buildSeat({ seatIndex: 1, rack: [] })],
    });
    expect(() => applyResign(state, 0)).toThrow();
  });
});
