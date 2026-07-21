import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { SESSION_COOKIE_NAME } from "../../src/security/session.js";
import { COMPUTER_PLAYER_ID } from "../../src/db/botIdentity.js";
import type { AppInstance } from "../../src/http/types.js";

const TEST_ENV = {
  NODE_ENV: "test" as const,
  PORT: 0,
  DATABASE_URL: "unused-app-owns-its-own-db-handle",
  SESSION_TOKEN_HMAC_SECRET: "test-hmac-secret-at-least-32-characters-long",
};

let usernameCounter = 0;
function nextTestUsername(): string {
  usernameCounter += 1;
  return `tester${usernameCounter}`;
}

async function newPlayer(
  app: AppInstance,
  username: string = nextTestUsername(),
): Promise<{ playerId: string; cookie: string; username: string }> {
  const response = await app.inject({ method: "POST", url: "/api/identity", payload: {} });
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!;
  const cookieHeader = `${SESSION_COOKIE_NAME}=${cookie.value}`;
  await app.inject({
    method: "POST",
    url: "/api/identity/username",
    headers: { cookie: cookieHeader },
    payload: { username },
  });
  return { playerId: response.json().playerId, cookie: cookieHeader, username };
}

async function createRoom(
  app: AppInstance,
  cookie: string,
  overrides: Partial<Record<string, unknown>> = {},
): Promise<{ roomId: string; code: string; name: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/rooms",
    headers: { cookie },
    payload: {
      displayName: "unused",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
      ...overrides,
    },
  });
  return response.json();
}

async function joinByName(app: AppInstance, cookie: string, name: string) {
  return app.inject({
    method: "POST",
    url: "/api/rooms/join-by-name",
    headers: { cookie },
    payload: { name },
  });
}

describe("POST /api/rooms/join-by-name", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("joins a public room by exact name", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app, "PubHost");
    const { roomId, name } = await createRoom(app, host.cookie, {
      visibility: "public",
      capacity: 3,
    });
    expect(name).toBe("public_PubHost");
    const joiner = await newPlayer(app);

    const response = await joinByName(app, joiner.cookie, name);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ roomId });

    const members = await db
      .selectFrom("room_members")
      .selectAll()
      .where("room_id", "=", roomId)
      .execute();
    expect(members).toHaveLength(2);

    await app.close();
  });

  it("joins a private room by exact name -- no code required", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app, "PrivHost");
    const { roomId, name } = await createRoom(app, host.cookie, { visibility: "private" });
    expect(name).toBe("PrivHost");
    const joiner = await newPlayer(app);

    const response = await joinByName(app, joiner.cookie, name);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ roomId });

    await app.close();
  });

  it("is case-insensitive", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app, "CaseHost");
    const { roomId, name } = await createRoom(app, host.cookie);
    const joiner = await newPlayer(app);

    const response = await joinByName(app, joiner.cookie, name.toUpperCase());
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ roomId });

    await app.close();
  });

  it("trims surrounding whitespace", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app, "TrimHost");
    const { roomId, name } = await createRoom(app, host.cookie);
    const joiner = await newPlayer(app);

    const response = await joinByName(app, joiner.cookie, `  ${name}  `);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ roomId });

    await app.close();
  });

  it("rejects a partial/prefix name -- no fuzzy matching", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app, "PrefixHost");
    await createRoom(app, host.cookie);
    const joiner = await newPlayer(app);

    const response = await joinByName(app, joiner.cookie, "Prefix");
    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it("returns 404 for a nonexistent room name", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const joiner = await newPlayer(app);

    const response = await joinByName(app, joiner.cookie, "NoSuchRoomAtAll");
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("not_found");

    await app.close();
  });

  it("returns the SAME outward failure for a terminal room as for a nonexistent name", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app, "TerminalHost");
    const { roomId, name } = await createRoom(app, host.cookie);
    await db.updateTable("rooms").set({ status: "abandoned" }).where("id", "=", roomId).execute();
    const joiner = await newPlayer(app);

    const terminalResponse = await joinByName(app, joiner.cookie, name);
    const nonexistentResponse = await joinByName(app, joiner.cookie, "NoSuchRoomAtAll");

    expect(terminalResponse.statusCode).toBe(nonexistentResponse.statusCode);
    expect(terminalResponse.json()).toEqual(nonexistentResponse.json());

    await app.close();
  });

  it("returns the SAME outward failure for a full room as for a nonexistent name", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app, "FullHost");
    const { name } = await createRoom(app, host.cookie, { capacity: 2 });
    const filler = await newPlayer(app);
    await joinByName(app, filler.cookie, name);
    const joiner = await newPlayer(app);

    const fullResponse = await joinByName(app, joiner.cookie, name);
    const nonexistentResponse = await joinByName(app, joiner.cookie, "NoSuchRoomAtAll");

    expect(fullResponse.statusCode).toBe(nonexistentResponse.statusCode);
    expect(fullResponse.json()).toEqual(nonexistentResponse.json());

    await app.close();
  });

  it("rejects joining a Play-vs-Computer room, with the same outward failure as a nonexistent name", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const human = await newPlayer(app, "BotRoomHost");
    const created = await app.inject({
      method: "POST",
      url: "/api/rooms/vs-computer",
      headers: { cookie: human.cookie },
      payload: { displayName: "unused" },
    });
    const { name } = created.json();
    const joiner = await newPlayer(app);

    const botRoomResponse = await joinByName(app, joiner.cookie, name);
    const nonexistentResponse = await joinByName(app, joiner.cookie, "NoSuchRoomAtAll");

    expect(botRoomResponse.statusCode).toBe(nonexistentResponse.statusCode);
    expect(botRoomResponse.json()).toEqual(nonexistentResponse.json());

    const members = await db
      .selectFrom("room_members")
      .selectAll()
      .where("player_id", "=", COMPUTER_PLAYER_ID)
      .execute();
    // Only the bot's own room member row exists -- the joiner never got in.
    expect(members.every((m) => m.player_id === COMPUTER_PLAYER_ID)).toBe(true);

    await app.close();
  });

  it("rejects an identity with no claimed username", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app, "NoUserHost");
    const { name } = await createRoom(app, host.cookie);

    const identity = await app.inject({ method: "POST", url: "/api/identity", payload: {} });
    const cookie = identity.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!;
    const cookieHeader = `${SESSION_COOKIE_NAME}=${cookie.value}`;

    const response = await joinByName(app, cookieHeader, name);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("username_required");

    await app.close();
  });

  it("uses the stored username as the joiner's display name -- a client-supplied one cannot override it", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app, "DisplayHost");
    const { roomId, name } = await createRoom(app, host.cookie, { capacity: 3 });
    const joiner = await newPlayer(app, "RealUsername");

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/join-by-name",
      headers: { cookie: joiner.cookie },
      // displayName isn't even part of the schema, but confirm the server
      // doesn't pick it up if present in the raw JSON body either.
      payload: { name, displayName: "AttemptedOverride" },
    });
    expect(response.statusCode).toBe(200);

    const member = await db
      .selectFrom("room_members")
      .selectAll()
      .where("room_id", "=", roomId)
      .where("player_id", "=", joiner.playerId)
      .executeTakeFirstOrThrow();
    expect(member.display_name).toBe("RealUsername");

    await app.close();
  });

  it("is idempotent for a player who already joined (reconnect support)", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app, "ReconnectHost");
    const { roomId, name } = await createRoom(app, host.cookie, { capacity: 3 });
    const joiner = await newPlayer(app);

    await joinByName(app, joiner.cookie, name);
    const second = await joinByName(app, joiner.cookie, name);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ roomId });

    const members = await db
      .selectFrom("room_members")
      .selectAll()
      .where("room_id", "=", roomId)
      .execute();
    expect(members).toHaveLength(2); // not 3 -- no duplicate row

    await app.close();
  });

  it("two concurrent joins for the last remaining seat: exactly one succeeds", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app, "RaceHost");
    // Capacity 2: host takes the first seat, exactly one more can join.
    const { roomId, name } = await createRoom(app, host.cookie, { capacity: 2 });
    const a = await newPlayer(app);
    const b = await newPlayer(app);

    const [ra, rb] = await Promise.all([
      joinByName(app, a.cookie, name),
      joinByName(app, b.cookie, name),
    ]);

    const statuses = [ra.statusCode, rb.statusCode].sort();
    expect(statuses).toEqual([200, 404]);

    const members = await db
      .selectFrom("room_members")
      .selectAll()
      .where("room_id", "=", roomId)
      .execute();
    expect(members).toHaveLength(2); // never over capacity

    await app.close();
  });

  it("private rooms are absent from the public lobby and Quick Join, but still joinable by exact name", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app, "UnlistedHost");
    const { name } = await createRoom(app, host.cookie, { visibility: "private" });
    const viewer = await newPlayer(app);

    const lobby = await app.inject({
      method: "GET",
      url: "/api/rooms/public",
      headers: { cookie: viewer.cookie },
    });
    expect(JSON.stringify(lobby.json())).not.toContain(name);

    const quickJoin = await app.inject({
      method: "POST",
      url: "/api/rooms/quick-join",
      headers: { cookie: viewer.cookie },
      payload: { displayName: "unused" },
    });
    // Nothing eligible for Quick Join -- the private room was never a
    // candidate (and no public room exists in this test).
    expect(quickJoin.statusCode).toBe(404);

    // ...yet the same private room resolves fine via exact-name join.
    const joined = await joinByName(app, viewer.cookie, name);
    expect(joined.statusCode).toBe(200);

    await app.close();
  });

  it("legacy join-by-code still works unchanged", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app, "LegacyHost");
    const created = await createRoom(app, host.cookie);
    const codeResponse = await app.inject({
      method: "GET",
      url: `/api/rooms/${created.roomId}`,
      headers: { cookie: host.cookie },
    });
    const { code } = codeResponse.json();
    const joiner = await newPlayer(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/join",
      headers: { cookie: joiner.cookie },
      payload: { code, displayName: "StillFreeText" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ roomId: created.roomId });

    // The legacy route still trusts the client-supplied display name --
    // unchanged, preserved behavior for backward compatibility.
    const member = await db
      .selectFrom("room_members")
      .selectAll()
      .where("room_id", "=", created.roomId)
      .where("player_id", "=", joiner.playerId)
      .executeTakeFirstOrThrow();
    expect(member.display_name).toBe("StillFreeText");

    await app.close();
  });
});

describe("Quick Join uses the stored username (Phase 3)", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("ignores a client-supplied displayName and uses the claimed username instead", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app, "QuickHost");
    const created = await createRoom(app, host.cookie, { visibility: "public", capacity: 3 });
    const joiner = await newPlayer(app, "QuickJoiner");

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/quick-join",
      headers: { cookie: joiner.cookie },
      payload: { displayName: "IgnoredFreeText" },
    });
    expect(response.statusCode).toBe(200);

    const member = await db
      .selectFrom("room_members")
      .selectAll()
      .where("room_id", "=", created.roomId)
      .where("player_id", "=", joiner.playerId)
      .executeTakeFirstOrThrow();
    expect(member.display_name).toBe("QuickJoiner");

    await app.close();
  });

  it("rejects Quick Join for an identity with no claimed username", async () => {
    const db = await getTestDb();
    const app = await buildApp({ db, env: TEST_ENV, logger: false });
    const host = await newPlayer(app, "QuickHost2");
    await createRoom(app, host.cookie, { visibility: "public", capacity: 3 });

    const identity = await app.inject({ method: "POST", url: "/api/identity", payload: {} });
    const cookie = identity.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!;
    const cookieHeader = `${SESSION_COOKIE_NAME}=${cookie.value}`;

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms/quick-join",
      headers: { cookie: cookieHeader },
      payload: { displayName: "X" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("username_required");

    await app.close();
  });
});
