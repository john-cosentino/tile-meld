// Centralized branding/design tokens -- docs/opus-implementation-plan.md
// §10.4. Renaming "Tile Meld" or reskinning the four tile colors is a
// config change here, not a code hunt through apps/web. No copied logos,
// artwork, or typography from any commercial tile-melding game -- these
// are original names/palette/symbols.
//
// Every color token carries a `symbol` alongside its hex value: §10.3
// requires that color is never the *only* way to distinguish a tile, for
// colorblind users. `TileColorCode` deliberately mirrors packages/engine's
// `Color` type ("C1".."C4") without importing it, matching this package's
// zod-only dependency boundary (see src/schemas/game.ts).

export const PRODUCT_NAME = "Tile Meld";

export type TileColorCode = "C1" | "C2" | "C3" | "C4";

export type TileColorToken = {
  readonly code: TileColorCode;
  /** Human-readable name, shown in accessible labels ("Crimson 7"). */
  readonly label: string;
  readonly hex: string;
  /** A non-color glyph rendered on every tile of this color, so color is
   * never the sole distinguishing cue (§10.3). */
  readonly symbol: string;
};

// Hex values are chosen dark/saturated enough to clear WCAG AA's 4.5:1 text
// contrast ratio against the tile's near-white background (#fffdf7) --
// "Gold" in particular needed to be a deep amber rather than a bright
// yellow, which reads as color at a glance but fails as *text* contrast.
export const TILE_COLOR_TOKENS: readonly TileColorToken[] = [
  { code: "C1", label: "Crimson", hex: "#B3261E", symbol: "●" },
  { code: "C2", label: "Cobalt", hex: "#1957A6", symbol: "■" },
  { code: "C3", label: "Fern", hex: "#256B37", symbol: "▲" },
  { code: "C4", label: "Gold", hex: "#8A6314", symbol: "◆" },
];

export const TILE_COLOR_BY_CODE: Readonly<Record<TileColorCode, TileColorToken>> =
  Object.fromEntries(TILE_COLOR_TOKENS.map((t) => [t.code, t])) as Record<
    TileColorCode,
    TileColorToken
  >;

/** Rendered on every joker tile -- distinct from any color symbol above. */
export const JOKER_GLYPH = "★";
export const JOKER_LABEL = "Joker";

export type TurnLimitHours = 4 | 8 | 12 | 24;

export const TURN_LIMIT_OPTIONS: readonly {
  readonly hours: TurnLimitHours;
  readonly label: string;
}[] = [
  { hours: 4, label: "4 hours" },
  { hours: 8, label: "8 hours" },
  { hours: 12, label: "12 hours" },
  { hours: 24, label: "24 hours" },
];

export const INITIAL_MELD_THRESHOLD = 30;
