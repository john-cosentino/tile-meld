import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mocks the sender, not web-push itself (pushSender.test.ts already covers
// the sending mechanics) -- this file is only about *when* a push fires
// and *who* it goes to, for each of the plan's 4 triggers (§8.4): turn
// started, 15-minute warning, timed out, game over.
const { sendPushToPlayer } = vi.hoisted(() => ({
  sendPushToPlayer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/push/pushSender.js", () => ({ sendPushToPlayer }));

import { buildApp } from "../../src/app.js";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { dealDeterministicGame, TEST_HMAC_SECRET } from "../setup/game-fixture.js";
import { drawTurn, resignTurn } from "../../src/game/turnActions.js";
import { runDeadlineSweepOnce, runWarningSweepOnce } from "../../src/game/deadlineSweep.js";
import { broadcastTurnActionResult, broadcastWarning } from "../../src/realtime/gateway.js";
import type { AppInstance } from "../../src/http/types.js";

const TEST_ENV = {
  NODE_ENV: "test" as const,
  PORT: 0,
  DATABASE_URL: "unused-app-owns-its-own-db-handle",
  SESSION_TOKEN_HMAC_SECRET: TEST_HMAC_SECRET,
};

async function newApp(): Promise<AppInstance> {
  const db = await getTestDb();
  return buildApp({ db, env: TEST_ENV, logger: false });
}

async function makeOverdue(app: AppInstance, gameId: string, deadlineAt: Date): Promise<void> {
  await app.db
    .updateTable("turns")
    .set({ deadline_at: deadlineAt })
    .where("game_id", "=", gameId)
    .where("status", "=", "active")
    .execute();
}

describe("push notification triggers", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
    sendPushToPlayer.mockClear();
  });

  it("pushes 'your turn' to the newly active seat's player after a draw", async () => {
    const app = await newApp();
    const { gameId, players } = await dealDeterministicGame(app.db, 2);
    const gameRow = await app.db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .executeTakeFirstOrThrow();

    const result = await drawTurn(app, {
      gameId,
      playerId: players[0]!.playerId,
      expectedVersion: 0,
      turnId: gameRow.current_turn_id!,
      idempotencyKey: "trigger-draw-1",
    });
    broadcastTurnActionResult(app, app.io, gameId, result);

    await vi.waitFor(() => expect(sendPushToPlayer).toHaveBeenCalled());
    expect(sendPushToPlayer).toHaveBeenCalledWith(
      expect.anything(),
      players[1]!.playerId,
      expect.objectContaining({ tag: `turn:${gameId}`, title: "Your turn!" }),
    );

    await app.close();
  });

  it("pushes 'game over' to every participant when a resign ends the game", async () => {
    const app = await newApp();
    const { gameId, players } = await dealDeterministicGame(app.db, 2);

    const result = await resignTurn(app, {
      gameId,
      playerId: players[1]!.playerId,
      idempotencyKey: "trigger-resign-1",
    });
    broadcastTurnActionResult(app, app.io, gameId, result);

    await vi.waitFor(() => expect(sendPushToPlayer).toHaveBeenCalledTimes(2));
    const calledPlayerIds = sendPushToPlayer.mock.calls.map((call) => call[1]).sort();
    expect(calledPlayerIds).toEqual([players[0]!.playerId, players[1]!.playerId].sort());
    for (const call of sendPushToPlayer.mock.calls) {
      expect(call[2]).toEqual(
        expect.objectContaining({ title: "Game over", tag: `game-over:${gameId}` }),
      );
    }

    await app.close();
  });

  it("pushes 'timed out' to the overdue seat and 'your turn' to the next seat, via the deadline sweep", async () => {
    const app = await newApp();
    const { gameId, players } = await dealDeterministicGame(app.db, 2);
    await makeOverdue(app, gameId, new Date(Date.now() - 1000));

    const settled = await runDeadlineSweepOnce(app);
    expect(settled).toHaveLength(1);
    broadcastTurnActionResult(app, app.io, gameId, settled[0]!.result);

    await vi.waitFor(() => expect(sendPushToPlayer).toHaveBeenCalledTimes(2));
    const timeoutCall = sendPushToPlayer.mock.calls.find(
      (call) => (call[2] as { tag: string }).tag === `timeout:${gameId}`,
    );
    const turnCall = sendPushToPlayer.mock.calls.find(
      (call) => (call[2] as { tag: string }).tag === `turn:${gameId}`,
    );
    expect(timeoutCall?.[1]).toBe(players[0]!.playerId); // seat 0 was the starting/overdue seat
    expect(turnCall?.[1]).toBe(players[1]!.playerId);

    await app.close();
  });

  it("pushes the 15-minute warning to the active seat's player", async () => {
    const app = await newApp();
    const { gameId, players } = await dealDeterministicGame(app.db, 2);
    await makeOverdue(app, gameId, new Date(Date.now() + 10 * 60 * 1000));

    const warned = await runWarningSweepOnce(app);
    expect(warned).toHaveLength(1);
    broadcastWarning(app, app.io, warned[0]!);

    await vi.waitFor(() => expect(sendPushToPlayer).toHaveBeenCalled());
    expect(sendPushToPlayer).toHaveBeenCalledWith(
      expect.anything(),
      players[0]!.playerId,
      expect.objectContaining({ tag: `warning:${gameId}`, title: "15 minutes left" }),
    );

    await app.close();
  });

  it("does not push anything for an invalid commit's own penalty (only the plan's 4 triggers push)", async () => {
    const app = await newApp();
    const { gameId, players, deck } = await dealDeterministicGame(app.db, 2);
    const gameRow = await app.db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .executeTakeFirstOrThrow();

    const { commitTurn } = await import("../../src/game/turnActions.js");
    const illegal = [deck[0]!.tileId, deck[2]!.tileId]; // mismatched colors/values
    const result = await commitTurn(app, {
      gameId,
      playerId: players[0]!.playerId,
      expectedVersion: 0,
      turnId: gameRow.current_turn_id!,
      arrangement: [illegal],
      idempotencyKey: "trigger-invalid-1",
    });
    expect(result.event.type).toBe("invalid_commit");
    broadcastTurnActionResult(app, app.io, gameId, result);

    // The turn still advances to seat 1 on an invalid commit (§7.6), so a
    // "your turn" push to seat 1 is expected -- but nothing else, and
    // nothing at all to seat 0 about their own rejected commit.
    await vi.waitFor(() => expect(sendPushToPlayer).toHaveBeenCalledTimes(1));
    expect(sendPushToPlayer).toHaveBeenCalledWith(
      expect.anything(),
      players[1]!.playerId,
      expect.objectContaining({ tag: `turn:${gameId}` }),
    );

    await app.close();
  });
});
