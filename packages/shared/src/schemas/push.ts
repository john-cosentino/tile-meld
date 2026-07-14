import { z } from "zod";

// Web Push subscription management -- docs/opus-implementation-plan.md
// §7.2/§8.4. `endpoint`/`keys` mirror the browser Push API's
// PushSubscriptionJSON shape exactly, so the client can forward
// `subscription.toJSON()` without reshaping it.

export const PushSubscribeRequestSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export const PushUnsubscribeRequestSchema = z.object({
  endpoint: z.string().url(),
});

export const VapidPublicKeyResponseSchema = z.object({
  // null when the server has no VAPID keypair configured -- push is a
  // progressive enhancement (§8.4), so the client must be able to tell
  // "not available here" apart from "available, not yet subscribed".
  publicKey: z.string().nullable(),
});

export type PushSubscribeRequest = z.infer<typeof PushSubscribeRequestSchema>;
export type PushUnsubscribeRequest = z.infer<typeof PushUnsubscribeRequestSchema>;
export type VapidPublicKeyResponse = z.infer<typeof VapidPublicKeyResponseSchema>;
