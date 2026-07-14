import { describe, expect, it } from "vitest";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import type { Color, JokerTile, NumberedTile, Tile } from "@tile-meld/engine";
import {
  redactGameFor,
  type PersistedGameView,
  type SeatWithDisplayName,
} from "../../src/db/redact.js";

function numbered(color: Color, value: number, copy: "a" | "b" = "a"): NumberedTile {
  return { kind: "numbered", color, value, tileId: `${color}-${value}-${copy}` };
}

function joker(copy: "a" | "b" = "a"): JokerTile {
  return { kind: "joker", tileId: `J-${copy}` };
}

function seat(
  overrides: Partial<SeatWithDisplayName> & { seatIndex: number },
): SeatWithDisplayName {
  return {
    rack: [],
    status: "active",
    hasInitialMeld: false,
    displayName: `Player ${overrides.seatIndex}`,
    ...overrides,
  };
}

function game(
  overrides: Partial<PersistedGameView> & { seats: readonly SeatWithDisplayName[] },
): PersistedGameView {
  return {
    table: [],
    pool: [],
    activeSeat: 0,
    consecutivePasses: 0,
    status: "active",
    ...overrides,
  };
}

describe("redactGameFor", () => {
  it("shows the viewer's own rack in full", () => {
    const ownRack = [numbered("C1", 5), numbered("C1", 6)];
    const g = game({
      seats: [
        seat({ seatIndex: 0, rack: ownRack }),
        seat({ seatIndex: 1, rack: [numbered("C2", 1)] }),
      ],
    });
    const view = redactGameFor(g, 0);
    expect(view.self.rack).toEqual(ownRack);
    expect(view.self.seatIndex).toBe(0);
  });

  it("never includes an opponent's rack contents, only a count", () => {
    const opponentRack = [numbered("C2", 1), numbered("C2", 2), joker()];
    const g = game({
      seats: [seat({ seatIndex: 0, rack: [] }), seat({ seatIndex: 1, rack: opponentRack })],
    });
    const view = redactGameFor(g, 0);
    expect(view.opponents).toEqual([
      {
        seatIndex: 1,
        displayName: "Player 1",
        rackCount: 3,
        status: "active",
        hasInitialMeld: false,
      },
    ]);
    // Belt and suspenders: assert none of the opponent's actual tileIds
    // appear anywhere in the serialized output at all.
    const serialized = JSON.stringify(view);
    for (const tile of opponentRack) {
      expect(serialized).not.toContain(tile.tileId);
    }
  });

  it("exposes only the pool count, never its contents or order", () => {
    const pool = [numbered("C3", 9), numbered("C3", 10), joker("b")];
    const g = game({ seats: [seat({ seatIndex: 0, rack: [] })], pool });
    const view = redactGameFor(g, 0);
    expect(view.poolCount).toBe(3);
    const serialized = JSON.stringify(view);
    for (const tile of pool) {
      expect(serialized).not.toContain(tile.tileId);
    }
  });

  it("passes the public table through unchanged", () => {
    const table = [[numbered("C1", 5), numbered("C1", 6), numbered("C1", 7)]];
    const g = game({ seats: [seat({ seatIndex: 0, rack: [] })], table });
    const view = redactGameFor(g, 0);
    expect(view.table).toEqual(table);
  });

  it("works correctly for 2, 3, and 4 seat games", () => {
    for (const seatCount of [2, 3, 4]) {
      const seats = Array.from({ length: seatCount }, (_, i) =>
        seat({ seatIndex: i, rack: [numbered("C1", i + 1)] }),
      );
      const g = game({ seats });
      const view = redactGameFor(g, 0);
      expect(view.opponents).toHaveLength(seatCount - 1);
      expect(view.opponents.every((o) => o.seatIndex !== 0)).toBe(true);
    }
  });

  it("throws for a viewer seat index that doesn't exist", () => {
    const g = game({ seats: [seat({ seatIndex: 0, rack: [] })] });
    expect(() => redactGameFor(g, 5)).toThrow();
  });

  it("reflects resigned status and initial-meld progress for opponents", () => {
    const g = game({
      seats: [
        seat({ seatIndex: 0, rack: [] }),
        seat({ seatIndex: 1, rack: [], status: "resigned", hasInitialMeld: true }),
      ],
    });
    const view = redactGameFor(g, 0);
    expect(view.opponents[0]).toMatchObject({ status: "resigned", hasInitialMeld: true });
  });
});

describe("redactGameFor -- no-leakage property", () => {
  const tileArb: fc.Arbitrary<Tile> = fc
    .tuple(fc.constantFrom<Color>("C1", "C2", "C3", "C4"), fc.integer({ min: 1, max: 13 }))
    .map(([color, value]) => numbered(color, value));

  test.prop([
    fc.array(fc.array(tileArb, { minLength: 0, maxLength: 6 }), { minLength: 2, maxLength: 4 }),
    fc.array(tileArb, { minLength: 0, maxLength: 10 }),
    fc.nat(),
  ])(
    "the redacted view for any seat never contains a tileId belonging only to another seat's rack or the pool",
    (racks, pool, viewerPick) => {
      const seats = racks.map((rack, i) => seat({ seatIndex: i, rack }));
      const viewerSeatIndex = viewerPick % seats.length;
      const g = game({ seats, pool });
      const view = redactGameFor(g, viewerSeatIndex);
      const serialized = JSON.stringify(view);

      const viewerTileIds = new Set(seats[viewerSeatIndex]!.rack.map((t) => t.tileId));
      for (let i = 0; i < seats.length; i++) {
        if (i === viewerSeatIndex) continue;
        for (const tile of seats[i]!.rack) {
          if (viewerTileIds.has(tile.tileId)) continue; // duplicate id in test data, not a real leak
          expect(serialized).not.toContain(tile.tileId);
        }
      }
      for (const tile of pool) {
        if (viewerTileIds.has(tile.tileId)) continue;
        expect(serialized).not.toContain(tile.tileId);
      }
    },
  );
});
