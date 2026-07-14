import webpush from "web-push";
import type { AppInstance } from "../http/types.js";
import {
  listPushSubscriptionsForPlayer,
  removePushSubscription,
  recordPushFailure,
  recordPushSuccess,
} from "../db/repositories/pushSubscriptions.js";

// True-background notifications -- docs/opus-implementation-plan.md §8.4.
// Push is a progressive enhancement: the deadline engine and every game
// rule are already fully correct without it (§8.2/§8.5), so every failure
// path here is logged and swallowed, never thrown, and sending is a
// silent no-op wherever VAPID isn't configured at all.

export type PushPayload = {
  readonly title: string;
  readonly body: string;
  readonly gameId: string;
  /** Lets the browser replace an older, now-stale notification of the
   * same kind (e.g. a second "your turn" for the same game) instead of
   * stacking duplicates. */
  readonly tag: string;
};

// Deliberately not cached across calls: `setVapidDetails` just assigns a
// few fields on the web-push module's internal state, so there's no real
// cost to calling it every time -- and caching "already configured" as
// module-level state would mean a single stale flag persists for the rest
// of the process's lifetime regardless of what `app.env` says on a later
// call (irrelevant in production, where env is static for the process,
// but a real footgun for anything that builds more than one `app` in the
// same process -- e.g. this project's own test suite).
function ensureVapidConfigured(app: AppInstance): boolean {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = app.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return true;
}

function isWebPushGoneError(err: unknown): boolean {
  const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
  return statusCode === 404 || statusCode === 410;
}

/** Sends a push to every device `playerId` has subscribed, best-effort and
 * in parallel. A `410 Gone` (or `404`) means the subscription is dead --
 * delete it rather than retry (§8.4). Any other failure just increments
 * the subscription's failure count for future pruning. */
export async function sendPushToPlayer(
  app: AppInstance,
  playerId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureVapidConfigured(app)) return;

  const subscriptions = await listPushSubscriptionsForPlayer(app.db, playerId);
  if (subscriptions.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
        await recordPushSuccess(app.db, sub.endpoint);
      } catch (err) {
        if (isWebPushGoneError(err)) {
          await removePushSubscription(app.db, sub.endpoint);
          return;
        }
        await recordPushFailure(app.db, sub.endpoint);
        app.log.warn({ err, endpoint: sub.endpoint }, "push send failed");
      }
    }),
  );
}
