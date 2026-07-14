import type { Color, JokerTile, NumberedTile, Tile } from "../src/types.js";
import type { GameState, Seat } from "../src/game-types.js";

export function numbered(color: Color, value: number, copy: "a" | "b" = "a"): NumberedTile {
  return { kind: "numbered", color, value, tileId: `${color}-${value}-${copy}` };
}

export function joker(copy: "a" | "b" = "a"): JokerTile {
  return { kind: "joker", tileId: `J-${copy}` };
}

export function buildSeat(overrides: Partial<Seat> & { seatIndex: number }): Seat {
  return {
    rack: [],
    status: "active",
    hasInitialMeld: false,
    ...overrides,
  };
}

export function buildGame(overrides: Partial<GameState> & { seats: readonly Seat[] }): GameState {
  return {
    pool: [],
    table: [],
    activeSeat: 0,
    consecutivePasses: 0,
    status: "active",
    ...overrides,
  };
}

/** N distinct filler tiles, useful for padding a pool/rack in tests that
 * don't care about the specific tiles, only the count. Uses colors/values
 * that won't collide with a test's own hand-picked tiles as long as the
 * test stays within a single color/value region -- callers needing
 * guaranteed non-collision should pick their own explicit tiles instead. */
export function fillerTiles(count: number, startValue = 1): Tile[] {
  const tiles: Tile[] = [];
  let value = startValue;
  let copy: "a" | "b" = "a";
  while (tiles.length < count) {
    tiles.push(numbered("C4", value, copy));
    if (copy === "a") {
      copy = "b";
    } else {
      copy = "a";
      value += 1;
      if (value > 13) value = 1;
    }
  }
  return tiles;
}
