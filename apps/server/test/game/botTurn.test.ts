import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import {
  dealComputerGame,
  setSeatRack,
  TEST_HMAC_SECRET,
  type DealtComputerGame,
} from "../setup/game-fixture.js";
import type { AppInstance } from "../../src/http/types.js";
import { generateBotTurn } from "@tile-meld/bot";
import { drawTurn, resignTurn } from "../../src/game/turnActions.js";
import {
  botIdempotencyKey,
  loadBotSnapshot,
  runBotTurn,
  submitBotDecision,
} from "../../src/game/botTurn.js";
import { runBotTurnSweepOnce, runDeadlineSweepOnce } from "../../src/game/deadlineSweep.js";
import { COMPUTER_PLAYER_ID } from "../../src/db/botIdentity.js";

const TEST_ENV = {
  NODE_ENV: "test" as const,
  PORT: 0,
  DATABASE_URL: "unused-app-owns-its-own-db-handle",
  SESSION_TOKEN_HMAC_SECRET: TEST_HMAC_SECRET,
  BOT_TURN_DELAY_MS: 0,
};

// A hand with no run of 3 and no group of 3 -- the bot must draw.
const UNMELDABLE = [
  "C1-1-a",
  "C2-4-a",
  "C3-7-a",
  "C4-10-a",
  "C1-5-a",
  "C2-8-a",
  "C3-11-a",
  "C4-2-a",
  "C1-9-a",
  "C2-12-a",
  "C3-3-a",
  "C4-6-a",
  "C1-13-a",
  "C2-1-b",
] as const;

// A 4-run worth 42 (>= 30 initial threshold) plus non-melding filler.
const MELDABLE = [
  "C1-9-a",
  "C1-10-a",
  "C1-11-a",
  "C1-12-a",
  "C2-1-a",
  "C3-4-a",
  "C4-7-a",
  "C2-13-a",
  "C3-2-a",
  "C4-5-a",
  "C2-9-a",
  "C3-12-a",
  "C4-3-a",
  "C1-2-a",
] as const;

async function newApp(): Promise<AppInstance> {
  const db = await getTestDb();
  return buildApp({ db, env: TEST_ENV, logger: false });
}

async function getGame(app: AppInstance, gameId: string) {
  return app.db
    .selectFrom("games")
    .select(["version", "current_turn_id", "active_seat", "status"])
    .where("id", "=", gameId)
    .executeTakeFirstOrThrow();
}

/** Advances a fresh game from the human's opening turn to the bot's turn by
 * having the human draw one tile. */
async function humanDrawsToBotTurn(app: AppInstance, game: DealtComputerGame): Promise<void> {
  const g = await getGame(app, game.gameId);
  await drawTurn(app, {
    gameId: game.gameId,
    playerId: game.human.playerId,
    expectedVersion: g.version,
    turnId: g.current_turn_id!,
    idempotencyKey: `human-draw-${g.version}`,
  });
}

async function botIdempotencyRows(app: AppInstance, turnId: string): Promise<number> {
  const rows = await app.db
    .selectFrom("idempotency_keys")
    .select("key")
    .where("player_id", "=", COMPUTER_PLAYER_ID)
    .where("key", "=", botIdempotencyKey(turnId))
    .execute();
  return rows.length;
}

describe("game/botTurn -- computer-opponent orchestration", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("acts by drawing when the bot has no legal move, handing the turn back to the human", async () => {
    const app = await newApp();
    const game = await dealComputerGame(app.db);
    await setSeatRack(app.db, game.gameId, game.botSeatIndex, UNMELDABLE);
    await humanDrawsToBotTurn(app, game);

    const outcome = await runBotTurn(app, game.gameId, "scheduled");

    expect(outcome.kind).toBe("acted");
    if (outcome.kind !== "acted") throw new Error("expected acted");
    expect(outcome.result.event.type).toBe("drawn");
    expect(outcome.result.nextTurn?.seatIndex).toBe(game.humanSeatIndex);

    const after = await getGame(app, game.gameId);
    expect(after.active_seat).toBe(game.humanSeatIndex);
    expect(after.status).toBe("active");
  });

  it("acts by committing a legal initial meld through the authoritative pathway", async () => {
    const app = await newApp();
    const game = await dealComputerGame(app.db);
    await setSeatRack(app.db, game.gameId, game.botSeatIndex, MELDABLE);
    await humanDrawsToBotTurn(app, game);

    const outcome = await runBotTurn(app, game.gameId, "recovered");

    expect(outcome.kind).toBe("acted");
    if (outcome.kind !== "acted") throw new Error("expected acted");
    expect(outcome.result.event.type).toBe("committed");

    // The engine transition really persisted: a table set exists, the bot's
    // initial-meld flag flipped, the rack shrank, and an event was logged.
    const tableSets = await app.db
      .selectFrom("table_sets")
      .selectAll()
      .where("game_id", "=", game.gameId)
      .execute();
    expect(tableSets).toHaveLength(1);
    expect([...tableSets[0]!.tiles].sort()).toEqual(
      ["C1-9-a", "C1-10-a", "C1-11-a", "C1-12-a"].sort(),
    );

    const seat = await app.db
      .selectFrom("game_seats")
      .select(["has_initial_meld"])
      .where("game_id", "=", game.gameId)
      .where("seat_index", "=", game.botSeatIndex)
      .executeTakeFirstOrThrow();
    expect(seat.has_initial_meld).toBe(true);

    const rack = await app.db
      .selectFrom("racks")
      .select(["tiles"])
      .where("game_id", "=", game.gameId)
      .where("seat_index", "=", game.botSeatIndex)
      .executeTakeFirstOrThrow();
    expect(rack.tiles).toHaveLength(10);

    const events = await app.db
      .selectFrom("game_events")
      .select(["type", "seat_index"])
      .where("game_id", "=", game.gameId)
      .where("type", "=", "committed")
      .execute();
    expect(events.some((e) => e.seat_index === game.botSeatIndex)).toBe(true);
  });

  it("never passes the human's rack to the generator (no rack leakage)", async () => {
    const app = await newApp();
    const game = await dealComputerGame(app.db);
    // Human holds an obvious meld; the bot holds junk. Chosen to share no
    // tileId with UNMELDABLE so the overlap assertion is meaningful.
    const humanRack = ["C4-1-a", "C4-3-a", "C4-4-a", "C4-5-a", "C4-8-a"];
    await setSeatRack(app.db, game.gameId, game.humanSeatIndex, humanRack);
    await setSeatRack(app.db, game.gameId, game.botSeatIndex, UNMELDABLE);
    await humanDrawsToBotTurn(app, game);

    const snap = await loadBotSnapshot(app, game.gameId);
    expect(snap.ready).toBe(true);
    if (!snap.ready) throw new Error("expected ready");

    // The snapshot the generator sees contains ONLY the bot's own rack.
    const botRackIds = snap.snapshot.input.rack.map((t) => t.tileId).sort();
    expect(botRackIds).toEqual([...UNMELDABLE].sort());
    const humanRackSet = new Set(humanRack);
    for (const id of botRackIds) expect(humanRackSet.has(id)).toBe(false);

    // And with a junk rack the bot draws -- it cannot reach the human's meld.
    const decision = generateBotTurn(snap.snapshot.input);
    expect(decision.kind).toBe("draw");
  });

  it("is a no-op when it is not the bot's turn (wrong active seat)", async () => {
    const app = await newApp();
    const game = await dealComputerGame(app.db);
    // Fresh game: the human (seat 0) is active, not the bot.
    const outcome = await runBotTurn(app, game.gameId, "scheduled");
    expect(outcome).toEqual({ kind: "noop", reason: "not_bot_seat" });
  });

  it("is a no-op after the game has completed", async () => {
    const app = await newApp();
    const game = await dealComputerGame(app.db);
    await humanDrawsToBotTurn(app, game);
    // The human resigns; in a 2-seat game the bot is last standing and the
    // game completes.
    await resignTurn(app, {
      gameId: game.gameId,
      playerId: game.human.playerId,
      idempotencyKey: "human-resign",
    });
    const completed = await getGame(app, game.gameId);
    expect(completed.status).toBe("completed");

    const outcome = await runBotTurn(app, game.gameId, "scheduled");
    expect(outcome).toEqual({ kind: "noop", reason: "game_not_active" });
  });

  it("a duplicate submission of the same snapshot is idempotent (one advancement)", async () => {
    const app = await newApp();
    const game = await dealComputerGame(app.db);
    await setSeatRack(app.db, game.gameId, game.botSeatIndex, UNMELDABLE);
    await humanDrawsToBotTurn(app, game);

    const before = await getGame(app, game.gameId);
    const snap = await loadBotSnapshot(app, game.gameId);
    if (!snap.ready) throw new Error("expected ready");
    const decision = generateBotTurn(snap.snapshot.input);

    const first = await submitBotDecision(app, snap.snapshot, decision, "scheduled");
    const second = await submitBotDecision(app, snap.snapshot, decision, "scheduled");

    expect(first.kind).toBe("acted");
    expect(second.kind).toBe("acted");
    if (first.kind !== "acted" || second.kind !== "acted") throw new Error("expected acted");
    // Both return the same version -- the second is an idempotent replay, not a
    // second real action.
    expect(second.result.version).toBe(first.result.version);

    const after = await getGame(app, game.gameId);
    expect(after.version).toBe(before.version + 1); // advanced exactly once
    expect(await botIdempotencyRows(app, snap.snapshot.snapshotTurnId)).toBe(1);
  });

  it("concurrent executions apply exactly one action", async () => {
    const app = await newApp();
    const game = await dealComputerGame(app.db);
    await setSeatRack(app.db, game.gameId, game.botSeatIndex, UNMELDABLE);
    await humanDrawsToBotTurn(app, game);
    const before = await getGame(app, game.gameId);

    const [a, b] = await Promise.all([
      runBotTurn(app, game.gameId, "scheduled"),
      runBotTurn(app, game.gameId, "recovered"),
    ]);

    // At least one acted; neither corrupts the game.
    expect([a.kind, b.kind]).toContain("acted");
    const after = await getGame(app, game.gameId);
    expect(after.version).toBe(before.version + 1); // exactly one advancement
    expect(after.active_seat).toBe(game.humanSeatIndex);
  });

  it("discards a stale snapshot: the game advancing under it yields a safe no-op", async () => {
    const app = await newApp();
    const game = await dealComputerGame(app.db);
    await setSeatRack(app.db, game.gameId, game.botSeatIndex, UNMELDABLE);
    await humanDrawsToBotTurn(app, game);

    // Stage 1: capture the bot-safe snapshot.
    const snap = await loadBotSnapshot(app, game.gameId);
    if (!snap.ready) throw new Error("expected ready");
    const decision = generateBotTurn(snap.snapshot.input); // stage 2, outside any txn

    // The game advances OUT FROM UNDER the snapshot: the bot's turn is forced
    // overdue and the deadline sweep times it out (version + turn change).
    await app.db
      .updateTable("turns")
      .set({ deadline_at: new Date(Date.now() - 60_000) })
      .where("id", "=", snap.snapshot.snapshotTurnId)
      .execute();
    const settled = await runDeadlineSweepOnce(app);
    expect(settled).toHaveLength(1);

    // Stage 3: the generated (now stale) result must be discarded, not applied.
    const outcome = await submitBotDecision(app, snap.snapshot, decision, "recovered");
    expect(outcome).toEqual({ kind: "noop", reason: "stale_snapshot" });
    // The stale attempt recorded no bot action for that turn.
    expect(await botIdempotencyRows(app, snap.snapshot.snapshotTurnId)).toBe(0);
  });

  it("already-processed short-circuit: a recorded turn is skipped before generating", async () => {
    const app = await newApp();
    const game = await dealComputerGame(app.db);
    await setSeatRack(app.db, game.gameId, game.botSeatIndex, UNMELDABLE);
    await humanDrawsToBotTurn(app, game);
    const g = await getGame(app, game.gameId);

    // Pre-record the bot's idempotent result for the current turn.
    await app.db
      .insertInto("idempotency_keys")
      .values({
        player_id: COMPUTER_PLAYER_ID,
        key: botIdempotencyKey(g.current_turn_id!),
        game_id: game.gameId,
        result_payload: JSON.stringify({ version: 999 }),
      })
      .execute();

    const outcome = await runBotTurn(app, game.gameId, "recovered");
    expect(outcome).toEqual({ kind: "noop", reason: "already_processed" });
  });
});

describe("game/deadlineSweep -- runBotTurnSweepOnce (durable recovery)", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("recovers a due bot turn a lost fast-path timer never ran (restart-equivalent)", async () => {
    const app = await newApp();
    const game = await dealComputerGame(app.db);
    await setSeatRack(app.db, game.gameId, game.botSeatIndex, UNMELDABLE);
    // Human moved, handing the turn to the bot; simulate a crash before the
    // fast-path timer fired by NOT calling runBotTurn -- only the sweep runs.
    await humanDrawsToBotTurn(app, game);
    const before = await getGame(app, game.gameId);

    const acted = await runBotTurnSweepOnce(app, 0);

    expect(acted).toHaveLength(1);
    expect(acted[0]!.gameId).toBe(game.gameId);
    const after = await getGame(app, game.gameId);
    expect(after.version).toBe(before.version + 1);
    expect(after.active_seat).toBe(game.humanSeatIndex);
  });

  it("excludes a bot turn that is not yet due (respects the delay threshold)", async () => {
    const app = await newApp();
    const game = await dealComputerGame(app.db);
    await setSeatRack(app.db, game.gameId, game.botSeatIndex, UNMELDABLE);
    await humanDrawsToBotTurn(app, game);
    const before = await getGame(app, game.gameId);

    // With a 60s "due" threshold, a turn that just started is not eligible.
    const acted = await runBotTurnSweepOnce(app, 60_000);

    expect(acted).toHaveLength(0);
    const after = await getGame(app, game.gameId);
    expect(after.version).toBe(before.version); // untouched
  });

  it("ignores games whose active seat is human", async () => {
    const app = await newApp();
    // Fresh game: the human seat is active (deal creates the game we probe).
    await dealComputerGame(app.db);
    const acted = await runBotTurnSweepOnce(app, 0);
    expect(acted).toHaveLength(0);
  });

  it("ignores completed games", async () => {
    const app = await newApp();
    const game = await dealComputerGame(app.db);
    await humanDrawsToBotTurn(app, game);
    await resignTurn(app, {
      gameId: game.gameId,
      playerId: game.human.playerId,
      idempotencyKey: "human-resign",
    });

    const acted = await runBotTurnSweepOnce(app, 0);
    expect(acted).toHaveLength(0);
  });

  it("is idempotent across repeated sweeps -- a second sweep does not re-act", async () => {
    const app = await newApp();
    const game = await dealComputerGame(app.db);
    await setSeatRack(app.db, game.gameId, game.botSeatIndex, UNMELDABLE);
    await humanDrawsToBotTurn(app, game);

    const first = await runBotTurnSweepOnce(app, 0);
    expect(first).toHaveLength(1);
    // After the bot acted, the active seat is the human, so a second sweep
    // finds no bot turn.
    const second = await runBotTurnSweepOnce(app, 0);
    expect(second).toHaveLength(0);
  });
});
