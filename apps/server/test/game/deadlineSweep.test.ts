import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { dealDeterministicGame, TEST_HMAC_SECRET } from "../setup/game-fixture.js";
import type { AppInstance } from "../../src/http/types.js";
import {
  runDeadlineSweepOnce,
  runWarningSweepOnce,
  startBackgroundSweeps,
} from "../../src/game/deadlineSweep.js";
import { catchUpAndLoad } from "../../src/game/turnActions.js";
import { createPlayer } from "../../src/db/repositories/players.js";
import { createRoom } from "../../src/db/repositories/rooms.js";
import { joinRoomAndMaybeAutoStart } from "../../src/game/roomStart.js";
import { RETENTION_WINDOW_MS, type RetentionSweepResult } from "../../src/game/retentionSweep.js";

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

async function makeOverdue(app: AppInstance, gameId: string, msAgo = 1000): Promise<void> {
  await app.db
    .updateTable("turns")
    .set({ deadline_at: new Date(Date.now() - msAgo) })
    .where("game_id", "=", gameId)
    .where("status", "=", "active")
    .execute();
}

describe("game/deadlineSweep", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("settles an overdue turn: forfeits it, draws up to 3 penalty tiles, and advances the seat", async () => {
    const app = await newApp();
    const { gameId } = await dealDeterministicGame(app.db, 2);
    await makeOverdue(app, gameId);

    const settled = await runDeadlineSweepOnce(app);
    expect(settled).toHaveLength(1);
    expect(settled[0]!.gameId).toBe(gameId);
    expect(settled[0]!.result.event.type).toBe("timed_out");

    const gameRow = await app.db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .executeTakeFirstOrThrow();
    expect(gameRow.version).toBe(1);
    expect(gameRow.active_seat).toBe(1);

    const rackRow = await app.db
      .selectFrom("racks")
      .selectAll()
      .where("game_id", "=", gameId)
      .where("seat_index", "=", 0)
      .executeTakeFirstOrThrow();
    expect(rackRow.tiles).toHaveLength(17); // 14 + 3 penalty tiles

    await app.close();
  });

  it("is a no-op when nothing is overdue", async () => {
    const app = await newApp();
    await dealDeterministicGame(app.db, 2); // deadline is hours in the future

    const settled = await runDeadlineSweepOnce(app);
    expect(settled).toHaveLength(0);

    await app.close();
  });

  it("restart + deadline catch-up: an overdue turn is settled the moment anything reads the game", async () => {
    const app = await newApp();
    const { gameId } = await dealDeterministicGame(app.db, 2);
    await makeOverdue(app, gameId);

    // Simulates the server having been down and the sweep not having run
    // yet -- the very next thing that touches the game (a socket
    // game:join, or here, a direct catch-up call) settles it first.
    const loaded = await catchUpAndLoad(app, gameId);
    expect(loaded.settled?.event.type).toBe("timed_out");
    expect(loaded.activeSeat).toBe(1);
    expect(loaded.seats[0]!.rack).toHaveLength(17);

    // A second catch-up right after is a clean no-op -- already resolved.
    const second = await catchUpAndLoad(app, gameId);
    expect(second.settled).toBeUndefined();

    await app.close();
  });

  it("simulated scheduler race: two concurrent sweeps on the same overdue game produce exactly one effect", async () => {
    const app = await newApp();
    const { gameId } = await dealDeterministicGame(app.db, 2);
    await makeOverdue(app, gameId);

    const [a, b] = await Promise.all([runDeadlineSweepOnce(app), runDeadlineSweepOnce(app)]);
    const totalSettled = a.length + b.length;
    expect(totalSettled).toBe(1); // SKIP LOCKED -- the loser sees nothing to do

    const gameRow = await app.db
      .selectFrom("games")
      .select("version")
      .where("id", "=", gameId)
      .executeTakeFirstOrThrow();
    expect(gameRow.version).toBe(1); // not 2 -- no double-processing

    await app.close();
  });

  it("warning sweep: marks turns crossing the 15-minute threshold exactly once", async () => {
    const app = await newApp();
    const { gameId } = await dealDeterministicGame(app.db, 2);
    await app.db
      .updateTable("turns")
      .set({ deadline_at: new Date(Date.now() + 10 * 60 * 1000) }) // 10 min out, inside the window
      .where("game_id", "=", gameId)
      .where("status", "=", "active")
      .execute();

    const first = await runWarningSweepOnce(app);
    expect(first).toHaveLength(1);
    expect(first[0]!.gameId).toBe(gameId);
    expect(first[0]!.seatIndex).toBe(0);

    const second = await runWarningSweepOnce(app);
    expect(second).toHaveLength(0); // warned_at is now set -- no repeat

    await app.close();
  });

  it("does not warn a turn outside the 15-minute window", async () => {
    const app = await newApp();
    await dealDeterministicGame(app.db, 2); // hours out, well outside the window

    const warned = await runWarningSweepOnce(app);
    expect(warned).toHaveLength(0);

    await app.close();
  });
});

// Phase 7: proves the WIRING (does startBackgroundSweeps create/omit the
// retention timer per the flag), as opposed to retentionSweep.test.ts's
// direct, controlled-time coverage of runRetentionSweepOnce's own logic.
// Uses a short real interval and a bounded real wait (not a 48-hour sleep
// -- the 48-hour window itself is exercised entirely via injected `now` in
// retentionSweep.test.ts) purely to observe whether the timer fires at
// all.
async function createExpiredEligibleGame(app: AppInstance): Promise<string> {
  const host = await createPlayer(app.db, `sweep-host-${Math.random()}`);
  const { room } = await createRoom(app.db, {
    creatorPlayerId: host.id,
    creatorUsername: `SweepWiring${Math.random().toString(36).slice(2, 8)}`,
    capacity: 2,
    visibility: "private",
    turnLimitHours: 4,
  });
  const guest = await createPlayer(app.db, `sweep-guest-${Math.random()}`);
  const outcome = await joinRoomAndMaybeAutoStart(app.db, room.id, guest.id, "Guest");
  if (outcome.kind !== "joined" || !outcome.gameId) throw new Error("unreachable");
  await app.db
    .updateTable("games")
    .set({
      status: "completed",
      completed_at: new Date(Date.now() - RETENTION_WINDOW_MS - 60_000),
      winner_seat: 0,
    })
    .where("id", "=", outcome.gameId)
    .execute();
  await app.db
    .updateTable("rooms")
    .set({ status: "between_games" })
    .where("id", "=", room.id)
    .execute();
  return outcome.gameId;
}

describe("startBackgroundSweeps -- retention scheduling (Phase 7)", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("never creates a retention timer, and never deletes anything, when ENABLE_RETENTION_SWEEP is unset", async () => {
    const app = await buildApp({
      db: await getTestDb(),
      env: { ...TEST_ENV, ENABLE_RETENTION_SWEEP: undefined },
      logger: false,
    });
    const gameId = await createExpiredEligibleGame(app);

    // A huge main interval (so it can't coincidentally trigger anything
    // relevant here) and a tiny retention interval -- if the flag failed to
    // gate timer creation, this would delete the game almost immediately.
    const stop = startBackgroundSweeps(app, {}, 10_000_000, 30);
    await new Promise((resolve) => setTimeout(resolve, 300));
    stop();

    const game = await app.db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .executeTakeFirst();
    expect(game).toBeDefined();
    await app.close();
  });

  it("creates and runs a retention timer when ENABLE_RETENTION_SWEEP=true", async () => {
    const app = await buildApp({
      db: await getTestDb(),
      env: { ...TEST_ENV, ENABLE_RETENTION_SWEEP: "true" },
      logger: false,
    });
    const gameId = await createExpiredEligibleGame(app);

    const results: RetentionSweepResult[] = [];
    const stop = startBackgroundSweeps(
      app,
      { onRetentionSwept: (r) => results.push(r) },
      10_000_000,
      30,
    );

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && results.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    stop();

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.gameIdsDeleted).toContain(gameId);
    const game = await app.db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .executeTakeFirst();
    expect(game).toBeUndefined();
    await app.close();
  });
});
