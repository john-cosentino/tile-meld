import type { FastifyReply, FastifyRequest } from "fastify";
import { SESSION_COOKIE_NAME } from "../security/session.js";
import { findActiveSessionByToken } from "../db/repositories/sessions.js";
import { findRoomMemberByRoomAndPlayer } from "../db/repositories/roomMembers.js";
import type { RoomMemberRow } from "../db/repositories/roomMembers.js";
import type { RoomRow } from "../db/repositories/rooms.js";
import { sendError } from "./errors.js";

/** preValidation hook: resolves the session cookie to `request.player`, or
 * replies 401. Used as `preValidation`, not `preHandler`, so an
 * unauthenticated request is always rejected with 401 before Fastify's
 * schema validation ever runs -- otherwise a malformed body from an
 * unauthenticated caller would get 400 first, leaking schema shape before
 * auth is even checked. Every route except /api/identity,
 * /api/session/recover, and /api/health requires this. */
export async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  if (!token) {
    sendError(reply, "unauthorized", "no session cookie");
    return;
  }
  const session = await findActiveSessionByToken(
    request.server.db,
    token,
    request.server.env.SESSION_TOKEN_HMAC_SECRET,
  );
  if (!session) {
    sendError(reply, "unauthorized", "invalid or expired session");
    return;
  }
  request.player = { id: session.player_id };
}

/** Loads the requesting player's membership in a room, or replies 403 (not
 * a member) and returns undefined. Callers must check the return value. */
export async function requireRoomMember(
  request: FastifyRequest,
  reply: FastifyReply,
  roomId: string,
): Promise<RoomMemberRow | undefined> {
  const playerId = request.player!.id;
  const member = await findRoomMemberByRoomAndPlayer(request.server.db, roomId, playerId);
  if (!member) {
    sendError(reply, "forbidden", "not a member of this room");
    return undefined;
  }
  return member;
}

/** Like requireRoomMember, but additionally requires the requester to be
 * the room's current host. Replies 403 and returns undefined otherwise. */
export async function requireRoomHost(
  request: FastifyRequest,
  reply: FastifyReply,
  room: RoomRow,
): Promise<RoomMemberRow | undefined> {
  const member = await requireRoomMember(request, reply, room.id);
  if (!member) return undefined;
  if (room.host_room_member_id !== member.id) {
    sendError(reply, "forbidden", "only the room host can do this");
    return undefined;
  }
  return member;
}
