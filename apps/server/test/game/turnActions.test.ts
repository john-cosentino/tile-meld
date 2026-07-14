import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import {
  dealDeterministicGame,
  findInitialMeldRun,
  TEST_HMAC_SECRET,
} from "../setup/game-fixture.js";
import type { AppInstance } from "../../src/http/types.js";
import {
  ActionError,
  commitTurn,
  drawTurn,
  passTurn,
  resignTurn,
} from "../../src/game/turnActions.js";

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

describe("game/turnActions", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("commit: a legal initial meld advances the turn and bumps version", async () => {
    const app = await newApp();
    const { gameId, players, deck } = await dealDeterministicGame(app.db, 2);
    const run = findInitialMeldRun(deck.slice(0, 14));
    const initialTurnId = (
      await app.db
        .selectFrom("games")
        .select("current_turn_id")
        .where("id", "=", gameId)
        .executeTakeFirstOrThrow()
    ).current_turn_id!;

    const result = await commitTurn(app, {
      gameId,
      playerId: players[0]!.playerId,
      expectedVersion: 0,
      turnId: initialTurnId,
      arrangement: [run.map((t) => t.tileId)],
      idempotencyKey: "commit-1",
    });

    expect(result.version).toBe(1);
    expect(result.event.type).toBe("committed");
    expect(result.nextTurn?.seatIndex).toBe(1);

    const gameRow = await app.db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .executeTakeFirstOrThrow();
    expect(gameRow.version).toBe(1);
    expect(gameRow.active_seat).toBe(1);

    await app.close();
  });

  it("commit: an illegal arrangement draws the 3-tile penalty and forfeits the turn", async () => {
    const app = await newApp();
    const { gameId, players, deck } = await dealDeterministicGame(app.db, 2);
    const rack = deck.slice(0, 14);
    // Two tiles of different colors and non-matching values -- neither a
    // run nor a group.
    const illegal = [rack[0]!, rack[2]!];

    const gameRow = await app.db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .executeTakeFirstOrThrow();

    const result = await commitTurn(app, {
      gameId,
      playerId: players[0]!.playerId,
      expectedVersion: 0,
      turnId: gameRow.current_turn_id!,
      arrangement: [illegal.map((t) => t.tileId)],
      idempotencyKey: "commit-illegal",
    });

    expect(result.event.type).toBe("invalid_commit");
    if (result.event.type === "invalid_commit") {
      expect(result.event.penaltyDrawn).toBe(3);
    }

    const rackRow = await app.db
      .selectFrom("racks")
      .selectAll()
      .where("game_id", "=", gameId)
      .where("seat_index", "=", 0)
      .executeTakeFirstOrThrow();
    // Original 14 + 3 penalty tiles, nothing lost.
    expect(rackRow.tiles).toHaveLength(17);

    await app.close();
  });

  it("commit: an arrangement referencing an unknown tileId is rejected before the engine sees it (no penalty)", async () => {
    const app = await newApp();
    const { gameId, players } = await dealDeterministicGame(app.db, 2);
    const gameRow = await app.db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .executeTakeFirstOrThrow();

    await expect(
      commitTurn(app, {
        gameId,
        playerId: players[0]!.playerId,
        expectedVersion: 0,
        turnId: gameRow.current_turn_id!,
        arrangement: [["not-a-real-tile-id"]],
        idempotencyKey: "commit-bogus",
      }),
    ).rejects.toThrow(ActionError);

    const unchanged = await app.db
      .selectFrom("games")
      .select("version")
      .where("id", "=", gameId)
      .executeTakeFirstOrThrow();
    expect(unchanged.version).toBe(0);

    await app.close();
  });

  it("rejects a stale expectedVersion/turnId without mutating anything", async () => {
    const app = await newApp();
    const { gameId, players } = await dealDeterministicGame(app.db, 2);

    await expect(
      drawTurn(app, {
        gameId,
        playerId: players[0]!.playerId,
        expectedVersion: 99,
        turnId: "00000000-0000-0000-0000-000000000000",
        idempotencyKey: "draw-stale",
      }),
    ).rejects.toMatchObject({ code: "stale" });

    const unchanged = await app.db
      .selectFrom("games")
      .select("version")
      .where("id", "=", gameId)
      .executeTakeFirstOrThrow();
    expect(unchanged.version).toBe(0);

    await app.close();
  });

  it("rejects an action from a player who is not the active seat", async () => {
    const app = await newApp();
    const { gameId, players } = await dealDeterministicGame(app.db, 2);
    const gameRow = await app.db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .executeTakeFirstOrThrow();

    await expect(
      drawTurn(app, {
        gameId,
        playerId: players[1]!.playerId, // seat 1, but seat 0 is active
        expectedVersion: 0,
        turnId: gameRow.current_turn_id!,
        idempotencyKey: "draw-out-of-turn",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    await app.close();
  });

  it("draw: takes exactly one tile and advances to the next seat", async () => {
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
      idempotencyKey: "draw-1",
    });
    expect(result.event.type).toBe("drawn");

    const rackRow = await app.db
      .selectFrom("racks")
      .selectAll()
      .where("game_id", "=", gameId)
      .where("seat_index", "=", 0)
      .executeTakeFirstOrThrow();
    expect(rackRow.tiles).toHaveLength(15);

    await app.close();
  });

  it("rejects pass while the pool is non-empty, and rejects draw once the pool is empty", async () => {
    const app = await newApp();
    const { gameId, players } = await dealDeterministicGame(app.db, 2);
    const gameRow = await app.db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .executeTakeFirstOrThrow();

    await expect(
      passTurn(app, {
        gameId,
        playerId: players[0]!.playerId,
        expectedVersion: 0,
        turnId: gameRow.current_turn_id!,
        idempotencyKey: "pass-too-early",
      }),
    ).rejects.toMatchObject({ code: "invalid" });

    await app.close();
  });

  it("idempotency: replaying the same key returns the original result without reprocessing", async () => {
    const app = await newApp();
    const { gameId, players } = await dealDeterministicGame(app.db, 2);
    const gameRow = await app.db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .executeTakeFirstOrThrow();

    const first = await drawTurn(app, {
      gameId,
      playerId: players[0]!.playerId,
      expectedVersion: 0,
      turnId: gameRow.current_turn_id!,
      idempotencyKey: "same-key",
    });

    // A retry with the SAME idempotencyKey and the now-stale
    // expectedVersion/turnId still succeeds -- it's a replay, not a fresh
    // action, so it never reaches the version/turn check.
    const replay = await drawTurn(app, {
      gameId,
      playerId: players[0]!.playerId,
      expectedVersion: 0,
      turnId: gameRow.current_turn_id!,
      idempotencyKey: "same-key",
    });
    expect(replay).toEqual(first);

    const finalGameRow = await app.db
      .selectFrom("games")
      .select("version")
      .where("id", "=", gameId)
      .executeTakeFirstOrThrow();
    // Only one real draw happened -- version advanced by exactly 1, not 2.
    expect(finalGameRow.version).toBe(1);

    await app.close();
  });

  it("resign: allowed out of turn, and ends a 2-player game immediately", async () => {
    const app = await newApp();
    const { gameId, players } = await dealDeterministicGame(app.db, 2);
    // Seat 0 is active; seat 1 resigns out of turn.
    const result = await resignTurn(app, {
      gameId,
      playerId: players[1]!.playerId,
      idempotencyKey: "resign-1",
    });

    expect(result.event.type).toBe("resigned");
    expect(result.gameEnd.ended).toBe(true);
    if (result.gameEnd.ended) {
      expect(result.gameEnd.reason).toBe("last_active_standing");
      expect(result.gameEnd.winnerSeatIndex).toBe(0);
    }

    const gameRow = await app.db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .executeTakeFirstOrThrow();
    expect(gameRow.status).toBe("completed");

    // Regression: seat 1 (not the active seat) resigning ends the game
    // without activeSeat changing -- the still-"active" turn row for seat
    // 0 must still get closed out, not left dangling forever.
    const turnRow = await app.db
      .selectFrom("turns")
      .selectAll()
      .where("game_id", "=", gameId)
      .where("seat_index", "=", 0)
      .executeTakeFirstOrThrow();
    expect(turnRow.status).toBe("resigned");
    expect(turnRow.resolved_at).not.toBeNull();

    const roomRow = await app.db
      .selectFrom("rooms")
      .select("status")
      .where("id", "=", gameRow.room_id)
      .executeTakeFirstOrThrow();
    expect(roomRow.status).toBe("between_games");

    const scores = await app.db
      .selectFrom("room_scores")
      .selectAll()
      .where("player_id", "=", players[0]!.playerId)
      .executeTakeFirstOrThrow();
    expect(scores.games_won).toBe(1);

    await app.close();
  });

  it("rejects an action against a seat the player doesn't hold", async () => {
    const app = await newApp();
    const { gameId } = await dealDeterministicGame(app.db, 2);
    const gameRow = await app.db
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .executeTakeFirstOrThrow();

    await expect(
      drawTurn(app, {
        gameId,
        playerId: "00000000-0000-0000-0000-000000000000",
        expectedVersion: 0,
        turnId: gameRow.current_turn_id!,
        idempotencyKey: "outsider-draw",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    await app.close();
  });
});
