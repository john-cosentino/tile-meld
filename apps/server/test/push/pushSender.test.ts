import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock's factory is hoisted above all imports/top-level statements, so
// the mock functions it references must be created via vi.hoisted rather
// than a plain top-level const -- otherwise they're read before their own
// initialization.
const { setVapidDetails, sendNotification } = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: { setVapidDetails, sendNotification },
}));

import { sendPushToPlayer } from "../../src/push/pushSender.js";
import { buildApp } from "../../src/app.js";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { createPlayer } from "../../src/db/repositories/players.js";
import { upsertPushSubscription } from "../../src/db/repositories/pushSubscriptions.js";

const TEST_ENV_NO_VAPID = {
  NODE_ENV: "test" as const,
  PORT: 0,
  DATABASE_URL: "unused-app-owns-its-own-db-handle",
  SESSION_TOKEN_HMAC_SECRET: "test-hmac-secret-at-least-32-characters-long",
};
const TEST_ENV_WITH_VAPID = {
  ...TEST_ENV_NO_VAPID,
  VAPID_PUBLIC_KEY: "test-pub",
  VAPID_PRIVATE_KEY: "test-priv",
  VAPID_SUBJECT: "mailto:test@example.com",
};

describe("pushSender", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
    setVapidDetails.mockClear();
    sendNotification.mockClear();
    sendNotification.mockReset();
  });

  it("is a silent no-op when VAPID is not configured -- push is a progressive enhancement", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV_NO_VAPID, logger: false });
    const player = await createPlayer(db, "secret");
    await upsertPushSubscription(db, player.id, "https://example.com/ep", "p256dh", "auth");

    await sendPushToPlayer(app, player.id, { title: "t", body: "b", gameId: "g", tag: "tag" });
    expect(sendNotification).not.toHaveBeenCalled();

    await app.close();
  });

  it("is a no-op when the player has no subscriptions", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV_WITH_VAPID, logger: false });
    const player = await createPlayer(db, "secret");

    await sendPushToPlayer(app, player.id, { title: "t", body: "b", gameId: "g", tag: "tag" });
    expect(sendNotification).not.toHaveBeenCalled();

    await app.close();
  });

  it("sends to every subscription for the player with the given payload", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV_WITH_VAPID, logger: false });
    const player = await createPlayer(db, "secret");
    await upsertPushSubscription(db, player.id, "https://example.com/ep1", "p1", "a1");
    await upsertPushSubscription(db, player.id, "https://example.com/ep2", "p2", "a2");
    sendNotification.mockResolvedValue(undefined);

    await sendPushToPlayer(app, player.id, {
      title: "Your turn!",
      body: "It's your turn in Tile Meld.",
      gameId: "game-1",
      tag: "turn:game-1",
    });

    expect(setVapidDetails).toHaveBeenCalledWith(
      "mailto:test@example.com",
      "test-pub",
      "test-priv",
    );
    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [subscription, payload] = sendNotification.mock.calls[0]!;
    expect(subscription).toEqual({
      endpoint: "https://example.com/ep1",
      keys: { p256dh: "p1", auth: "a1" },
    });
    expect(JSON.parse(payload as string)).toEqual({
      title: "Your turn!",
      body: "It's your turn in Tile Meld.",
      gameId: "game-1",
      tag: "turn:game-1",
    });

    await app.close();
  });

  it("deletes the subscription on a 410 Gone response, rather than retrying", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV_WITH_VAPID, logger: false });
    const player = await createPlayer(db, "secret");
    await upsertPushSubscription(db, player.id, "https://example.com/gone", "p", "a");
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));

    await sendPushToPlayer(app, player.id, { title: "t", body: "b", gameId: "g", tag: "tag" });

    const rows = await db
      .selectFrom("push_subscriptions")
      .selectAll()
      .where("endpoint", "=", "https://example.com/gone")
      .execute();
    expect(rows).toHaveLength(0);

    await app.close();
  });

  it("records a failure (not a deletion) on a non-410 error", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV_WITH_VAPID, logger: false });
    const player = await createPlayer(db, "secret");
    await upsertPushSubscription(db, player.id, "https://example.com/flaky", "p", "a");
    sendNotification.mockRejectedValueOnce(new Error("network blip"));

    await sendPushToPlayer(app, player.id, { title: "t", body: "b", gameId: "g", tag: "tag" });

    const row = await db
      .selectFrom("push_subscriptions")
      .selectAll()
      .where("endpoint", "=", "https://example.com/flaky")
      .executeTakeFirstOrThrow();
    expect(row.failure_count).toBe(1);

    await app.close();
  });
});
