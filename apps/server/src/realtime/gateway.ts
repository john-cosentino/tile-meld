import { Server, type Socket } from "socket.io";
import {
  GameJoinPayloadSchema,
  TurnCommitPayloadSchema,
  TurnDrawPayloadSchema,
  TurnPassPayloadSchema,
  TurnResignPayloadSchema,
  ChatSendPayloadSchema,
} from "@tile-meld/shared";
import type { AppInstance } from "../http/types.js";
import { SESSION_COOKIE_NAME } from "../security/session.js";
import { findActiveSessionByToken } from "../db/repositories/sessions.js";
import { findGameSeatForPlayer } from "../db/repositories/games.js";
import { redactGameFor } from "../db/redact.js";
import { postChatMessage } from "../db/repositories/chatMessages.js";
import {
  ActionError,
  catchUpAndLoad,
  commitTurn,
  drawTurn,
  passTurn,
  resignTurn,
  type TurnActionResult,
} from "../game/turnActions.js";
import type { Warned } from "../game/deadlineSweep.js";
import { readCookie } from "./cookies.js";
import type { RealtimeServer } from "./types.js";

// Socket.IO gateway -- docs/opus-implementation-plan.md §7.3. All game-
// mutating logic lives in game/turnActions.ts; this module is purely
// transport: authenticate the handshake, validate payloads against the
// shared Zod schemas, delegate, and broadcast the (already redaction-safe)
// result to every socket subscribed to the game.

type Ack = (response: unknown) => void;

function gameRoom(gameId: string): string {
  return `game:${gameId}`;
}

function emitError(socket: Socket, code: string, message: string): void {
  socket.emit("error", { code, message });
}

/**
 * Broadcasts every side effect of a settled turn transition to the whole
 * game room -- used after a live commit/draw/pass/resign and after the
 * deadline sweep settles an overdue turn on its own. `game:patch` is safe
 * to send identically to every recipient: a TurnEvent never carries hidden
 * tile identities by construction (§6.3), so no per-socket redaction is
 * needed here the way it is for `game:state`.
 */
export function broadcastTurnActionResult(
  io: RealtimeServer,
  gameId: string,
  result: TurnActionResult,
): void {
  const room = gameRoom(gameId);
  io.to(room).emit("game:patch", {
    version: result.version,
    events: [result.event],
    changed: true,
  });

  if (result.event.type === "timed_out") {
    io.to(room).emit("turn:timeout", {
      seatIndex: result.event.seatIndex,
      penaltyDrawn: result.event.penaltyDrawn,
    });
  }

  if (result.gameEnd.ended) {
    io.to(room).emit("game:over", {
      winnerSeatIndex: result.gameEnd.winnerSeatIndex,
      scores: result.gameEnd.scores,
      roomCumulative: (result.roomCumulative ?? []).map((row) => ({
        playerId: row.player_id,
        cumulativeScore: row.cumulative_score,
        gamesPlayed: row.games_played,
        gamesWon: row.games_won,
      })),
    });
  } else if (result.nextTurn) {
    io.to(room).emit("turn:started", result.nextTurn);
  }
}

export function broadcastWarning(io: RealtimeServer, warned: Warned): void {
  io.to(gameRoom(warned.gameId)).emit("turn:warning", {
    seatIndex: warned.seatIndex,
    remainingMs: warned.remainingMs,
  });
}

async function handleAction(
  socket: Socket,
  io: RealtimeServer,
  gameId: string,
  run: () => Promise<TurnActionResult>,
  ack?: Ack,
): Promise<void> {
  try {
    const result = await run();
    broadcastTurnActionResult(io, gameId, result);
    ack?.({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ActionError) {
      emitError(socket, err.code, err.message);
      ack?.({ ok: false, code: err.code, message: err.message });
      return;
    }
    throw err;
  }
}

export function attachRealtimeGateway(app: AppInstance): RealtimeServer {
  const io: RealtimeServer = new Server(app.server, {
    cors: { origin: app.env.CORS_ORIGIN ?? false, credentials: true },
  });

  io.use((socket, next) => {
    void (async () => {
      const token = readCookie(socket.request.headers.cookie, SESSION_COOKIE_NAME);
      if (!token) return next(new Error("unauthorized"));
      const session = await findActiveSessionByToken(
        app.db,
        token,
        app.env.SESSION_TOKEN_HMAC_SECRET,
      );
      if (!session) return next(new Error("unauthorized"));
      socket.data.playerId = session.player_id;
      next();
    })();
  });

  io.on("connection", (socket) => {
    const playerId = socket.data.playerId;

    socket.on("game:join", (raw: unknown, ack?: Ack) => {
      void (async () => {
        const parsed = GameJoinPayloadSchema.safeParse(raw);
        if (!parsed.success) return emitError(socket, "invalid", "malformed game:join payload");
        const { gameId } = parsed.data;

        const seat = await findGameSeatForPlayer(app.db, gameId, playerId);
        if (!seat) return emitError(socket, "forbidden", "not a seat holder in this game");

        await socket.join(gameRoom(gameId));
        try {
          const loaded = await catchUpAndLoad(app, gameId);
          if (loaded.settled) broadcastTurnActionResult(io, gameId, loaded.settled);
          const redacted = redactGameFor(loaded, seat.seatIndex);
          const payload = { ...redacted, gameId: loaded.gameId, version: loaded.version };
          socket.emit("game:state", payload);
          ack?.({ ok: true, ...payload });
        } catch (err) {
          if (err instanceof ActionError) {
            emitError(socket, err.code, err.message);
            ack?.({ ok: false, code: err.code, message: err.message });
            return;
          }
          throw err;
        }
      })();
    });

    socket.on("turn:commit", (raw: unknown, ack?: Ack) => {
      void (async () => {
        const parsed = TurnCommitPayloadSchema.safeParse(raw);
        if (!parsed.success) return emitError(socket, "invalid", "malformed turn:commit payload");
        const { gameId, expectedVersion, turnId, arrangement, idempotencyKey } = parsed.data;
        await handleAction(
          socket,
          io,
          gameId,
          () =>
            commitTurn(app, {
              gameId,
              playerId,
              expectedVersion,
              turnId,
              arrangement,
              idempotencyKey,
            }),
          ack,
        );
      })();
    });

    socket.on("turn:draw", (raw: unknown, ack?: Ack) => {
      void (async () => {
        const parsed = TurnDrawPayloadSchema.safeParse(raw);
        if (!parsed.success) return emitError(socket, "invalid", "malformed turn:draw payload");
        const { gameId, expectedVersion, turnId, idempotencyKey } = parsed.data;
        await handleAction(
          socket,
          io,
          gameId,
          () => drawTurn(app, { gameId, playerId, expectedVersion, turnId, idempotencyKey }),
          ack,
        );
      })();
    });

    socket.on("turn:pass", (raw: unknown, ack?: Ack) => {
      void (async () => {
        const parsed = TurnPassPayloadSchema.safeParse(raw);
        if (!parsed.success) return emitError(socket, "invalid", "malformed turn:pass payload");
        const { gameId, expectedVersion, turnId, idempotencyKey } = parsed.data;
        await handleAction(
          socket,
          io,
          gameId,
          () => passTurn(app, { gameId, playerId, expectedVersion, turnId, idempotencyKey }),
          ack,
        );
      })();
    });

    socket.on("turn:resign", (raw: unknown, ack?: Ack) => {
      void (async () => {
        const parsed = TurnResignPayloadSchema.safeParse(raw);
        if (!parsed.success) return emitError(socket, "invalid", "malformed turn:resign payload");
        const { gameId, idempotencyKey } = parsed.data;
        await handleAction(
          socket,
          io,
          gameId,
          () => resignTurn(app, { gameId, playerId, idempotencyKey }),
          ack,
        );
      })();
    });

    socket.on("chat:send", (raw: unknown, ack?: Ack) => {
      void (async () => {
        const parsed = ChatSendPayloadSchema.safeParse(raw);
        if (!parsed.success) return emitError(socket, "invalid", "malformed chat:send payload");
        const { gameId, body } = parsed.data;

        const seat = await findGameSeatForPlayer(app.db, gameId, playerId);
        if (!seat) return emitError(socket, "forbidden", "not a seat holder in this game");

        // Any request or socket action that touches a game settles an
        // overdue deadline first (§8.1), chat included.
        const loaded = await catchUpAndLoad(app, gameId);
        if (loaded.settled) broadcastTurnActionResult(io, gameId, loaded.settled);
        if (loaded.status === "completed") {
          return emitError(socket, "conflict", "chat is read-only after the game has ended");
        }

        const message = await postChatMessage(app.db, gameId, seat.seatIndex, playerId, body);
        const displayName =
          loaded.seats.find((s) => s.seatIndex === seat.seatIndex)?.displayName ?? "";
        io.to(gameRoom(gameId)).emit("chat:message", {
          seatIndex: seat.seatIndex,
          senderDisplay: displayName,
          body: message.body,
          createdAt: message.created_at.toISOString(),
        });
        ack?.({ ok: true });
      })();
    });

    // Clients always emit(event, payload, ack) even when payload is
    // undefined -- accept and ignore the leading arg rather than assuming
    // ack is the first parameter.
    socket.on("presence:ping", (_raw: unknown, ack?: Ack) => {
      ack?.({ ok: true, at: new Date().toISOString() });
    });
  });

  return io;
}
