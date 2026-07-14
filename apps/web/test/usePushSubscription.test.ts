import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const vapidPublicKey = vi.fn();
const subscribePush = vi.fn();
const unsubscribePush = vi.fn();
vi.mock("../src/api/client.js", () => ({
  api: {
    vapidPublicKey: (...args: unknown[]) => vapidPublicKey(...args),
    subscribePush: (...args: unknown[]) => subscribePush(...args),
    unsubscribePush: (...args: unknown[]) => unsubscribePush(...args),
  },
}));

import { usePushSubscription } from "../src/push/usePushSubscription.js";

class FakePushSubscription {
  endpoint = "https://push.example/ep1";
  unsubscribe = vi.fn().mockResolvedValue(true);
  toJSON() {
    return { endpoint: this.endpoint, keys: { p256dh: "p256dh-val", auth: "auth-val" } };
  }
}

type BrowserApiOptions = {
  readonly permission?: NotificationPermission;
  readonly existingSubscription?: FakePushSubscription | null;
  readonly supported?: boolean;
};

function installBrowserPushApis(opts: BrowserApiOptions = {}) {
  const supported = opts.supported ?? true;
  const permissionState = { value: opts.permission ?? "default" };

  if (!supported) {
    Reflect.deleteProperty(window.navigator, "serviceWorker");
    Reflect.deleteProperty(window, "PushManager");
    return {};
  }

  const registration = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(opts.existingSubscription ?? null),
      subscribe: vi.fn().mockResolvedValue(new FakePushSubscription()),
    },
  };
  const serviceWorker = {
    register: vi.fn().mockResolvedValue(registration),
    getRegistration: vi.fn().mockResolvedValue(registration),
  };
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: serviceWorker,
    configurable: true,
  });
  Object.defineProperty(window, "PushManager", {
    value: function PushManager() {},
    configurable: true,
  });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: {
      get permission() {
        return permissionState.value;
      },
      requestPermission: vi.fn().mockImplementation(async () => {
        permissionState.value = "granted";
        return "granted";
      }),
    },
  });

  return { registration, serviceWorker, permissionState };
}

describe("usePushSubscription", () => {
  beforeEach(() => {
    vapidPublicKey.mockReset();
    subscribePush.mockReset().mockResolvedValue(undefined);
    unsubscribePush.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    Reflect.deleteProperty(window.navigator, "serviceWorker");
    Reflect.deleteProperty(window, "PushManager");
    Reflect.deleteProperty(window, "Notification");
  });

  it("reports 'unsupported' when the browser has no Push API", async () => {
    installBrowserPushApis({ supported: false });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("unsupported"));
  });

  it("reports 'unavailable' when the server has no VAPID key configured", async () => {
    installBrowserPushApis();
    vapidPublicKey.mockResolvedValue({ publicKey: null });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("unavailable"));
  });

  it("reports 'denied' when notification permission was already denied", async () => {
    installBrowserPushApis({ permission: "denied" });
    vapidPublicKey.mockResolvedValue({ publicKey: "pub" });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("denied"));
  });

  it("reports 'subscribed' when a subscription already exists on mount", async () => {
    installBrowserPushApis({ existingSubscription: new FakePushSubscription() });
    vapidPublicKey.mockResolvedValue({ publicKey: "pub" });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("subscribed"));
  });

  it("reports 'default' when supported, available, and not yet subscribed", async () => {
    installBrowserPushApis();
    vapidPublicKey.mockResolvedValue({ publicKey: "pub" });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("default"));
  });

  it("subscribe() requests permission, subscribes, and posts to the server", async () => {
    const { registration } = installBrowserPushApis();
    vapidPublicKey.mockResolvedValue({ publicKey: "cHVi" }); // base64url-safe placeholder
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("default"));

    await result.current.subscribe();

    expect(registration!.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(subscribePush).toHaveBeenCalledWith({
      endpoint: "https://push.example/ep1",
      keys: { p256dh: "p256dh-val", auth: "auth-val" },
    });
    await waitFor(() => expect(result.current.state).toBe("subscribed"));
  });

  it("unsubscribe() removes the subscription both server-side and in the browser", async () => {
    const existing = new FakePushSubscription();
    installBrowserPushApis({ existingSubscription: existing });
    vapidPublicKey.mockResolvedValue({ publicKey: "pub" });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("subscribed"));

    await result.current.unsubscribe();

    expect(unsubscribePush).toHaveBeenCalledWith(existing.endpoint);
    expect(existing.unsubscribe).toHaveBeenCalled();
    await waitFor(() => expect(result.current.state).toBe("default"));
  });
});
