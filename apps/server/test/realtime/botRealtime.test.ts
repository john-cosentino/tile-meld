import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { buildApp } from "../../src/app.js";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { dealComputerGame, setSeatRack, TEST_HMAC_SECRET } from "../setup/game-fixture.js";
import type { AppInstance } from "../../src/http/types.js";

// The fast-path computer-opponent trigger, end to end over Socket.IO: after a
// human turn hands off to the bot, the gateway schedules runBotTurn and
// broadcasts its result to the game room like any other turn. Delay is 0 here
// so the timer fires on the next tick.
const TEST_ENV = {
  NODE_ENV: "test" as const,
  PORT: 0,
  DATABASE_URL: "unused-app-owns-its-own-db-handle",
  SESSION_TOKEN_HMAC_SECRET: TEST_HMAC_SECRET,
  BOT_TURN_DELAY_MS: 0,
};

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

let app: AppInstance | undefined;
let url = "";
const openSockets: ClientSocket[] = [];

async function startApp(): Promise<void> {
  const db = await getTestDb();
  app = await buildApp({ db, env: TEST_ENV, logger: false });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("expected a bound TCP address");
  url = `http://127.0.0.1:${address.port}`;
}

function connect(cookie: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(url, { extraHeaders: { Cookie: cookie }, forceNew: true });
    openSockets.push(socket);
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => reject(err));
  });
}

function joinGame<T = unknown>(socket: ClientSocket, gameId: string): Promise<T> {
  return new Promise((resolve) => {
    socket.once("game:state", resolve);
    socket.emit("game:join", { gameId });
  });
}

function emitAck<T = unknown>(socket: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

describe("realtime -- computer-opponent fast path", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
    await startApp();
  });

  afterEach(async () => {
    for (const socket of openSockets.splice(0)) socket.disconnect();
    await app?.close();
    app = undefined;
  });

  it("acts automatically after the human's turn and hands the turn back", async () => {
    const game = await dealComputerGame(app!.db);
    await setSeatRack(app!.db, game.gameId, game.botSeatIndex, UNMELDABLE);

    const socket = await connect(game.human.cookie);
    const state = await joinGame<{ version: number; turnId: string; self: { seatIndex: number } }>(
      socket,
      game.gameId,
    );
    expect(state.self.seatIndex).toBe(game.humanSeatIndex);

    // Resolves when the bot has acted and handed the turn back to the human.
    const handedBack = new Promise<{ seatIndex: number }>((resolve) => {
      socket.on("turn:started", (payload: { seatIndex: number }) => {
        if (payload.seatIndex === game.humanSeatIndex) resolve(payload);
      });
    });

    const ack = await emitAck<{ ok: boolean }>(socket, "turn:draw", {
      gameId: game.gameId,
      expectedVersion: state.version,
      turnId: state.turnId,
      idempotencyKey: "human-draw-1",
    });
    expect(ack.ok).toBe(true);

    const back = await handedBack;
    expect(back.seatIndex).toBe(game.humanSeatIndex);

    // The game advanced twice (human draw + bot draw) and it's the human's
    // turn again.
    const g = await app!.db
      .selectFrom("games")
      .select(["version", "active_seat"])
      .where("id", "=", game.gameId)
      .executeTakeFirstOrThrow();
    expect(g.active_seat).toBe(game.humanSeatIndex);
    expect(g.version).toBe(2);
  }, 15_000);
});
