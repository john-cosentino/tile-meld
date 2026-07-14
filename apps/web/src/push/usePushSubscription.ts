import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";

// Web Push subscription lifecycle -- docs/opus-implementation-plan.md
// §8.4. Purely a progressive enhancement: in-app/aria-live notifications
// (useGame's announcer) already cover everything while a tab is open; this
// only adds true-background delivery, and every state here degrades to
// "no push, in-app still works" rather than blocking anything.

export type PushState =
  | "checking"
  | "unsupported"
  | "unavailable" // browser supports Push, but the server has no VAPID keypair configured
  | "default" // supported and available, not yet subscribed (or permission not yet asked)
  | "denied"
  | "subscribed";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  // Explicitly backed by a plain ArrayBuffer (not the wider ArrayBufferLike
  // a bare `new Uint8Array(length)` infers) -- PushSubscriptionOptionsInit's
  // applicationServerKey requires exactly that under current DOM typings.
  const output = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

function isSupported(): boolean {
  return (
    typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window
  );
}

export function usePushSubscription() {
  const [state, setState] = useState<PushState>("checking");
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!isSupported()) {
      setState("unsupported");
      return;
    }
    let cancelled = false;
    (async () => {
      const { publicKey } = await api.vapidPublicKey();
      if (!publicKey) {
        if (!cancelled) setState("unavailable");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) setState(existing ? "subscribed" : "default");
    })().catch(() => {
      if (!cancelled) setState("unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async (): Promise<void> => {
    setError(undefined);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "default");
        return;
      }
      const { publicKey } = await api.vapidPublicKey();
      if (!publicKey) {
        setState("unavailable");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        throw new Error("Browser returned an incomplete push subscription.");
      }
      await api.subscribePush({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      setState("subscribed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable notifications.");
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<void> => {
    setError(undefined);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api.unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("default");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disable notifications.");
    }
  }, []);

  return { state, error, subscribe, unsubscribe };
}
