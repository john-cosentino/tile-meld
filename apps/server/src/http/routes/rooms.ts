import { randomInt } from "node:crypto";
import { z } from "zod";
import {
  CreateRoomRequestSchema,
  CreateRoomResponseSchema,
  GetRoomResponseSchema,
  JoinRoomByNameRequestSchema,
  JoinRoomRequestSchema,
  JoinRoomResponseSchema,
  LeaveResponseSchema,
  PublicRoomsQuerySchema,
  PublicRoomsResponseSchema,
  QuickJoinRequestSchema,
  QuickJoinResponseSchema,
  ReadyRequestSchema,
  ReadyResponseSchema,
  StartOrRematchResponseSchema,
  VsComputerRequestSchema,
  VsComputerResponseSchema,
} from "@tile-meld/shared";
import type { AppInstance } from "../types.js";
import { requireSession, requireRoomHost, requireRoomMember } from "../auth.js";
import { sendError } from "../errors.js";
import { isComputerOpponentEnabled } from "../../env.js";
import {
  createComputerRoom,
  createRoom,
  findRoomByCode,
  findRoomByName,
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
  findRoomMemberById,
  listRoomMembers,
  markRoomMemberLeft,
  resetReadiness,
  setRoomMemberReady,
} from "../../db/repositories/roomMembers.js";
import { findPlayerById } from "../../db/repositories/players.js";
import { dealNewGame, findLatestGameForRoom } from "../../db/repositories/games.js";
import { lockRoomForUpdate } from "../../db/transactions.js";
import {
  publicLobbyLimit,
  roomActionLimit,
  roomCreateLimit,
  roomJoinLimit,
  vsComputerCreateLimit,
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
    .map((m) => ({
      roomMemberId: m.id,
      playerId: m.player_id,
      displayName: m.display_name,
      controllerType: m.controller_type,
    }));

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
      const creator = await findPlayerById(app.db, request.player!.id);
      if (!creator?.username) {
        sendError(reply, "username_required", "claim a username before creating a room");
        return;
      }
      // displayName remains in the wire schema for backward compatibility
      // but is never trusted as the host's display name -- the claimed
      // username is authoritative (docs plan Phase 2).
      const { capacity, visibility, turnLimitHours } = request.body;
      const { room } = await createRoom(app.db, {
        creatorPlayerId: request.player!.id,
        creatorUsername: creator.username,
        capacity,
        visibility,
        turnLimitHours,
      });
      reply.code(200).send({ roomId: room.id, code: room.code, name: room.name });
    },
  );

  app.post(
    "/api/rooms/vs-computer",
    {
      schema: { body: VsComputerRequestSchema, response: { 200: VsComputerResponseSchema } },
      preValidation: requireSession,
      config: { rateLimit: vsComputerCreateLimit },
    },
    async (request, reply) => {
      // Operational kill switch. Disabled looks like the endpoint isn't there
      // (404) rather than advertising a turned-off feature.
      if (!isComputerOpponentEnabled(app.env)) {
        sendError(reply, "not_found", "Play vs Computer is not available");
        return;
      }
      const creator = await findPlayerById(app.db, request.player!.id);
      if (!creator?.username) {
        sendError(reply, "username_required", "claim a username before creating a room");
        return;
      }
      const { room } = await createComputerRoom(app.db, {
        humanPlayerId: request.player!.id,
        humanUsername: creator.username,
      });
      reply.code(200).send({ roomId: room.id, code: room.code, name: room.name });
    },
  );

  // Legacy/compatibility join path (Phase 3: docs/next-changes-
  // implementation-plan.md, corrected DR-8). The normal web UI now uses
  // POST /api/rooms/join-by-name below; this code-based route is preserved
  // unchanged for backward compatibility, rollback, existing deep links,
  // older clients, and troubleshooting -- room codes remain authoritative
  // internal identifiers and a fallback credential, just no longer the
  // primary join UI's join key.
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

      // A Play-vs-Computer room is private to its single human. No one else may
      // join it, even with the code. (It is also already full and excluded
      // from lobby/quick-join by its private visibility.)
      if (room.has_computer) {
        sendError(reply, "conflict", "this room cannot be joined");
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

  // The normal join path (Phase 3, corrected DR-8): exact-name lookup for
  // BOTH public and private rooms -- no code required, no free-text display
  // name. Private rooms are unlisted (excluded from the lobby/search/
  // autocomplete) but joinable by anyone who knows the exact name; this
  // route never distinguishes "no such room" from "found but private" --
  // both a nonexistent name and a resolvable-but-unjoinable room (full,
  // not open, or computer-controlled) return the SAME outward response, to
  // limit what a guessed name can reveal about an unlisted room.
  app.post(
    "/api/rooms/join-by-name",
    {
      schema: { body: JoinRoomByNameRequestSchema, response: { 200: JoinRoomResponseSchema } },
      preValidation: requireSession,
      config: { rateLimit: roomJoinLimit },
    },
    async (request, reply) => {
      const playerId = request.player!.id;
      const joiner = await findPlayerById(app.db, playerId);
      if (!joiner?.username) {
        sendError(reply, "username_required", "claim a username before joining a room");
        return;
      }

      const unavailable = (): void => {
        sendError(reply, "not_found", "no room with that name is available to join");
      };

      const room = await findRoomByName(app.db, request.body.name);
      if (!room) {
        unavailable();
        return;
      }

      const existing = await findRoomMemberByRoomAndPlayer(app.db, room.id, playerId);
      if (existing) {
        reply.code(200).send({ roomId: room.id });
        return;
      }

      // A Play-vs-Computer room is private to its single human -- no one
      // else may join it (mirrors the code-based route above).
      if (room.has_computer) {
        unavailable();
        return;
      }

      // Recheck status + capacity under a room-row lock so two concurrent
      // joins racing for the last seat can't both succeed (the code-based
      // route above has no such lock -- this is a new endpoint, not a
      // change to that one).
      let outcome: "joined" | "unavailable";
      try {
        outcome = await app.db.transaction().execute(async (trx) => {
          const locked = await lockRoomForUpdate(trx, room.id);
          if (locked.status !== "open") return "unavailable";
          const members = await listRoomMembers(trx, locked.id);
          if (members.length >= locked.capacity) return "unavailable";
          await addRoomMember(trx, locked.id, playerId, joiner.username!);
          return "joined";
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          sendError(reply, "conflict", "that display name is already taken in this room");
          return;
        }
        throw err;
      }

      if (outcome === "unavailable") {
        unavailable();
        return;
      }

      await touchRoomActivity(app.db, room.id);
      reply.code(200).send({ roomId: room.id });
    },
  );

  app.get(
    "/api/rooms/:id",
    {
      schema: { params: ParamsSchema, response: { 200: GetRoomResponseSchema } },
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

      const [members, hostMember, latestGame] = await Promise.all([
        listRoomMembers(app.db, roomId),
        room.host_room_member_id ? findRoomMemberById(app.db, room.host_room_member_id) : undefined,
        findLatestGameForRoom(app.db, roomId),
      ]);

      reply.code(200).send({
        roomId: room.id,
        code: room.code,
        name: room.name,
        visibility: room.visibility,
        capacity: room.capacity,
        turnLimitHours: room.turn_limit_hours,
        status: room.status,
        hostPlayerId: hostMember?.player_id ?? null,
        members: members.map((m) => ({
          playerId: m.player_id,
          displayName: m.display_name,
          isReady: m.is_ready,
          isComputer: m.controller_type === "computer",
        })),
        latestGameId: latestGame?.id ?? null,
      });
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
          name: room.name,
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
      const playerId = request.player!.id;
      // displayName remains in the wire schema for backward compatibility
      // but is never trusted as the joiner's display name -- the claimed
      // username is authoritative, same as every other join path (Phase 3).
      const joiner = await findPlayerById(app.db, playerId);
      if (!joiner?.username) {
        sendError(reply, "username_required", "claim a username before joining a room");
        return;
      }

      const room = await findQuickJoinableRoom(app.db, playerId);
      if (!room) {
        sendError(reply, "not_found", "no eligible public room to join");
        return;
      }

      try {
        await addRoomMember(app.db, room.id, playerId, joiner.username);
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
      schema: {
        params: ParamsSchema,
        body: ReadyRequestSchema,
        response: { 200: ReadyResponseSchema },
      },
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
