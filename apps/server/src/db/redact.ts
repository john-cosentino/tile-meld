import type { GameStatus, Seat, TableSet, Tile } from "@tile-meld/engine";
import type { RedactedGameView as WireGameView } from "@tile-meld/shared";

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
  /** The active turn's deadline, or null once the game has completed. Lets
   * a client show a countdown immediately on load, without having to wait
   * for a turn:started socket event that only fires on the *next*
   * transition. */
  readonly deadlineAt: Date | null;
  /** The active turn's id, or null once the game has completed -- every
   * turn-mutating socket event (except resign) requires this alongside
   * `version` for optimistic concurrency (§7.5). */
  readonly turnId: string | null;
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
  readonly deadlineAt: Date | null;
  readonly turnId: string | null;
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
    deadlineAt: game.deadlineAt,
    turnId: game.turnId,
    self: { ...toPublicView(viewerSeat), rack: viewerSeat.rack },
    opponents,
  };
}

/**
 * Builds the exact wire-format payload for a game snapshot: `redactGameFor`
 * plus the identifiers/serialization only the transport layer cares about
 * (`gameId`/`version` from persistence, `deadlineAt` as an ISO string
 * rather than a `Date` -- Zod's `z.string()` does not coerce `Date`
 * instances, so this conversion must happen before either the HTTP route
 * or the Socket.IO gateway hands a payload to its schema). Both call sites
 * shared this exact transformation before it was factored out here.
 */
export function buildWireGameView(
  game: PersistedGameView & { readonly gameId: string; readonly version: number },
  viewerSeatIndex: number,
): WireGameView {
  const redacted = redactGameFor(game, viewerSeatIndex);
  // The engine/redaction layer deliberately returns `readonly` arrays
  // throughout (immutability discipline for state objects); Zod's inferred
  // type is mutable. Purely a compile-time distinction that doesn't affect
  // JSON serialization -- safe to assert here, at the serialization
  // boundary only.
  return {
    ...redacted,
    deadlineAt: redacted.deadlineAt ? redacted.deadlineAt.toISOString() : null,
    gameId: game.gameId,
    version: game.version,
  } as WireGameView;
}
