import {
  canonicalizeUsername,
  ClaimUsernameRequestSchema,
  ClaimUsernameResponseSchema,
  CreateIdentityResponseSchema,
  isReservedUsername,
  RecoverSessionRequestSchema,
  RecoverSessionResponseSchema,
  RotateRecoveryResponseSchema,
} from "@tile-meld/shared";
import type { AppInstance } from "../types.js";
import { sendError } from "../errors.js";
import { requireSession } from "../auth.js";
import { SESSION_TTL_MS, setSessionCookie } from "../../security/session.js";
import { generateRecoverySecret, verifyRecoverySecret } from "../../security/hashing.js";
import {
  claimUsername,
  createPlayer,
  findPlayerById,
  rotateRecoverySecret,
} from "../../db/repositories/players.js";
import { createSession } from "../../db/repositories/sessions.js";
import { identityCreateLimit, recoveryLimit, usernameClaimLimit } from "../rateLimits.js";
import { isAccountsEnabled } from "../../env.js";

export function registerIdentityRoutes(app: AppInstance): void {
  app.post(
    "/api/identity",
    {
      schema: { response: { 200: CreateIdentityResponseSchema } },
      config: { rateLimit: identityCreateLimit },
    },
    async (request, reply) => {
      // Accounts-required cutover (accounts plan D1): guest identities can
      // no longer be minted; the client's /api/config check should have
      // routed the user to /register before ever calling this.
      if (isAccountsEnabled(app.env)) {
        sendError(reply, "forbidden", "accounts are required -- register instead");
        return;
      }
      const recoverySecret = generateRecoverySecret();
      const player = await createPlayer(app.db, recoverySecret);
      const { token } = await createSession(
        app.db,
        player.id,
        app.env.SESSION_TOKEN_HMAC_SECRET,
        SESSION_TTL_MS,
      );
      setSessionCookie(reply, token, request.protocol === "https");
      return reply
        .code(200)
        .send({ playerId: player.id, recoverySecret, username: player.username });
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
      reply.code(200).send({ playerId: player.id, username: player.username });
    },
  );

  app.post(
    "/api/session/rotate-recovery",
    {
      schema: { response: { 200: RotateRecoveryResponseSchema } },
      preValidation: requireSession,
      config: { rateLimit: recoveryLimit },
    },
    async (request, reply) => {
      // An upgraded account's credential is its password; minting a fresh
      // recovery secret for it would silently reopen the retired legacy
      // path (and violate one-credential-per-account, accounts plan D4).
      const player = await findPlayerById(app.db, request.player!.id);
      if (!player || player.password_hash !== null) {
        sendError(reply, "conflict", "this account uses a password, not a recovery code");
        return;
      }
      const newSecret = generateRecoverySecret();
      await rotateRecoverySecret(app.db, request.player!.id, newSecret);
      reply.code(200).send({ recoverySecret: newSecret });
    },
  );

  app.post(
    "/api/identity/username",
    {
      schema: {
        body: ClaimUsernameRequestSchema,
        response: { 200: ClaimUsernameResponseSchema },
      },
      preValidation: requireSession,
      config: { rateLimit: usernameClaimLimit },
    },
    async (request, reply) => {
      const canonical = canonicalizeUsername(request.body.username);
      if (isReservedUsername(canonical)) {
        sendError(reply, "invalid_request", "that username is reserved");
        return;
      }

      const outcome = await claimUsername(app.db, request.player!.id, request.body.username);

      if (outcome.kind === "claimed" || outcome.kind === "already_claimed_same") {
        reply.code(200).send({ username: outcome.player.username! });
        return;
      }
      if (outcome.kind === "already_claimed_different") {
        sendError(reply, "conflict", "this identity already has a username and cannot change it");
        return;
      }
      if (outcome.kind === "taken") {
        sendError(reply, "conflict", "that username is already taken");
        return;
      }
      // outcome.kind === "not_human"
      sendError(reply, "forbidden", "computer identities cannot claim a username");
    },
  );
}
