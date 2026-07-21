import { z } from "zod";
import { USERNAME_MAX_LENGTH } from "./identity.js";

export const DisplayNameSchema = z.string().trim().min(1).max(40);
export const RoomCodeSchema = z.string().trim().min(1).max(16);
// Practical max length for a join-by-name lookup: the longest string the
// server-side allocator (createRoom/createComputerRoom, Phase 2) can ever
// generate -- "public_" (7) + the longest username (USERNAME_MAX_LENGTH)
// + a numbered suffix up to " 50" (3) -- see ROOM_NAME_CANDIDATE_WINDOW in
// apps/server/src/db/repositories/rooms.ts. A room name is never free
// user input, so this bound is derived from the generator, not guessed.
export const ROOM_NAME_MAX_LENGTH = "public_".length + USERNAME_MAX_LENGTH + " 50".length;
export const RoomNameSchema = z.string().trim().min(1).max(ROOM_NAME_MAX_LENGTH);
export const CapacitySchema = z.union([z.literal(2), z.literal(3), z.literal(4)]);
export const VisibilitySchema = z.enum(["private", "public"]);
export const TurnLimitHoursSchema = z.union([
  z.literal(4),
  z.literal(8),
  z.literal(12),
  z.literal(24),
]);

export const CreateRoomRequestSchema = z.object({
  displayName: DisplayNameSchema,
  capacity: CapacitySchema,
  visibility: VisibilitySchema,
  turnLimitHours: TurnLimitHoursSchema,
});
export const CreateRoomResponseSchema = z.object({
  roomId: z.string(),
  code: z.string(),
  // Server-generated friendly name (Phase 2); null only for legacy rooms
  // predating this field, which can't apply to a just-created room, but the
  // type stays nullable to match every other room response uniformly.
  name: z.string().nullable(),
});

export const JoinRoomRequestSchema = z.object({
  code: RoomCodeSchema,
  displayName: DisplayNameSchema,
});
export const JoinRoomResponseSchema = z.object({
  roomId: z.string(),
});

// Join Room by Name (Phase 3, corrected DR-8): the normal join path for
// both public and private rooms, resolved by exact name -- no code, no
// display name (the authenticated player's claimed username is used
// server-side). Reuses JoinRoomResponseSchema -- identical `{roomId}`
// shape.
export const JoinRoomByNameRequestSchema = z.object({
  name: RoomNameSchema,
});

export const QuickJoinRequestSchema = z.object({
  displayName: DisplayNameSchema,
});
export const QuickJoinResponseSchema = z.object({
  roomId: z.string(),
});

// Play vs Computer: creates a private 2-seat room already occupied by the
// computer opponent. The caller only supplies their own display name; the
// server fixes visibility, capacity, and the bot member.
export const VsComputerRequestSchema = z.object({
  displayName: DisplayNameSchema,
});
export const VsComputerResponseSchema = z.object({
  roomId: z.string(),
  code: z.string(),
  name: z.string().nullable(),
});

export const PublicRoomsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
export const PublicRoomSummarySchema = z.object({
  roomId: z.string(),
  code: z.string(),
  name: z.string().nullable(),
  memberDisplayNames: z.array(z.string()),
  memberCount: z.number().int(),
  capacity: z.number().int(),
  turnLimitHours: z.number().int(),
});
export const PublicRoomsResponseSchema = z.object({
  rooms: z.array(PublicRoomSummarySchema),
});

export const ReadyRequestSchema = z.object({
  ready: z.boolean(),
});
export const ReadyResponseSchema = z.object({
  ready: z.boolean(),
});

export const RoomMemberSummarySchema = z.object({
  playerId: z.string(),
  displayName: z.string(),
  isReady: z.boolean(),
  // True for the computer opponent's member -- lets the waiting room badge it
  // and treat it as always-ready. Non-sensitive.
  isComputer: z.boolean(),
});
export const GetRoomResponseSchema = z.object({
  roomId: z.string(),
  code: z.string(),
  name: z.string().nullable(),
  visibility: VisibilitySchema,
  capacity: z.number().int(),
  turnLimitHours: z.number().int(),
  status: z.enum(["open", "in_game", "between_games", "closed", "abandoned"]),
  hostPlayerId: z.string().nullable(),
  members: z.array(RoomMemberSummarySchema),
  latestGameId: z.string().nullable(),
});

export const LeaveResponseSchema = z.object({
  newHostPlayerId: z.string().nullable(),
});

export const StartOrRematchResponseSchema = z.object({
  gameId: z.string(),
});

export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;
export type CreateRoomResponse = z.infer<typeof CreateRoomResponseSchema>;
export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;
export type JoinRoomResponse = z.infer<typeof JoinRoomResponseSchema>;
export type JoinRoomByNameRequest = z.infer<typeof JoinRoomByNameRequestSchema>;
export type QuickJoinRequest = z.infer<typeof QuickJoinRequestSchema>;
export type QuickJoinResponse = z.infer<typeof QuickJoinResponseSchema>;
export type VsComputerRequest = z.infer<typeof VsComputerRequestSchema>;
export type VsComputerResponse = z.infer<typeof VsComputerResponseSchema>;
export type PublicRoomsQuery = z.infer<typeof PublicRoomsQuerySchema>;
export type PublicRoomSummary = z.infer<typeof PublicRoomSummarySchema>;
export type PublicRoomsResponse = z.infer<typeof PublicRoomsResponseSchema>;
export type ReadyRequest = z.infer<typeof ReadyRequestSchema>;
export type ReadyResponse = z.infer<typeof ReadyResponseSchema>;
export type LeaveResponse = z.infer<typeof LeaveResponseSchema>;
export type StartOrRematchResponse = z.infer<typeof StartOrRematchResponseSchema>;
export type RoomMemberSummary = z.infer<typeof RoomMemberSummarySchema>;
export type GetRoomResponse = z.infer<typeof GetRoomResponseSchema>;
