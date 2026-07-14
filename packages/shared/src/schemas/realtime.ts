import { z } from "zod";

// Wire schemas for Socket.IO events -- docs/opus-implementation-plan.md
// §7.3. Every inbound (client -> server) payload is validated against one
// of these before it touches the game/turnActions orchestration layer.

export const IdempotencyKeySchema = z.string().trim().min(1).max(100);

// `arrangement` carries tileIds only, never full tile objects -- the
// server resolves each id against its own canonical catalog
// (apps/server/src/db/catalog.ts) rather than trusting a client-supplied
// color/value. A client is a hint source, never a source of truth (see
// CLAUDE.md); trusting client-supplied tile attributes here would let a
// player misrepresent a tile's color/value to fabricate an illegal set.
export const TileArrangementSchema = z.array(z.array(z.string()));

export const GameJoinPayloadSchema = z.object({
  gameId: z.string(),
});

export const TurnCommitPayloadSchema = z.object({
  gameId: z.string(),
  expectedVersion: z.number().int().nonnegative(),
  turnId: z.string(),
  arrangement: TileArrangementSchema,
  idempotencyKey: IdempotencyKeySchema,
});

export const TurnDrawPayloadSchema = z.object({
  gameId: z.string(),
  expectedVersion: z.number().int().nonnegative(),
  turnId: z.string(),
  idempotencyKey: IdempotencyKeySchema,
});

export const TurnPassPayloadSchema = TurnDrawPayloadSchema;

// turn:resign deliberately carries no expectedVersion/turnId -- a player
// may resign out of turn (docs/opus-implementation-plan.md §7.3), so it
// isn't gated by the same optimistic-concurrency check as commit/draw/pass.
export const TurnResignPayloadSchema = z.object({
  gameId: z.string(),
  idempotencyKey: IdempotencyKeySchema,
});

export const ChatSendPayloadSchema = z.object({
  gameId: z.string(),
  body: z.string().trim().min(1).max(500),
});

// Server -> client event payloads (not validated, since the server
// produces them -- exported for shared typing between apps/server and,
// later, apps/web).
export const TurnStartedEventSchema = z.object({
  seatIndex: z.number().int(),
  deadlineAt: z.string(),
});

export const TurnWarningEventSchema = z.object({
  seatIndex: z.number().int(),
  remainingMs: z.number().int(),
});

export const TurnTimeoutEventSchema = z.object({
  seatIndex: z.number().int(),
  penaltyDrawn: z.number().int(),
});

export const GameOverEventSchema = z.object({
  winnerSeatIndex: z.number().int(),
  scores: z.array(z.object({ seatIndex: z.number().int(), points: z.number().int() })),
  roomCumulative: z.array(
    z.object({
      playerId: z.string(),
      cumulativeScore: z.number().int(),
      gamesPlayed: z.number().int(),
      gamesWon: z.number().int(),
    }),
  ),
});

export const ChatMessageEventSchema = z.object({
  seatIndex: z.number().int().nullable(),
  senderDisplay: z.string(),
  body: z.string(),
  createdAt: z.string(),
});

export const SocketErrorEventSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const GamePatchEventSchema = z.object({
  version: z.number().int(),
  events: z.array(z.record(z.string(), z.unknown())),
  changed: z.boolean(),
});

export type GameJoinPayload = z.infer<typeof GameJoinPayloadSchema>;
export type TurnCommitPayload = z.infer<typeof TurnCommitPayloadSchema>;
export type TurnDrawPayload = z.infer<typeof TurnDrawPayloadSchema>;
export type TurnPassPayload = z.infer<typeof TurnPassPayloadSchema>;
export type TurnResignPayload = z.infer<typeof TurnResignPayloadSchema>;
export type ChatSendPayload = z.infer<typeof ChatSendPayloadSchema>;
