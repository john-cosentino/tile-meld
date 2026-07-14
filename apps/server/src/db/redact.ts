import type { GameStatus, Seat, TableSet, Tile } from "@tile-meld/engine";

// redactGameFor is the single function responsible for building a
// per-player view of a game. No other code path may broadcast or return
// game state to a client -- see docs/opus-implementation-plan.md §7.4/D-
// REDACT. The engine's own GameState.seats has no display names (that's
// a persistence/identity concern, not a rules concern), so this operates
// on a slightly richer view assembled by the repository layer.

export type SeatWithDisplayName = Seat & { readonly displayName: string };

export type PersistedGameView = {
  readonly table: readonly TableSet[];
  readonly pool: readonly Tile[];
  readonly seats: readonly SeatWithDisplayName[];
  readonly activeSeat: number;
  readonly consecutivePasses: number;
  readonly status: GameStatus;
};

export type RedactedSeatView = {
  readonly seatIndex: number;
  readonly displayName: string;
  readonly rackCount: number;
  readonly status: Seat["status"];
  readonly hasInitialMeld: boolean;
};

export type RedactedSelfView = RedactedSeatView & {
  readonly rack: readonly Tile[];
};

export type RedactedGameView = {
  readonly table: readonly TableSet[];
  readonly poolCount: number;
  readonly activeSeat: number;
  readonly consecutivePasses: number;
  readonly status: GameStatus;
  readonly self: RedactedSelfView;
  readonly opponents: readonly RedactedSeatView[];
};

function toPublicView(seat: SeatWithDisplayName): RedactedSeatView {
  return {
    seatIndex: seat.seatIndex,
    displayName: seat.displayName,
    rackCount: seat.rack.length,
    status: seat.status,
    hasInitialMeld: seat.hasInitialMeld,
  };
}

/**
 * Builds the redacted view for a specific viewing seat: their own rack in
 * full, every other seat as a public summary (rack count only, never
 * contents), the full public table, and the pool as a count only (never
 * its order/contents). No hashes, tokens, or recovery secrets ever pass
 * through here -- those never enter a GameState/PersistedGameView in the
 * first place.
 */
export function redactGameFor(game: PersistedGameView, viewerSeatIndex: number): RedactedGameView {
  const viewerSeat = game.seats.find((seat) => seat.seatIndex === viewerSeatIndex);
  if (!viewerSeat) {
    throw new Error(`redactGameFor: no such seat: ${viewerSeatIndex}`);
  }

  const opponents = game.seats
    .filter((seat) => seat.seatIndex !== viewerSeatIndex)
    .map(toPublicView);

  return {
    table: game.table,
    poolCount: game.pool.length,
    activeSeat: game.activeSeat,
    consecutivePasses: game.consecutivePasses,
    status: game.status,
    self: { ...toPublicView(viewerSeat), rack: viewerSeat.rack },
    opponents,
  };
}
