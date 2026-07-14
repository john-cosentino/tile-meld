import {
  PushSubscribeRequestSchema,
  PushUnsubscribeRequestSchema,
  VapidPublicKeyResponseSchema,
} from "@tile-meld/shared";
import type { AppInstance } from "../types.js";
import { requireSession } from "../auth.js";
import {
  upsertPushSubscription,
  removePushSubscriptionForPlayer,
} from "../../db/repositories/pushSubscriptions.js";
import { roomActionLimit } from "../rateLimits.js";

export function registerPushRoutes(app: AppInstance): void {
  // Public: the VAPID public key is not a secret (it's handed to every
  // subscribing browser as part of the Push API's applicationServerKey),
  // and a client needs it before it can even offer "enable notifications".
  app.get(
    "/api/push/vapid-public-key",
    { schema: { response: { 200: VapidPublicKeyResponseSchema } } },
    async (_request, reply) => {
      reply.code(200).send({ publicKey: app.env.VAPID_PUBLIC_KEY ?? null });
    },
  );

  app.post(
    "/api/push/subscribe",
    {
      schema: { body: PushSubscribeRequestSchema },
      preValidation: requireSession,
      config: { rateLimit: roomActionLimit },
    },
    async (request, reply) => {
      const { endpoint, keys } = request.body;
      await upsertPushSubscription(app.db, request.player!.id, endpoint, keys.p256dh, keys.auth);
      reply.code(204).send();
    },
  );

  app.delete(
    "/api/push/subscribe",
    {
      schema: { querystring: PushUnsubscribeRequestSchema },
      preValidation: requireSession,
      config: { rateLimit: roomActionLimit },
    },
    async (request, reply) => {
      await removePushSubscriptionForPlayer(app.db, request.player!.id, request.query.endpoint);
      reply.code(204).send();
    },
  );
}
