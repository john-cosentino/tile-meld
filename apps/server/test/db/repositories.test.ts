import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { createPlayer } from "../../src/db/repositories/players.js";
import {
  createSession,
  findActiveSessionByToken,
  revokeSession,
} from "../../src/db/repositories/sessions.js";
import { createRoom } from "../../src/db/repositories/rooms.js";
import { postChatMessage, listChatMessages } from "../../src/db/repositories/chatMessages.js";
import {
  upsertPushSubscription,
  listPushSubscriptionsForPlayer,
  removePushSubscription,
} from "../../src/db/repositories/pushSubscriptions.js";
import { recordGameResult, getRoomScores } from "../../src/db/repositories/roomScores.js";
import {
  findIdempotentResult,
  recordIdempotentResult,
} from "../../src/db/repositories/idempotencyKeys.js";

const HMAC_SECRET = "test-hmac-secret";

describe("repositories -- basic correctness", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("sessions: creates, finds by token, and revokes", async () => {
    const db = await getTestDb();
    const player = await createPlayer(db, "recovery-secret");

    const { token, session } = await createSession(db, player.id, HMAC_SECRET, 3_600_000);
    expect(session.player_id).toBe(player.id);

    const found = await findActiveSessionByToken(db, token, HMAC_SECRET);
    expect(found?.id).toBe(session.id);

    // A wrong token (or wrong HMAC secret) never matches.
    expect(await findActiveSessionByToken(db, "wrong-token", HMAC_SECRET)).toBeUndefined();
    expect(await findActiveSessionByToken(db, token, "wrong-secret")).toBeUndefined();

    await revokeSession(db, session.id);
    expect(await findActiveSessionByToken(db, token, HMAC_SECRET)).toBeUndefined();
  });

  it("chat: is game-scoped and returned in chronological order", async () => {
    const db = await getTestDb();
    const player = await createPlayer(db, "recovery-secret");
    const { room } = await createRoom(db, {
      creatorPlayerId: player.id,
      creatorDisplayName: "Host",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
    });
    // Chat is always game-scoped, but Phase 3 doesn't yet build the full
    // room->game flow end-to-end (Phase 4/5) -- create a bare games row
    // directly to exercise the chat repository in isolation.
    const game = await db
      .insertInto("games")
      .values({
        room_id: room.id,
        seq: 1,
        status: "active",
        pool_order: [],
        active_seat: 0,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await postChatMessage(db, game.id, 0, player.id, "hello");
    await postChatMessage(db, game.id, null, player.id, "world");

    const messages = await listChatMessages(db, game.id);
    expect(messages.map((m) => m.body)).toEqual(["hello", "world"]);
    // Server-stamped, never client-supplied.
    expect(messages.every((m) => m.sender_player_id === player.id)).toBe(true);
  });

  it("chat: rejects an over-length body", async () => {
    const db = await getTestDb();
    const player = await createPlayer(db, "recovery-secret");
    const { room } = await createRoom(db, {
      creatorPlayerId: player.id,
      creatorDisplayName: "Host",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
    });
    const game = await db
      .insertInto("games")
      .values({ room_id: room.id, seq: 1, status: "active", pool_order: [], active_seat: 0 })
      .returningAll()
      .executeTakeFirstOrThrow();

    await expect(postChatMessage(db, game.id, 0, player.id, "x".repeat(501))).rejects.toThrow();
  });

  it("push subscriptions: upserts by endpoint and can be removed on 410", async () => {
    const db = await getTestDb();
    const player = await createPlayer(db, "recovery-secret");

    await upsertPushSubscription(db, player.id, "https://push.example/1", "p256dh-1", "auth-1");
    // Same endpoint again -- updates in place, does not duplicate.
    await upsertPushSubscription(db, player.id, "https://push.example/1", "p256dh-2", "auth-2");

    const subs = await listPushSubscriptionsForPlayer(db, player.id);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.p256dh).toBe("p256dh-2");

    await removePushSubscription(db, "https://push.example/1");
    expect(await listPushSubscriptionsForPlayer(db, player.id)).toEqual([]);
  });

  it("room scores: accumulates cumulative totals across multiple games", async () => {
    const db = await getTestDb();
    const winner = await createPlayer(db, "winner-secret");
    const loser = await createPlayer(db, "loser-secret");
    const { room } = await createRoom(db, {
      creatorPlayerId: winner.id,
      creatorDisplayName: "Winner",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
    });

    await recordGameResult(db, room.id, [
      { playerId: winner.id, points: 10, won: true },
      { playerId: loser.id, points: -10, won: false },
    ]);
    await recordGameResult(db, room.id, [
      { playerId: winner.id, points: 5, won: true },
      { playerId: loser.id, points: -5, won: false },
    ]);

    const scores = await getRoomScores(db, room.id);
    const winnerScore = scores.find((s) => s.player_id === winner.id)!;
    const loserScore = scores.find((s) => s.player_id === loser.id)!;

    expect(winnerScore).toMatchObject({ cumulative_score: 15, games_played: 2, games_won: 2 });
    expect(loserScore).toMatchObject({ cumulative_score: -15, games_played: 2, games_won: 0 });
  });

  it("idempotency keys: scoped per player, persists the full result for replay", async () => {
    const db = await getTestDb();
    const playerA = await createPlayer(db, "a-secret");
    const playerB = await createPlayer(db, "b-secret");

    await recordIdempotentResult(db, playerA.id, "same-key", null, {
      outcome: "committed",
      seat: 0,
    });
    // The same key string is fine for a different player -- scoped by
    // (player_id, key), not key alone.
    await recordIdempotentResult(db, playerB.id, "same-key", null, { outcome: "drawn", seat: 1 });

    const resultA = await findIdempotentResult(db, playerA.id, "same-key");
    const resultB = await findIdempotentResult(db, playerB.id, "same-key");

    expect(resultA?.result_payload).toEqual({ outcome: "committed", seat: 0 });
    expect(resultB?.result_payload).toEqual({ outcome: "drawn", seat: 1 });
  });
});
