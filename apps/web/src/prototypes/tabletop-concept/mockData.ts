// Every hardcoded value the static concept prototype renders lives here.
// This is visual mock data only (docs/meld-masters-tabletop-static-
// prototype-summary.md) -- scores, round/target, move log, and countdown
// text are NOT real application features and must never be wired into the
// live tabletop. Tile colors/symbols/value range (1-13) mirror the real
// engine's actual vocabulary (packages/shared/src/branding.ts) so the mock
// board reads as a plausible Meld Masters state, not an unrelated game's.

import { TILE_COLOR_TOKENS, type TileColorCode } from "@tile-meld/shared";
import { portraitForSeat } from "../../branding/portraits.js";

export type MockTile =
  | { readonly kind: "numbered"; readonly color: TileColorCode; readonly value: number }
  | { readonly kind: "joker" };

export function tileColor(code: TileColorCode) {
  return TILE_COLOR_TOKENS.find((t) => t.code === code)!;
}

export type MockCompetitor = {
  readonly seatIndex: number;
  readonly name: string;
  readonly score: number;
  readonly tileCount: number;
  readonly isSelf: boolean;
  readonly isActive: boolean;
  readonly accent: "gold" | "purple" | "pink" | "green";
};

export const MOCK_COMPETITORS: readonly MockCompetitor[] = [
  {
    seatIndex: 0,
    name: "YOU",
    score: 325,
    tileCount: 11,
    isSelf: true,
    isActive: true,
    accent: "gold",
  },
  {
    seatIndex: 1,
    name: "RICO",
    score: 270,
    tileCount: 14,
    isSelf: false,
    isActive: false,
    accent: "purple",
  },
  {
    seatIndex: 2,
    name: "PIXIE",
    score: 215,
    tileCount: 12,
    isSelf: false,
    isActive: false,
    accent: "pink",
  },
  {
    seatIndex: 3,
    name: "T-BONE",
    score: 180,
    tileCount: 9,
    isSelf: false,
    isActive: false,
    accent: "green",
  },
];

export function competitorPortrait(c: MockCompetitor): string {
  return portraitForSeat(c.seatIndex, false);
}

export type MockMeld = { readonly label: string; readonly tiles: readonly MockTile[] };

export const MOCK_TABLE_MELDS: readonly MockMeld[] = [
  {
    label: "Run of 3",
    tiles: [
      { kind: "numbered", color: "C1", value: 4 },
      { kind: "numbered", color: "C1", value: 5 },
      { kind: "numbered", color: "C1", value: 6 },
    ],
  },
  {
    label: "Run of 4",
    tiles: [
      { kind: "numbered", color: "C2", value: 7 },
      { kind: "numbered", color: "C2", value: 8 },
      { kind: "numbered", color: "C2", value: 9 },
      { kind: "numbered", color: "C2", value: 10 },
    ],
  },
  {
    label: "Set of 3",
    tiles: [
      { kind: "numbered", color: "C1", value: 9 },
      { kind: "numbered", color: "C3", value: 9 },
      { kind: "numbered", color: "C4", value: 9 },
    ],
  },
  {
    label: "Run of 5",
    tiles: [
      { kind: "numbered", color: "C4", value: 2 },
      { kind: "numbered", color: "C4", value: 3 },
      { kind: "numbered", color: "C4", value: 4 },
      { kind: "numbered", color: "C4", value: 5 },
      { kind: "numbered", color: "C4", value: 6 },
    ],
  },
  {
    label: "Set of 4",
    tiles: [
      { kind: "numbered", color: "C1", value: 12 },
      { kind: "numbered", color: "C2", value: 12 },
      { kind: "numbered", color: "C3", value: 12 },
      { kind: "numbered", color: "C4", value: 12 },
    ],
  },
  {
    label: "Run of 3",
    tiles: [
      { kind: "numbered", color: "C3", value: 11 },
      { kind: "numbered", color: "C3", value: 12 },
      { kind: "numbered", color: "C3", value: 13 },
    ],
  },
];

export const MOCK_RACK: readonly MockTile[] = [
  { kind: "numbered", color: "C1", value: 1 },
  { kind: "numbered", color: "C1", value: 2 },
  { kind: "numbered", color: "C1", value: 3 },
  { kind: "numbered", color: "C2", value: 7 },
  { kind: "numbered", color: "C2", value: 8 },
  { kind: "numbered", color: "C2", value: 10 },
  { kind: "numbered", color: "C3", value: 11 },
  { kind: "numbered", color: "C4", value: 12 },
  { kind: "numbered", color: "C4", value: 13 },
  { kind: "numbered", color: "C1", value: 9 },
  { kind: "joker" },
];

export const MOCK_MOVE_LOG: readonly { readonly who: string; readonly what: string }[] = [
  { who: "RICO", what: "PASSED" },
  { who: "PIXIE", what: "DRAW 7" },
  { who: "T-BONE", what: "PLAYED 9 9 9" },
  { who: "YOU", what: "PLAYED 4 5 6" },
  { who: "RICO", what: "DRAW 2" },
];

export const MOCK_HOW_TO_PLAY: readonly string[] = [
  "Create RUNS of 3 or more consecutive numbers.",
  "Create SETS of 3 or more of the same number.",
  "Meld all your tiles to score.",
  "Go out first to earn bonus!",
];

export const MOCK_STATUS = {
  league: "Arcade League",
  season: "Season 1",
  round: 6,
  totalRounds: 10,
  targetScore: 500,
  tableName: "Neon Grid",
  turnCountdown: "01:12",
  poolCount: 78,
  tilesLeft: 10,
  possibleMelds: 3,
  tip: "Plan ahead. Meld smart. Be the master.",
};
