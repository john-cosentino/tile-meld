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
} from "../../db/repositories/rooms.js";
import {
  findRoomMemberByRoomAndPlayer,
  findRoomMemberById,
  listRoomMembers,
  markRoomMemberLeft,
  setRoomMemberReady,
} from "../../db/repositories/roomMembers.js";
import { findPlayerById } from "../../db/repositories/players.js";
import { findLatestGameForRoom } from "../../db/repositories/games.js";
import {
  joinRoomAndMaybeAutoStart,
  manualRematchRoom,
  manualStartRoom,
  MIN_READY_TO_START,
} from "../../game/roomStart.js";
import {
  publicLobbyLimit,
  roomActionLimit,
  roomCreateLimit,
  roomJoinLimit,
  vsComputerCreateLimit,
} from "../rateLimits.js";

const ParamsSchema = z.object({ id: z.string() });

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

      // Phase 4: the same authoritative, room-locked transaction every join
      // path uses -- see game/roomStart.ts. Distinct error messages are
      // preserved here (unlike join-by-name's uniform failure) since a
      // room code isn't a privacy-sensitive lookup key the way a name is.
      const outcome = await joinRoomAndMaybeAutoStart(app.db, room.id, playerId, displayName);
      switch (outcome.kind) {
        case "computer_room":
          // A Play-vs-Computer room is private to its single human. No one
          // else may join it, even with the code. (It is also already full
          // and excluded from lobby/quick-join by its private visibility.)
          sendError(reply, "conflict", "this room cannot be joined");
          return;
        case "not_open":
          sendError(reply, "conflict", "room is not open for joining");
          return;
        case "full":
          sendError(reply, "conflict", "room is full");
          return;
        case "display_name_taken":
          sendError(reply, "conflict", "that display name is already taken in this room");
          return;
        case "joined":
          await touchRoomActivity(app.db, room.id);
          reply.code(200).send({ roomId: room.id });
          return;
      }
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

      // Phase 4: the same authoritative, room-locked transaction every join
      // path uses -- see game/roomStart.ts. Every non-"joined" outcome
      // (computer_room, not_open, full) collapses to the SAME generic
      // "unavailable" response here, preserving the uniform-failure privacy
      // design from Phase 3 -- a guessed private-room name must never be
      // distinguishable from a nonexistent one by its response.
      const outcome = await joinRoomAndMaybeAutoStart(app.db, room.id, playerId, joiner.username);
      if (outcome.kind === "display_name_taken") {
        sendError(reply, "conflict", "that display name is already taken in this room");
        return;
      }
      if (outcome.kind !== "joined") {
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

      // Phase 4: the same authoritative, room-locked transaction every join
      // path uses -- see game/roomStart.ts. findQuickJoinableRoom's own
      // read is unlocked, so a race since that read (the room filled or
      // closed a moment ago) is possible but rare; any non-"joined" outcome
      // here reuses the same "no eligible room" message the caller already
      // gets when nothing was found in the first place.
      const outcome = await joinRoomAndMaybeAutoStart(app.db, room.id, playerId, joiner.username);
      if (outcome.kind === "display_name_taken") {
        sendError(reply, "conflict", "that display name is already taken in this room");
        return;
      }
      if (outcome.kind !== "joined") {
        sendError(reply, "not_found", "no eligible public room to join");
        return;
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

      // Phase 4: locks the room row and rechecks status/readiness under
      // that lock -- host authorization above needs no lock (unchanged),
      // but the actual deal decision now races safely against a concurrent
      // capacity auto-start from the join path (see game/roomStart.ts).
      const outcome = await manualStartRoom(app.db, roomId);
      switch (outcome.kind) {
        case "not_open":
          sendError(reply, "conflict", "room is not open");
          return;
        case "insufficient_ready":
          sendError(reply, "conflict", `at least ${MIN_READY_TO_START} ready members are required`);
          return;
        case "started":
          reply.code(200).send({ gameId: outcome.gameId });
          return;
      }
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

      // Phase 4: same locking discipline as manual Start above, applied to
      // rematch too -- business rules (status='between_games', ready-based,
      // host-only, next seq) are unchanged from before this phase.
      const outcome = await manualRematchRoom(app.db, roomId);
      switch (outcome.kind) {
        case "not_between_games":
          sendError(reply, "conflict", "room is not between games");
          return;
        case "insufficient_ready":
          sendError(reply, "conflict", `at least ${MIN_READY_TO_START} ready members are required`);
          return;
        case "started":
          reply.code(200).send({ gameId: outcome.gameId });
          return;
      }
    },
  );
}
