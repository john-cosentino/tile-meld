import { RedactedGameViewSchema } from "@tile-meld/shared";
import { z } from "zod";
import type { AppInstance } from "../types.js";
import { requireSession } from "../auth.js";
import { sendError, type ErrorCode } from "../errors.js";
import { findGameSeatForPlayer } from "../../db/repositories/games.js";
import { buildWireGameView } from "../../db/redact.js";
import { roomActionLimit } from "../rateLimits.js";
import { ActionError, catchUpAndLoad } from "../../game/turnActions.js";
import { broadcastTurnActionResult } from "../../realtime/gateway.js";

// ActionError's socket-oriented codes map onto this route's HTTP error
// vocabulary; "stale" and "invalid" don't arise for a GET (nothing to be
// stale/invalid about), but are mapped defensively rather than assumed
// unreachable.
const ACTION_ERROR_STATUS: Record<ActionError["code"], ErrorCode> = {
  not_found: "not_found",
  forbidden: "forbidden",
  conflict: "conflict",
  stale: "conflict",
  invalid: "invalid_request",
};

const ParamsSchema = z.object({ id: z.string() });

export function registerGameRoutes(app: AppInstance): void {
  app.get(
    "/api/games/:id",
    {
      schema: { params: ParamsSchema, response: { 200: RedactedGameViewSchema } },
      preValidation: requireSession,
      config: { rateLimit: roomActionLimit },
    },
    async (request, reply) => {
      const gameId = request.params.id;
      const playerId = request.player!.id;

      // Authorization: game_seats are immutable historical records, so
      // this still resolves after the seat's room membership has lapsed
      // or the game has completed -- see docs/opus-implementation-plan.md
      // D-MEMBERSHIP.
      const seat = await findGameSeatForPlayer(app.db, gameId, playerId);
      if (!seat) {
        sendError(reply, "forbidden", "not a seat holder in this game");
        return;
      }

      let loaded;
      try {
        // Any request that touches a game settles an overdue deadline
        // first (docs/opus-implementation-plan.md §8.1 on-read catch-up).
        loaded = await catchUpAndLoad(app, gameId);
      } catch (err) {
        if (err instanceof ActionError) {
          sendError(reply, ACTION_ERROR_STATUS[err.code], err.message);
          return;
        }
        throw err;
      }
      if (loaded.settled) broadcastTurnActionResult(app, app.io, gameId, loaded.settled);

      reply.code(200).send(buildWireGameView(loaded, seat.seatIndex));
    },
  );
}
