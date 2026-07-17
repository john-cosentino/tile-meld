import type { Tile, TableSet } from "@tile-meld/engine";

// Public contract of the pure move generator. This package is PURE: no DB,
// network, env, logging, timers, Date.now(), or Math.random(). Its only
// dependency is @tile-meld/engine, whose validators remain the authoritative
// rules -- the generator never re-implements them (docs plan §4/§6).

/**
 * Everything the bot is allowed to see. Deliberately NEVER contains any other
 * seat's rack -- the human's private tiles cannot be represented here, let
 * alone inspected (docs plan §6, "information boundaries"). `poolNonEmpty` is
 * the only pool fact the generator needs (draw vs pass); it never sees pool
 * order or contents.
 */
export type BotTurnInput = {
  readonly rack: readonly Tile[];
  readonly table: readonly TableSet[];
  readonly hasInitialMeld: boolean;
  readonly poolNonEmpty: boolean;
};

/** A complete legal turn to commit, as tileId arrays per table set (the exact
 * shape the server's commit path consumes). Includes the ranking facts so the
 * caller can log them without recomputing. */
export type BotCommit = {
  readonly kind: "commit";
  readonly arrangement: readonly (readonly string[])[];
  readonly tilesPlayed: number;
  readonly faceValuePlayed: number;
  readonly wins: boolean;
};
export type BotDraw = { readonly kind: "draw" };
export type BotPass = { readonly kind: "pass" };

/** The generator's decision: play a validated commit, draw one tile, or pass. */
export type BotDecision = BotCommit | BotDraw | BotPass;

export type BotConfig = {
  /** Deterministic search bound: the maximum number of DFS nodes visited
   * before the search stops and returns the best turn found so far. A count,
   * never a wall-clock cutoff, so move selection is machine-speed independent
   * (docs plan §6, Amendment: no wall-clock in selection). */
  readonly maxNodes?: number;
};
