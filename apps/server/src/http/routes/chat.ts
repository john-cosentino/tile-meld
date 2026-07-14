import { z } from "zod";
import { ChatHistoryResponseSchema } from "@tile-meld/shared";
import type { AppInstance } from "../types.js";
import { requireSession } from "../auth.js";
import { sendError } from "../errors.js";
import { findGameSeatForPlayer, listGameSeatDisplayNames } from "../../db/repositories/games.js";
import { listChatMessages } from "../../db/repositories/chatMessages.js";
import { roomActionLimit } from "../rateLimits.js";

const ParamsSchema = z.object({ id: z.string() });

/** History for the game's chat panel on load/reconnect -- the live
 * chat:message socket event only covers messages sent while connected;
 * this is how a client gets everything that happened before it joined. */
export function registerChatRoutes(app: AppInstance): void {
  app.get(
    "/api/games/:id/chat",
    {
      schema: { params: ParamsSchema, response: { 200: ChatHistoryResponseSchema } },
      preValidation: requireSession,
      config: { rateLimit: roomActionLimit },
    },
    async (request, reply) => {
      const gameId = request.params.id;
      const playerId = request.player!.id;

      const seat = await findGameSeatForPlayer(app.db, gameId, playerId);
      if (!seat) {
        sendError(reply, "forbidden", "not a seat holder in this game");
        return;
      }

      const [messages, displayNames] = await Promise.all([
        listChatMessages(app.db, gameId),
        listGameSeatDisplayNames(app.db, gameId),
      ]);

      reply.code(200).send({
        messages: messages.map((m) => ({
          id: m.id,
          seatIndex: m.seat_index,
          senderDisplay: (m.seat_index !== null ? displayNames.get(m.seat_index) : undefined) ?? "",
          body: m.body,
          createdAt: m.created_at.toISOString(),
        })),
      });
    },
  );
}
