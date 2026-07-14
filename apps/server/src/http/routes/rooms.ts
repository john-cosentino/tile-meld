import { randomInt } from "node:crypto";
import { z } from "zod";
import {
  CreateRoomRequestSchema,
  CreateRoomResponseSchema,
  JoinRoomRequestSchema,
  JoinRoomResponseSchema,
  LeaveResponseSchema,
  PublicRoomsQuerySchema,
  PublicRoomsResponseSchema,
  QuickJoinRequestSchema,
  QuickJoinResponseSchema,
  ReadyRequestSchema,
  StartOrRematchResponseSchema,
} from "@tile-meld/shared";
import type { AppInstance } from "../types.js";
import { requireSession, requireRoomHost, requireRoomMember } from "../auth.js";
import { sendError } from "../errors.js";
import {
  createRoom,
  findRoomByCode,
  findRoomById,
  findQuickJoinableRoom,
  listPublicOpenRoomsWithMembers,
  succeedHostIfNeeded,
  touchRoomActivity,
  updateRoomStatus,
  type RoomRow,
} from "../../db/repositories/rooms.js";
import {
  addRoomMember,
  findRoomMemberByRoomAndPlayer,
  listRoomMembers,
  markRoomMemberLeft,
  resetReadiness,
  setRoomMemberReady,
} from "../../db/repositories/roomMembers.js";
import { dealNewGame, findLatestGameForRoom } from "../../db/repositories/games.js";
import {
  publicLobbyLimit,
  roomActionLimit,
  roomCreateLimit,
  roomJoinLimit,
} from "../rateLimits.js";

const ParamsSchema = z.object({ id: z.string() });
const MIN_READY_TO_START = 2;

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

/** Deals a new game from the room's currently-ready members and
 * transitions the room to in_game, resetting readiness for the next
 * round. Preconditions (room status, ready count) must already be
 * checked by the caller. */
async function dealAndTransitionRoom(
  app: AppInstance,
  room: RoomRow,
  seq: number,
): Promise<string> {
  const members = await listRoomMembers(app.db, room.id);
  const readyMembers = members
    .filter((m) => m.is_ready)
    .map((m) => ({ roomMemberId: m.id, playerId: m.player_id, displayName: m.display_name }));

  return app.db.transaction().execute(async (trx) => {
    const { gameId } = await dealNewGame(
      trx,
      room.id,
      seq,
      readyMembers,
      room.turn_limit_hours,
      randomInt,
    );
    await updateRoomStatus(trx, room.id, "in_game");
    await resetReadiness(trx, room.id);
    return gameId;
  });
}

export function registerRoomRoutes(app: AppInstance): void {
  app.post(
    "/api/rooms",
    {
      schema: { body: CreateRoomRequestSchema, response: { 200: CreateRoomResponseSchema } },
      preValidation: requireSession,
      config: { rateLimit: roomCreateLimit },
    },
    async (request, reply) => {
      const { displayName, capacity, visibility, turnLimitHours } = request.body;
      const { room } = await createRoom(app.db, {
        creatorPlayerId: request.player!.id,
        creatorDisplayName: displayName,
        capacity,
        visibility,
        turnLimitHours,
      });
      reply.code(200).send({ roomId: room.id, code: room.code });
    },
  );

  app.post(
    "/api/rooms/join",
    {
      schema: { body: JoinRoomRequestSchema, response: { 200: JoinRoomResponseSchema } },
      preValidation: requireSession,
      config: { rateLimit: roomJoinLimit },
    },
    async (request, reply) => {
      const { code, displayName } = request.body;
      const playerId = request.player!.id;

      const room = await findRoomByCode(app.db, code);
      if (!room) {
        sendError(reply, "not_found", "no room with that code");
        return;
      }

      const existing = await findRoomMemberByRoomAndPlayer(app.db, room.id, playerId);
      if (existing) {
        reply.code(200).send({ roomId: room.id });
        return;
      }

      if (room.status !== "open") {
        sendError(reply, "conflict", "room is not open for joining");
        return;
      }
      const members = await listRoomMembers(app.db, room.id);
      if (members.length >= room.capacity) {
        sendError(reply, "conflict", "room is full");
        return;
      }

      try {
        await addRoomMember(app.db, room.id, playerId, displayName);
      } catch (err) {
        if (isUniqueViolation(err)) {
          sendError(reply, "conflict", "that display name is already taken in this room");
          return;
        }
        throw err;
      }
      await touchRoomActivity(app.db, room.id);
      reply.code(200).send({ roomId: room.id });
    },
  );

  app.get(
    "/api/rooms/public",
    {
      schema: { querystring: PublicRoomsQuerySchema, response: { 200: PublicRoomsResponseSchema } },
      preValidation: requireSession,
      config: { rateLimit: publicLobbyLimit },
    },
    async (request, reply) => {
      const { limit, offset } = request.query;
      const listings = await listPublicOpenRoomsWithMembers(app.db, limit, offset);
      reply.code(200).send({
        rooms: listings.map(({ room, memberDisplayNames }) => ({
          roomId: room.id,
          code: room.code,
          memberDisplayNames: [...memberDisplayNames],
          memberCount: memberDisplayNames.length,
          capacity: room.capacity,
          turnLimitHours: room.turn_limit_hours,
        })),
      });
    },
  );

  app.post(
    "/api/rooms/quick-join",
    {
      schema: { body: QuickJoinRequestSchema, response: { 200: QuickJoinResponseSchema } },
      preValidation: requireSession,
      config: { rateLimit: roomJoinLimit },
    },
    async (request, reply) => {
      const { displayName } = request.body;
      const playerId = request.player!.id;

      const room = await findQuickJoinableRoom(app.db, playerId);
      if (!room) {
        sendError(reply, "not_found", "no eligible public room to join");
        return;
      }

      try {
        await addRoomMember(app.db, room.id, playerId, displayName);
      } catch (err) {
        if (isUniqueViolation(err)) {
          sendError(reply, "conflict", "that display name is already taken in this room");
          return;
        }
        throw err;
      }
      await touchRoomActivity(app.db, room.id);
      reply.code(200).send({ roomId: room.id });
    },
  );

  app.post(
    "/api/rooms/:id/ready",
    {
      schema: { params: ParamsSchema, body: ReadyRequestSchema },
      preValidation: requireSession,
      config: { rateLimit: roomActionLimit },
    },
    async (request, reply) => {
      const roomId = request.params.id;
      const member = await requireRoomMember(request, reply, roomId);
      if (!member) return;
      await setRoomMemberReady(app.db, member.id, request.body.ready);
      await touchRoomActivity(app.db, roomId);
      reply.code(200).send({ ready: request.body.ready });
    },
  );

  app.post(
    "/api/rooms/:id/leave",
    {
      schema: { params: ParamsSchema, response: { 200: LeaveResponseSchema } },
      preValidation: requireSession,
      config: { rateLimit: roomActionLimit },
    },
    async (request, reply) => {
      const roomId = request.params.id;
      const room = await findRoomById(app.db, roomId);
      if (!room) {
        sendError(reply, "not_found", "no such room");
        return;
      }
      const member = await requireRoomMember(request, reply, roomId);
      if (!member) return;

      const newHostPlayerId = await app.db.transaction().execute(async (trx) => {
        await markRoomMemberLeft(trx, member.id);
        return succeedHostIfNeeded(trx, room, member.id);
      });

      const remaining = await listRoomMembers(app.db, roomId);
      if (remaining.length === 0) {
        await updateRoomStatus(app.db, roomId, "abandoned");
      } else {
        await touchRoomActivity(app.db, roomId);
      }

      reply.code(200).send({ newHostPlayerId });
    },
  );

  app.post(
    "/api/rooms/:id/start",
    {
      schema: { params: ParamsSchema, response: { 200: StartOrRematchResponseSchema } },
      preValidation: requireSession,
      config: { rateLimit: roomActionLimit },
    },
    async (request, reply) => {
      const roomId = request.params.id;
      const room = await findRoomById(app.db, roomId);
      if (!room) {
        sendError(reply, "not_found", "no such room");
        return;
      }
      const host = await requireRoomHost(request, reply, room);
      if (!host) return;

      if (room.status !== "open") {
        sendError(reply, "conflict", "room is not open");
        return;
      }
      const readyCount = (await listRoomMembers(app.db, roomId)).filter((m) => m.is_ready).length;
      if (readyCount < MIN_READY_TO_START) {
        sendError(reply, "conflict", `at least ${MIN_READY_TO_START} ready members are required`);
        return;
      }

      const gameId = await dealAndTransitionRoom(app, room, 1);
      reply.code(200).send({ gameId });
    },
  );

  app.post(
    "/api/rooms/:id/rematch",
    {
      schema: { params: ParamsSchema, response: { 200: StartOrRematchResponseSchema } },
      preValidation: requireSession,
      config: { rateLimit: roomActionLimit },
    },
    async (request, reply) => {
      const roomId = request.params.id;
      const room = await findRoomById(app.db, roomId);
      if (!room) {
        sendError(reply, "not_found", "no such room");
        return;
      }
      const host = await requireRoomHost(request, reply, room);
      if (!host) return;

      if (room.status !== "between_games") {
        sendError(reply, "conflict", "room is not between games");
        return;
      }
      const readyCount = (await listRoomMembers(app.db, roomId)).filter((m) => m.is_ready).length;
      if (readyCount < MIN_READY_TO_START) {
        sendError(reply, "conflict", `at least ${MIN_READY_TO_START} ready members are required`);
        return;
      }

      const latestGame = await findLatestGameForRoom(app.db, roomId);
      const nextSeq = (latestGame?.seq ?? 0) + 1;
      const gameId = await dealAndTransitionRoom(app, room, nextSeq);
      reply.code(200).send({ gameId });
    },
  );
}
