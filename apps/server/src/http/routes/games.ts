import { NoResultError } from "kysely";
import { RedactedGameViewSchema, type RedactedGameView } from "@tile-meld/shared";
import { z } from "zod";
import type { AppInstance } from "../types.js";
import { requireSession } from "../auth.js";
import { sendError } from "../errors.js";
import { loadGameState, findGameSeatForPlayer } from "../../db/repositories/games.js";
import { redactGameFor } from "../../db/redact.js";
import { roomActionLimit } from "../rateLimits.js";

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
        loaded = await loadGameState(app.db, gameId);
      } catch (err) {
        if (err instanceof NoResultError) {
          sendError(reply, "not_found", "no such game");
          return;
        }
        throw err;
      }

      const redacted = redactGameFor(loaded, seat.seatIndex);
      // The engine/redaction layer deliberately returns `readonly` arrays
      // throughout (immutability discipline for state objects); Zod's
      // inferred type is mutable. Purely a compile-time distinction that
      // doesn't affect JSON serialization -- safe to assert here, at the
      // serialization boundary only.
      reply.code(200).send({
        ...redacted,
        gameId: loaded.gameId,
        version: loaded.version,
      } as RedactedGameView);
    },
  );
}
