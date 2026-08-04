import { z } from "zod";
import { PortraitIdSchema } from "./account.js";

// Mirrors packages/engine's Tile/Color shape without importing it --
// packages/shared depends on nothing but zod (see docs/opus-implementation-
// plan.md §4.2 dependency graph). This is the wire format for tiles in
// HTTP/WS payloads, deliberately decoupled from the engine's internal type.

export const ColorSchema = z.enum(["C1", "C2", "C3", "C4"]);

export const NumberedTileSchema = z.object({
  kind: z.literal("numbered"),
  tileId: z.string(),
  color: ColorSchema,
  value: z.number().int().min(1).max(13),
});

export const JokerTileSchema = z.object({
  kind: z.literal("joker"),
  tileId: z.string(),
});

export const TileSchema = z.discriminatedUnion("kind", [NumberedTileSchema, JokerTileSchema]);

export const TableSetSchema = z.array(TileSchema);

export const SeatStatusSchema = z.enum(["active", "resigned"]);
export const GameStatusSchema = z.enum(["active", "completed"]);

export const RedactedSeatViewSchema = z.object({
  seatIndex: z.number().int(),
  displayName: z.string(),
  rackCount: z.number().int(),
  status: SeatStatusSchema,
  hasInitialMeld: z.boolean(),
  // Whether this seat is played by the computer opponent. Non-sensitive: it
  // lets the client badge the bot and show a "Computer is playing" turn state.
  isComputer: z.boolean(),
  // Chosen profile portrait (accounts plan, Phase C), resolved live from
  // players.portrait_id when the view is built -- never snapshotted onto
  // the seat. null = no pick; clients fall back to seat-order portraits.
  portraitId: PortraitIdSchema,
});

export const RedactedSelfViewSchema = RedactedSeatViewSchema.extend({
  rack: z.array(TileSchema),
});

export const RedactedGameViewSchema = z.object({
  gameId: z.string(),
  roomId: z.string(),
  version: z.number().int(),
  table: z.array(TableSetSchema),
  poolCount: z.number().int(),
  activeSeat: z.number().int(),
  consecutivePasses: z.number().int(),
  status: GameStatusSchema,
  /** ISO timestamp of the active turn's deadline, or null once the game
   * has completed. */
  deadlineAt: z.string().nullable(),
  /** The active turn's id, or null once the game has completed. */
  turnId: z.string().nullable(),
  /** The winning seat, or null while the game is still active. Durable --
   * unlike the one-time `game:over` socket event (whose winnerSeatIndex/
   * scores payload is never persisted), this is read from the games row
   * itself, so "who won" stays answerable on reload or a later visit, not
   * only for a client that happened to be connected at the exact moment
   * the game ended. */
  winnerSeatIndex: z.number().int().nullable(),
  self: RedactedSelfViewSchema,
  opponents: z.array(RedactedSeatViewSchema),
});

export type Tile = z.infer<typeof TileSchema>;
export type RedactedGameView = z.infer<typeof RedactedGameViewSchema>;
