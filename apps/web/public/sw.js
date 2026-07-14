// Service Worker -- docs/opus-implementation-plan.md §8.4. Its only job is
// receiving Web Push events and letting the player click through to the
// relevant game; it does not cache anything or make the app work offline
// (never rely on push -- or this worker -- for correctness, per §8.5).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Tile Meld",
    body: "You have a notification.",
    tag: "tile-meld",
    gameId: null,
  };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      // Not JSON -- fall back to the default payload above rather than
      // showing nothing.
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      // Replaces an older notification of the same kind (e.g. a second
      // "your turn" for the same game) instead of stacking duplicates.
      renotify: true,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { gameId: payload.gameId },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const gameId = event.notification.data && event.notification.data.gameId;
  const targetPath = gameId ? `/games/${gameId}` : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(targetPath).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetPath);
      return undefined;
    }),
  );
});
