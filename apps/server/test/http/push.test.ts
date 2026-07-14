import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { SESSION_COOKIE_NAME } from "../../src/security/session.js";
import type { AppInstance } from "../../src/http/types.js";

const TEST_ENV = {
  NODE_ENV: "test" as const,
  PORT: 0,
  DATABASE_URL: "unused-app-owns-its-own-db-handle",
  SESSION_TOKEN_HMAC_SECRET: "test-hmac-secret-at-least-32-characters-long",
};

async function newPlayer(app: AppInstance): Promise<{ playerId: string; cookie: string }> {
  const response = await app.inject({ method: "POST", url: "/api/identity", payload: {} });
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!;
  return { playerId: response.json().playerId, cookie: `${SESSION_COOKIE_NAME}=${cookie.value}` };
}

const SUBSCRIPTION = {
  endpoint: "https://push.example.com/subscription/abc123",
  keys: { p256dh: "test-p256dh-key", auth: "test-auth-secret" },
};

describe("push subscription routes", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  describe("GET /api/push/vapid-public-key", () => {
    it("returns null when VAPID is not configured (progressive enhancement, not an error)", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });

      const response = await app.inject({ method: "GET", url: "/api/push/vapid-public-key" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ publicKey: null });

      await app.close();
    });

    it("returns the configured public key, and requires no auth", async () => {
      const db = await getTestDb();
      const app = await buildApp({
        db,
        env: { ...TEST_ENV, VAPID_PUBLIC_KEY: "test-public-key" },
        logger: false,
      });

      const response = await app.inject({ method: "GET", url: "/api/push/vapid-public-key" });
      expect(response.json()).toEqual({ publicKey: "test-public-key" });

      await app.close();
    });
  });

  describe("POST /api/push/subscribe", () => {
    it("stores a subscription for the authenticated player", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const player = await newPlayer(app);

      const response = await app.inject({
        method: "POST",
        url: "/api/push/subscribe",
        headers: { cookie: player.cookie },
        payload: SUBSCRIPTION,
      });
      expect(response.statusCode).toBe(204);

      const row = await db
        .selectFrom("push_subscriptions")
        .selectAll()
        .where("endpoint", "=", SUBSCRIPTION.endpoint)
        .executeTakeFirstOrThrow();
      expect(row.player_id).toBe(player.playerId);
      expect(row.p256dh).toBe(SUBSCRIPTION.keys.p256dh);

      await app.close();
    });

    it("requires authentication", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });

      const response = await app.inject({
        method: "POST",
        url: "/api/push/subscribe",
        payload: SUBSCRIPTION,
      });
      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it("re-subscribing the same endpoint upserts rather than duplicating", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const player = await newPlayer(app);

      for (let i = 0; i < 2; i++) {
        await app.inject({
          method: "POST",
          url: "/api/push/subscribe",
          headers: { cookie: player.cookie },
          payload: SUBSCRIPTION,
        });
      }

      const rows = await db
        .selectFrom("push_subscriptions")
        .selectAll()
        .where("endpoint", "=", SUBSCRIPTION.endpoint)
        .execute();
      expect(rows).toHaveLength(1);

      await app.close();
    });
  });

  describe("DELETE /api/push/subscribe", () => {
    it("removes the caller's own subscription", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const player = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/push/subscribe",
        headers: { cookie: player.cookie },
        payload: SUBSCRIPTION,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/push/subscribe?endpoint=${encodeURIComponent(SUBSCRIPTION.endpoint)}`,
        headers: { cookie: player.cookie },
      });
      expect(response.statusCode).toBe(204);

      const rows = await db
        .selectFrom("push_subscriptions")
        .selectAll()
        .where("endpoint", "=", SUBSCRIPTION.endpoint)
        .execute();
      expect(rows).toHaveLength(0);

      await app.close();
    });

    it("never deletes another player's subscription, even given its exact endpoint", async () => {
      const db = await getTestDb();
      const app = await buildApp({ db, env: TEST_ENV, logger: false });
      const owner = await newPlayer(app);
      const attacker = await newPlayer(app);
      await app.inject({
        method: "POST",
        url: "/api/push/subscribe",
        headers: { cookie: owner.cookie },
        payload: SUBSCRIPTION,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/push/subscribe?endpoint=${encodeURIComponent(SUBSCRIPTION.endpoint)}`,
        headers: { cookie: attacker.cookie },
      });
      // Scoped-delete is idempotent from the caller's point of view --
      // "not yours" and "already gone" look the same on purpose (no
      // existence oracle for someone else's subscription).
      expect(response.statusCode).toBe(204);

      const rows = await db
        .selectFrom("push_subscriptions")
        .selectAll()
        .where("endpoint", "=", SUBSCRIPTION.endpoint)
        .execute();
      expect(rows).toHaveLength(1);

      await app.close();
    });
  });
});
