import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { buildApp } from "../../src/app.js";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import {
  dealDeterministicGame,
  findInitialMeldRun,
  TEST_HMAC_SECRET,
} from "../setup/game-fixture.js";
import type { AppInstance } from "../../src/http/types.js";
import { createPlayer } from "../../src/db/repositories/players.js";
import { createSession } from "../../src/db/repositories/sessions.js";
import { SESSION_COOKIE_NAME } from "../../src/security/session.js";

const TEST_ENV = {
  NODE_ENV: "test" as const,
  PORT: 0,
  DATABASE_URL: "unused-app-owns-its-own-db-handle",
  SESSION_TOKEN_HMAC_SECRET: TEST_HMAC_SECRET,
};

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

function once<T = unknown>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

function emitAck<T = unknown>(socket: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

// Registers the game:state listener *before* emitting game:join, all
// synchronously (no await in between) -- otherwise, if a listener is
// registered only after some other await yields control, the server's
// reply can arrive and fire on an EventEmitter with zero listeners
// attached, silently dropping it (this bit an earlier version of these
// tests: awaiting one socket's join before even registering the listener
// for the other let the second server reply arrive and vanish before
// anyone was listening).
function joinGame<T = unknown>(socket: ClientSocket, gameId: string): Promise<T> {
  const state = once<T>(socket, "game:state");
  socket.emit("game:join", { gameId });
  return state;
}

describe("realtime gateway", () => {
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

  it("rejects a connection with no session cookie", async () => {
    await expect(connect("")).rejects.toBeTruthy();
  });

  it("game:join returns the caller's own rack and never the opponent's", async () => {
    const { gameId, players } = await dealDeterministicGame(app!.db, 2);
    const hostSocket = await connect(players[0]!.cookie);
    const guestSocket = await connect(players[1]!.cookie);

    const [hostState, guestState] = await Promise.all([
      joinGame<{ self: { rack: { tileId: string }[] } }>(hostSocket, gameId),
      joinGame<{ self: { rack: { tileId: string }[] } }>(guestSocket, gameId),
    ]);
    expect(hostState.self.rack).toHaveLength(14);
    expect(guestState.self.rack).toHaveLength(14);

    const hostRackIds = new Set(hostState.self.rack.map((t) => t.tileId));
    const guestRackIds = guestState.self.rack.map((t) => t.tileId);
    for (const id of guestRackIds) expect(hostRackIds.has(id)).toBe(false);
  });

  // Phase 7: a purged (retention-deleted) game and a gameId that never
  // existed are indistinguishable here -- both fail this same
  // findGameSeatForPlayer check. The client's game:join call MUST resolve
  // (via ack, not only the separate `error` broadcast) even on this
  // rejection path, or useGame.ts's promise/callback never settles and the
  // UI is stuck on "Loading table…" forever -- caught by a real
  // end-to-end e2e run against the actual client (e2e/tests/
  // purgedGame.spec.ts), not by this repository's own unit-level mocks
  // (apps/web/test/useGame.test.tsx), which had assumed the ack always
  // fires and so could not have caught this by construction.
  it("game:join acks with forbidden (not just an error event) for a nonexistent/inaccessible game, so the client's join always resolves", async () => {
    const outsider = await createPlayer(app!.db, "outsider-secret");
    const { token } = await createSession(app!.db, outsider.id, TEST_HMAC_SECRET, 3_600_000);
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;
    const socket = await connect(cookie);

    const errorEventPromise = once<{ code: string; message: string }>(socket, "error");
    const ackPromise = emitAck<{ ok: boolean; code?: string; message?: string }>(
      socket,
      "game:join",
      { gameId: "00000000-0000-0000-0000-000000000000" },
    );

    const [errorEvent, ack] = await Promise.all([errorEventPromise, ackPromise]);
    expect(errorEvent.code).toBe("forbidden");
    expect(ack).toEqual({
      ok: false,
      code: "forbidden",
      message: "not a seat holder in this game",
    });
  });

  it("a valid commit broadcasts game:patch + turn:started to every socket in the game", async () => {
    const { gameId, players, deck } = await dealDeterministicGame(app!.db, 2);
    const hostSocket = await connect(players[0]!.cookie);
    const guestSocket = await connect(players[1]!.cookie);
    await Promise.all([joinGame(hostSocket, gameId), joinGame(guestSocket, gameId)]);

    const run = findInitialMeldRun(deck.slice(0, 14));
    const patchPromise = once<{ version: number }>(guestSocket, "game:patch");
    const startedPromise = once<{ seatIndex: number }>(guestSocket, "turn:started");

    const turnId = (
      await app!.db
        .selectFrom("games")
        .select("current_turn_id")
        .where("id", "=", gameId)
        .executeTakeFirstOrThrow()
    ).current_turn_id;

    const ack = await emitAck<{ ok: boolean; version: number }>(hostSocket, "turn:commit", {
      gameId,
      expectedVersion: 0,
      turnId,
      arrangement: [run.map((t) => t.tileId)],
      idempotencyKey: "socket-commit-1",
    });
    expect(ack.ok).toBe(true);
    expect(ack.version).toBe(1);

    const patch = await patchPromise;
    expect(patch.version).toBe(1);
    const started = await startedPromise;
    expect(started.seatIndex).toBe(1);
  });

  it("a stale commit is rejected with an error event and does not mutate state", async () => {
    const { gameId, players } = await dealDeterministicGame(app!.db, 2);
    const hostSocket = await connect(players[0]!.cookie);
    await joinGame(hostSocket, gameId);

    const errorPromise = once<{ code: string }>(hostSocket, "error");
    hostSocket.emit("turn:commit", {
      gameId,
      expectedVersion: 99,
      turnId: "00000000-0000-0000-0000-000000000000",
      arrangement: [],
      idempotencyKey: "stale-1",
    });
    const err = await errorPromise;
    expect(err.code).toBe("stale");

    const gameRow = await app!.db
      .selectFrom("games")
      .select("version")
      .where("id", "=", gameId)
      .executeTakeFirstOrThrow();
    expect(gameRow.version).toBe(0);
  });

  it("resign broadcasts game:over with the room's cumulative scores", async () => {
    const { gameId, players } = await dealDeterministicGame(app!.db, 2);
    const hostSocket = await connect(players[0]!.cookie);
    const guestSocket = await connect(players[1]!.cookie);
    await Promise.all([joinGame(hostSocket, gameId), joinGame(guestSocket, gameId)]);

    const overPromise = once<{ winnerSeatIndex: number; roomCumulative: unknown[] }>(
      hostSocket,
      "game:over",
    );
    guestSocket.emit("turn:resign", { gameId, idempotencyKey: "socket-resign-1" });

    const over = await overPromise;
    expect(over.winnerSeatIndex).toBe(0);
    expect(over.roomCumulative.length).toBeGreaterThan(0);
  });

  it("chat:send broadcasts chat:message to the whole game room", async () => {
    const { gameId, players } = await dealDeterministicGame(app!.db, 2);
    const hostSocket = await connect(players[0]!.cookie);
    const guestSocket = await connect(players[1]!.cookie);
    await Promise.all([joinGame(hostSocket, gameId), joinGame(guestSocket, gameId)]);

    const messagePromise = once<{ body: string; senderDisplay: string }>(
      guestSocket,
      "chat:message",
    );
    hostSocket.emit("chat:send", { gameId, body: "hello there" });
    const message = await messagePromise;
    expect(message.body).toBe("hello there");
    expect(message.senderDisplay).toBe("P0");
  });

  it("chat:send strips control characters from the body", async () => {
    const { gameId, players } = await dealDeterministicGame(app!.db, 2);
    const hostSocket = await connect(players[0]!.cookie);
    await joinGame(hostSocket, gameId);

    const messagePromise = once<{ body: string }>(hostSocket, "chat:message");
    // \x07 (bell) is a control character the schema strips; the
    // space around it is ordinary and must survive.
    hostSocket.emit("chat:send", { gameId, body: "hi\x07 there" });
    const message = await messagePromise;
    expect(message.body).toBe("hi there");
  });

  it("chat:send is rejected once the game has ended", async () => {
    const { gameId, players } = await dealDeterministicGame(app!.db, 2);
    const hostSocket = await connect(players[0]!.cookie);
    const guestSocket = await connect(players[1]!.cookie);
    await Promise.all([joinGame(hostSocket, gameId), joinGame(guestSocket, gameId)]);

    const overPromise = once(hostSocket, "game:over");
    guestSocket.emit("turn:resign", { gameId, idempotencyKey: "resign-before-chat" });
    await overPromise;

    const errorPromise = once<{ code: string }>(hostSocket, "error");
    hostSocket.emit("chat:send", { gameId, body: "still here?" });
    const err = await errorPromise;
    expect(err.code).toBe("conflict");
  });

  it("chat:send is rate-limited after too many messages in a short window", async () => {
    const { gameId, players } = await dealDeterministicGame(app!.db, 2);
    const hostSocket = await connect(players[0]!.cookie);
    await joinGame(hostSocket, gameId);

    // The limit is 10 messages / 10s (see realtime/rateLimit.ts) -- send 10
    // real ones (each awaited so it's actually accepted server-side before
    // continuing), then expect the 11th to be rejected.
    for (let i = 0; i < 10; i++) {
      const messagePromise = once(hostSocket, "chat:message");
      hostSocket.emit("chat:send", { gameId, body: `msg ${i}` });
      await messagePromise;
    }

    const errorPromise = once<{ code: string }>(hostSocket, "error");
    hostSocket.emit("chat:send", { gameId, body: "one too many" });
    const err = await errorPromise;
    expect(err.code).toBe("rate_limited");
  });

  it("presence:ping acks", async () => {
    const { players } = await dealDeterministicGame(app!.db, 2);
    const hostSocket = await connect(players[0]!.cookie);
    const ack = await emitAck<{ ok: boolean }>(hostSocket, "presence:ping", undefined);
    expect(ack.ok).toBe(true);
  });
});
