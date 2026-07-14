import type { Color, JokerTile, NumberedTile } from "../src/types.js";

export function numbered(color: Color, value: number, copy: "a" | "b" = "a"): NumberedTile {
  return { kind: "numbered", color, value, tileId: `${color}-${value}-${copy}` };
}

export function joker(copy: "a" | "b" = "a"): JokerTile {
  return { kind: "joker", tileId: `J-${copy}` };
}
