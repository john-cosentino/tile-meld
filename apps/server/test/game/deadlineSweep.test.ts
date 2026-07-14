import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { dealDeterministicGame, TEST_HMAC_SECRET } from "../setup/game-fixture.js";
import type { AppInstance } from "../../src/http/types.js";
import { runDeadlineSweepOnce, runWarningSweepOnce } from "../../src/game/deadlineSweep.js";
import { catchUpAndLoad } from "../../src/game/turnActions.js";

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
