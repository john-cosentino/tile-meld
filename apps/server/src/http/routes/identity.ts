import {
  CreateIdentityResponseSchema,
  RecoverSessionRequestSchema,
  RecoverSessionResponseSchema,
  RotateRecoveryResponseSchema,
} from "@tile-meld/shared";
import type { AppInstance } from "../types.js";
import { sendError } from "../errors.js";
import { requireSession } from "../auth.js";
import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from "../../security/session.js";
import { generateRecoverySecret, verifyRecoverySecret } from "../../security/hashing.js";
import {
  createPlayer,
  findPlayerById,
  rotateRecoverySecret,
} from "../../db/repositories/players.js";
import { createSession } from "../../db/repositories/sessions.js";
import { identityCreateLimit, recoveryLimit } from "../rateLimits.js";

function setSessionCookie(
  reply: import("fastify").FastifyReply,
  token: string,
  secure: boolean,
): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function registerIdentityRoutes(app: AppInstance): void {
  app.post(
    "/api/identity",
    {
      schema: { response: { 200: CreateIdentityResponseSchema } },
      config: { rateLimit: identityCreateLimit },
    },
    async (request, reply) => {
      const recoverySecret = generateRecoverySecret();
      const player = await createPlayer(app.db, recoverySecret);
      const { token } = await createSession(
        app.db,
        player.id,
        app.env.SESSION_TOKEN_HMAC_SECRET,
        SESSION_TTL_MS,
      );
      setSessionCookie(reply, token, request.protocol === "https");
      return reply.code(200).send({ playerId: player.id, recoverySecret });
    },
  );

  app.post(
    "/api/session/recover",
    {
      schema: {
        body: RecoverSessionRequestSchema,
        response: { 200: RecoverSessionResponseSchema },
      },
      config: { rateLimit: recoveryLimit },
    },
    async (request, reply) => {
      const { playerId, recoverySecret } = request.body;
      const player = await findPlayerById(app.db, playerId);
      // A credential-less player (recovery_hash IS NULL -- i.e. the computer
      // opponent) can never be recovered/authenticated as: there is no secret
      // to verify. Treated identically to an unknown player.
      if (!player || player.recovery_hash === null) {
        sendError(reply, "unauthorized", "invalid recovery credentials");
        return;
      }
      const valid = await verifyRecoverySecret(player.recovery_hash, recoverySecret);
      if (!valid) {
        sendError(reply, "unauthorized", "invalid recovery credentials");
        return;
      }
      const { token } = await createSession(
        app.db,
        player.id,
        app.env.SESSION_TOKEN_HMAC_SECRET,
        SESSION_TTL_MS,
      );
      setSessionCookie(reply, token, request.protocol === "https");
      reply.code(200).send({ playerId: player.id });
    },
  );

  app.post(
    "/api/session/rotate-recovery",
    {
      schema: { response: { 200: RotateRecoveryResponseSchema } },
      preValidation: requireSession,
    },
    async (request, reply) => {
      const newSecret = generateRecoverySecret();
      await rotateRecoverySecret(app.db, request.player!.id, newSecret);
      reply.code(200).send({ recoverySecret: newSecret });
    },
  );
}
