import {
  AuthSessionResponseSchema,
  ChangePasswordRequestSchema,
  ConfigResponseSchema,
  LoginRequestSchema,
  MeResponseSchema,
  RegisterRequestSchema,
  ResetConfirmRequestSchema,
  ResetRequestRequestSchema,
  ResetRequestResponseSchema,
  SetPortraitRequestSchema,
  UpgradeAccountRequestSchema,
  canonicalizeUsername,
  isReservedUsername,
} from "@tile-meld/shared";
import type { FastifyReply } from "fastify";
import type { AppInstance } from "../types.js";
import { sendError } from "../errors.js";
import { requireSession } from "../auth.js";
import { SESSION_TTL_MS, clearSessionCookie, setSessionCookie } from "../../security/session.js";
import { hashPassword, verifyPassword } from "../../security/hashing.js";
import {
  createAccount,
  findPlayerByCanonicalUsername,
  findPlayerById,
  setPassword,
  setPortrait,
  upgradeLegacyAccount,
  type PlayerRow,
} from "../../db/repositories/players.js";
import {
  createSession,
  revokeAllSessionsForPlayer,
  revokeSession,
} from "../../db/repositories/sessions.js";
import { consumeResetToken, createResetToken } from "../../db/repositories/passwordResetTokens.js";
import { appBaseUrl } from "../../email/mailer.js";
import { isAccountsEnabled } from "../../env.js";
import {
  accountMutationLimit,
  loginLimit,
  publicLobbyLimit,
  registerLimit,
  resetConfirmLimit,
  resetRequestLimit,
} from "../rateLimits.js";

/** Flattens the unknown-username timing side channel on login: verifying a
 * wrong password and "verifying" against this throwaway hash cost the
 * same. Computed once, lazily, so module import stays cheap. */
let dummyHashPromise: Promise<string> | undefined;
async function dummyVerify(password: string): Promise<void> {
  dummyHashPromise ??= hashPassword("dummy-timing-equalizer-never-a-real-credential");
  await verifyPassword(await dummyHashPromise, password);
}

export function registerAccountRoutes(app: AppInstance): void {
  async function startSession(reply: FastifyReply, player: PlayerRow, secure: boolean) {
    const { token } = await createSession(
      app.db,
      player.id,
      app.env.SESSION_TOKEN_HMAC_SECRET,
      SESSION_TTL_MS,
    );
    setSessionCookie(reply, token, secure);
    return { playerId: player.id, username: player.username, portraitId: player.portrait_id };
  }

  app.get(
    "/api/config",
    {
      schema: { response: { 200: ConfigResponseSchema } },
      config: { rateLimit: publicLobbyLimit },
    },
    async (_request, reply) => {
      reply.code(200).send({ accountsRequired: isAccountsEnabled(app.env) });
    },
  );

  app.post(
    "/api/account/register",
    {
      schema: { body: RegisterRequestSchema, response: { 200: AuthSessionResponseSchema } },
      config: { rateLimit: registerLimit },
    },
    async (request, reply) => {
      const { username, email, password } = request.body;
      if (isReservedUsername(canonicalizeUsername(username))) {
        sendError(reply, "invalid_request", "that username is reserved");
        return;
      }
      const outcome = await createAccount(app.db, {
        username,
        email,
        passwordHash: await hashPassword(password),
      });
      if (outcome.kind === "taken") {
        sendError(reply, "conflict", "that username is already taken");
        return;
      }
      reply.code(200).send(await startSession(reply, outcome.player, request.protocol === "https"));
    },
  );

  app.post(
    "/api/account/login",
    {
      schema: { body: LoginRequestSchema, response: { 200: AuthSessionResponseSchema } },
      config: { rateLimit: loginLimit },
    },
    async (request, reply) => {
      const { username, password } = request.body;
      const player = await findPlayerByCanonicalUsername(app.db, canonicalizeUsername(username));
      // One generic failure for unknown username, passwordless (legacy or
      // computer) identity, and wrong password alike -- no oracle beyond
      // what register's "taken" already reveals.
      if (!player || player.password_hash === null) {
        await dummyVerify(password);
        sendError(reply, "unauthorized", "invalid username or password");
        return;
      }
      if (!(await verifyPassword(player.password_hash, password))) {
        sendError(reply, "unauthorized", "invalid username or password");
        return;
      }
      reply.code(200).send(await startSession(reply, player, request.protocol === "https"));
    },
  );

  app.post(
    "/api/account/logout",
    {
      preValidation: requireSession,
      config: { rateLimit: accountMutationLimit },
    },
    async (request, reply) => {
      await revokeSession(app.db, request.session!.id);
      clearSessionCookie(reply);
      reply.code(204).send();
    },
  );

  app.get(
    "/api/identity/me",
    {
      schema: { response: { 200: MeResponseSchema } },
      preValidation: requireSession,
    },
    async (request, reply) => {
      const player = await findPlayerById(app.db, request.player!.id);
      if (!player) {
        sendError(reply, "unauthorized", "invalid or expired session");
        return;
      }
      reply.code(200).send({
        playerId: player.id,
        username: player.username,
        email: player.email,
        portraitId: player.portrait_id,
        hasPassword: player.password_hash !== null,
      });
    },
  );

  app.post(
    "/api/account/password",
    {
      schema: { body: ChangePasswordRequestSchema, response: { 200: AuthSessionResponseSchema } },
      preValidation: requireSession,
      config: { rateLimit: accountMutationLimit },
    },
    async (request, reply) => {
      const player = await findPlayerById(app.db, request.player!.id);
      if (!player || player.password_hash === null) {
        sendError(reply, "conflict", "this identity has no password yet -- finish account setup");
        return;
      }
      if (!(await verifyPassword(player.password_hash, request.body.currentPassword))) {
        sendError(reply, "unauthorized", "current password is incorrect");
        return;
      }
      const updated = await setPassword(
        app.db,
        player.id,
        await hashPassword(request.body.newPassword),
      );
      // "Change password" implies "sign out anywhere else this account is
      // logged in" -- revoke everything, then reissue this browser's
      // session so the caller stays signed in.
      await revokeAllSessionsForPlayer(app.db, player.id);
      reply.code(200).send(await startSession(reply, updated, request.protocol === "https"));
    },
  );

  app.post(
    "/api/account/reset/request",
    {
      schema: { body: ResetRequestRequestSchema, response: { 200: ResetRequestResponseSchema } },
      config: { rateLimit: resetRequestLimit },
    },
    async (request, reply) => {
      const player = await findPlayerByCanonicalUsername(
        app.db,
        canonicalizeUsername(request.body.username),
      );
      // The response is committed before any lookup: always {ok:true},
      // whether or not the account exists, has an email, or has a
      // password. Only the email itself (or its absence) differs.
      if (player && player.email !== null && player.password_hash !== null) {
        const { token } = await createResetToken(
          app.db,
          player.id,
          app.env.SESSION_TOKEN_HMAC_SECRET,
        );
        const resetUrl = `${appBaseUrl(app.env)}/reset/confirm?token=${encodeURIComponent(token)}`;
        await app.mailer.sendPasswordResetEmail({ to: player.email, resetUrl });
      }
      reply.code(200).send({ ok: true });
    },
  );

  app.post(
    "/api/account/reset/confirm",
    {
      schema: { body: ResetConfirmRequestSchema, response: { 200: AuthSessionResponseSchema } },
      config: { rateLimit: resetConfirmLimit },
    },
    async (request, reply) => {
      const playerId = await consumeResetToken(
        app.db,
        request.body.token,
        app.env.SESSION_TOKEN_HMAC_SECRET,
      );
      if (!playerId) {
        sendError(reply, "unauthorized", "invalid or expired reset link");
        return;
      }
      const updated = await setPassword(
        app.db,
        playerId,
        await hashPassword(request.body.newPassword),
      );
      // The token proved control of the account's email; sign the user in
      // fresh and cut off any session an attacker (or old device) held.
      await revokeAllSessionsForPlayer(app.db, playerId);
      reply.code(200).send(await startSession(reply, updated, request.protocol === "https"));
    },
  );

  app.post(
    "/api/account/upgrade",
    {
      schema: { body: UpgradeAccountRequestSchema, response: { 200: AuthSessionResponseSchema } },
      preValidation: requireSession,
      config: { rateLimit: accountMutationLimit },
    },
    async (request, reply) => {
      const outcome = await upgradeLegacyAccount(app.db, request.player!.id, {
        email: request.body.email,
        passwordHash: await hashPassword(request.body.password),
      });
      if (outcome.kind === "already_upgraded") {
        sendError(reply, "conflict", "this account already has a password");
        return;
      }
      if (outcome.kind === "not_eligible") {
        sendError(reply, "forbidden", "this identity cannot be upgraded");
        return;
      }
      // The recovery code that authenticated this session is now retired;
      // any other session it minted goes with it, and this browser gets a
      // fresh password-era session.
      await revokeAllSessionsForPlayer(app.db, outcome.player.id);
      reply.code(200).send(await startSession(reply, outcome.player, request.protocol === "https"));
    },
  );

  app.post(
    "/api/account/portrait",
    {
      schema: { body: SetPortraitRequestSchema, response: { 200: SetPortraitRequestSchema } },
      preValidation: requireSession,
      config: { rateLimit: accountMutationLimit },
    },
    async (request, reply) => {
      try {
        const updated = await setPortrait(app.db, request.player!.id, request.body.portraitId);
        reply.code(200).send({ portraitId: updated.portrait_id });
      } catch {
        // The guarded UPDATE matches only kind='human' rows; a session can
        // never belong to the computer player, so this is defensive.
        sendError(reply, "forbidden", "this identity cannot set a portrait");
      }
    },
  );
}
