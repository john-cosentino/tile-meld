import {
  ClaimUsernameResponseSchema,
  CreateIdentityResponseSchema,
  RecoverSessionResponseSchema,
  RotateRecoveryResponseSchema,
  CreateRoomResponseSchema,
  JoinRoomResponseSchema,
  QuickJoinResponseSchema,
  VsComputerResponseSchema,
  PublicRoomsResponseSchema,
  LeaveResponseSchema,
  StartOrRematchResponseSchema,
  GetRoomResponseSchema,
  ReadyResponseSchema,
  RedactedGameViewSchema,
  ChatHistoryResponseSchema,
  VapidPublicKeyResponseSchema,
  type CreateRoomRequest,
  type JoinRoomRequest,
  type QuickJoinRequest,
  type GetRoomResponse,
  type PublicRoomsResponse,
  type RedactedGameView,
  type ChatHistoryResponse,
  type PushSubscribeRequest,
  type VapidPublicKeyResponse,
} from "@tile-meld/shared";
import { z } from "zod";

// A thin, typed wrapper around fetch for the Fastify HTTP API. Every
// response is parsed through its Zod schema -- not just for compile-time
// types, but so a shape mismatch fails loudly in dev instead of silently
// producing `undefined` deep in a component. `credentials: "include"`
// on every call sends the httpOnly session cookie; the client never reads
// or sets it directly (see AuthProvider).

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  method: string,
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : null,
  });

  if (!response.ok) {
    let code = "unknown";
    let message = response.statusText;
    try {
      const errBody = (await response.json()) as { error?: string; message?: string };
      code = errBody.error ?? code;
      message = errBody.message ?? message;
    } catch {
      // response body wasn't JSON -- fall back to statusText above.
    }
    throw new ApiError(response.status, code, message);
  }

  if (response.status === 204) return undefined as T;
  return schema.parse(await response.json());
}

export const api = {
  createIdentity: () => request("POST", "/identity", CreateIdentityResponseSchema),

  recoverSession: (playerId: string, recoverySecret: string) =>
    request("POST", "/session/recover", RecoverSessionResponseSchema, { playerId, recoverySecret }),

  rotateRecovery: () => request("POST", "/session/rotate-recovery", RotateRecoveryResponseSchema),

  claimUsername: (username: string) =>
    request("POST", "/identity/username", ClaimUsernameResponseSchema, { username }),

  createRoom: (body: CreateRoomRequest) =>
    request("POST", "/rooms", CreateRoomResponseSchema, body),

  joinRoom: (body: JoinRoomRequest) => request("POST", "/rooms/join", JoinRoomResponseSchema, body),

  quickJoin: (body: QuickJoinRequest) =>
    request("POST", "/rooms/quick-join", QuickJoinResponseSchema, body),

  createVsComputer: (displayName: string) =>
    request("POST", "/rooms/vs-computer", VsComputerResponseSchema, { displayName }),

  publicRooms: (limit = 20, offset = 0): Promise<PublicRoomsResponse> =>
    request("GET", `/rooms/public?limit=${limit}&offset=${offset}`, PublicRoomsResponseSchema),

  getRoom: (roomId: string): Promise<GetRoomResponse> =>
    request("GET", `/rooms/${roomId}`, GetRoomResponseSchema),

  setReady: (roomId: string, ready: boolean) =>
    request("POST", `/rooms/${roomId}/ready`, ReadyResponseSchema, { ready }),

  leaveRoom: (roomId: string) => request("POST", `/rooms/${roomId}/leave`, LeaveResponseSchema),

  startRoom: (roomId: string) =>
    request("POST", `/rooms/${roomId}/start`, StartOrRematchResponseSchema),

  rematchRoom: (roomId: string) =>
    request("POST", `/rooms/${roomId}/rematch`, StartOrRematchResponseSchema),

  getGame: (gameId: string): Promise<RedactedGameView> =>
    request("GET", `/games/${gameId}`, RedactedGameViewSchema),

  getGameChat: (gameId: string): Promise<ChatHistoryResponse> =>
    request("GET", `/games/${gameId}/chat`, ChatHistoryResponseSchema),

  vapidPublicKey: (): Promise<VapidPublicKeyResponse> =>
    request("GET", "/push/vapid-public-key", VapidPublicKeyResponseSchema),

  subscribePush: (body: PushSubscribeRequest) => request("POST", "/push/subscribe", z.void(), body),

  unsubscribePush: (endpoint: string) =>
    request("DELETE", `/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, z.void()),
};
