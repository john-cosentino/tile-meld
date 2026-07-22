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
import {
  findGameSeatForPlayer,
  listGameSeatControllers,
  listGameSeatPlayerIds,
} from "../db/repositories/games.js";
import { buildWireGameView } from "../db/redact.js";
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
import { runBotTurn } from "../game/botTurn.js";
import { DEFAULT_BOT_TURN_DELAY_MS } from "../env.js";
import type { Warned } from "../game/deadlineSweep.js";
import { sendPushToPlayer } from "../push/pushSender.js";
import { readCookie } from "./cookies.js";
import { createRateLimiter } from "./rateLimit.js";
import type { RealtimeServer } from "./types.js";

const CHAT_RATE_LIMIT_MAX = 10;
const CHAT_RATE_LIMIT_WINDOW_MS = 10_000;

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
 *
 * Also fires true-background push notifications (§8.4) for the exact 4
 * triggers the plan specifies -- turn started, timed out, game over (the
 * 15-min warning is `broadcastWarning`, below). Push is fire-and-forget:
 * socket broadcasts to *connected* clients must never wait on a push
 * provider round trip, and `sendPushToPlayer` already never throws.
 */
export function broadcastTurnActionResult(
  app: AppInstance,
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

  void notifyPushForTransition(app, gameId, result).catch((err: unknown) => {
    app.log.error(err, "push notify failed for turn transition");
  });

  // Fast-path computer-opponent trigger (docs plan §7): when a transition hands
  // the turn to a computer seat, schedule the bot to act after the ~1s UX
  // delay. This is ONLY a latency optimization -- if the timer is lost (e.g. a
  // process restart) the durable recovery sweep picks the turn up regardless.
  if (result.nextTurn) {
    void maybeScheduleBotTurn(app, io, gameId, result.nextTurn.seatIndex).catch((err: unknown) => {
      app.log.error(err, "failed to schedule computer-opponent turn");
    });
  }
}

async function maybeScheduleBotTurn(
  app: AppInstance,
  io: RealtimeServer,
  gameId: string,
  nextSeatIndex: number,
): Promise<void> {
  const controllers = await listGameSeatControllers(app.db, gameId);
  if (controllers.get(nextSeatIndex) !== "computer") return;

  const delayMs = app.env.BOT_TURN_DELAY_MS ?? DEFAULT_BOT_TURN_DELAY_MS;
  const timer = setTimeout(() => {
    runBotTurn(app, gameId, "scheduled")
      .then((outcome) => {
        // Broadcasting the bot's result hands the turn back to the human; that
        // seat is not a computer, so this does not recurse into another
        // schedule. A stale/duplicate attempt is a no-op and broadcasts
        // nothing.
        if (outcome.kind === "acted") broadcastTurnActionResult(app, io, gameId, outcome.result);
      })
      .catch((err: unknown) => app.log.error(err, "scheduled computer-opponent turn failed"));
  }, delayMs);
  // Never keep the process alive for a pending bot delay; recovery covers a
  // dropped timer.
  timer.unref();
}

async function notifyPushForTransition(
  app: AppInstance,
  gameId: string,
  result: TurnActionResult,
): Promise<void> {
  const seatPlayerIds = await listGameSeatPlayerIds(app.db, gameId);

  if (result.event.type === "timed_out") {
    const playerId = seatPlayerIds.get(result.event.seatIndex);
    if (playerId) {
      await sendPushToPlayer(app, playerId, {
        title: "Turn timed out",
        body: "You were timed out and drew penalty tiles.",
        gameId,
        tag: `timeout:${gameId}`,
      });
    }
  }

  if (result.gameEnd.ended) {
    await Promise.all(
      [...seatPlayerIds.values()].map((playerId) =>
        sendPushToPlayer(app, playerId, {
          title: "Game over",
          body: "A game you're in has ended.",
          gameId,
          tag: `game-over:${gameId}`,
        }),
      ),
    );
  } else if (result.nextTurn) {
    const playerId = seatPlayerIds.get(result.nextTurn.seatIndex);
    if (playerId) {
      await sendPushToPlayer(app, playerId, {
        title: "Your turn!",
        body: "It's your turn in Tile Meld.",
        gameId,
        tag: `turn:${gameId}`,
      });
    }
  }
}

export function broadcastWarning(app: AppInstance, io: RealtimeServer, warned: Warned): void {
  io.to(gameRoom(warned.gameId)).emit("turn:warning", {
    seatIndex: warned.seatIndex,
    remainingMs: warned.remainingMs,
  });

  void notifyPushForWarning(app, warned).catch((err: unknown) => {
    app.log.error(err, "push notify failed for turn warning");
  });
}

async function notifyPushForWarning(app: AppInstance, warned: Warned): Promise<void> {
  const seatPlayerIds = await listGameSeatPlayerIds(app.db, warned.gameId);
  const playerId = seatPlayerIds.get(warned.seatIndex);
  if (!playerId) return;
  await sendPushToPlayer(app, playerId, {
    title: "15 minutes left",
    body: "Your turn in Tile Meld ends soon.",
    gameId: warned.gameId,
    tag: `warning:${warned.gameId}`,
  });
}

async function handleAction(
  app: AppInstance,
  socket: Socket,
  io: RealtimeServer,
  gameId: string,
  run: () => Promise<TurnActionResult>,
  ack?: Ack,
): Promise<void> {
  try {
    const result = await run();
    broadcastTurnActionResult(app, io, gameId, result);
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
  const chatRateLimiter = createRateLimiter(CHAT_RATE_LIMIT_MAX, CHAT_RATE_LIMIT_WINDOW_MS);

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
        if (!parsed.success) {
          emitError(socket, "invalid", "malformed game:join payload");
          ack?.({ ok: false, code: "invalid", message: "malformed game:join payload" });
          return;
        }
        const { gameId } = parsed.data;

        // Phase 7: this is also the path a retention-purged game takes --
        // its game_seats rows are gone, indistinguishable here from a
        // gameId that never existed. Must ack (not just emitError) or the
        // client's game:join promise/callback never resolves, leaving
        // useGame.ts stuck on "Loading table…" forever instead of showing
        // its graceful "this game doesn't exist, or you're not seated in
        // it" state -- exactly the endless-spinner failure mode Phase 7
        // requires never happen for a purged game.
        const seat = await findGameSeatForPlayer(app.db, gameId, playerId);
        if (!seat) {
          emitError(socket, "forbidden", "not a seat holder in this game");
          ack?.({ ok: false, code: "forbidden", message: "not a seat holder in this game" });
          return;
        }

        await socket.join(gameRoom(gameId));
        try {
          const loaded = await catchUpAndLoad(app, gameId);
          if (loaded.settled) broadcastTurnActionResult(app, io, gameId, loaded.settled);
          const payload = buildWireGameView(loaded, seat.seatIndex);
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
          app,
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
          app,
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
          app,
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
          app,
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

        if (!chatRateLimiter.tryConsume(playerId)) {
          return emitError(socket, "rate_limited", "sending messages too quickly -- slow down");
        }

        const seat = await findGameSeatForPlayer(app.db, gameId, playerId);
        if (!seat) return emitError(socket, "forbidden", "not a seat holder in this game");

        // Any request or socket action that touches a game settles an
        // overdue deadline first (§8.1), chat included.
        const loaded = await catchUpAndLoad(app, gameId);
        if (loaded.settled) broadcastTurnActionResult(app, io, gameId, loaded.settled);
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
