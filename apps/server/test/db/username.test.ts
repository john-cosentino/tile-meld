import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import {
  claimUsername,
  createPlayer,
  ensureComputerPlayer,
} from "../../src/db/repositories/players.js";
import { COMPUTER_PLAYER_ID } from "../../src/db/botIdentity.js";

// Phase 1 -- global unique human usernames (docs/next-changes-
// implementation-plan.md). Repository- and constraint-level coverage;
// HTTP-route coverage lives in test/http/username.test.ts.

describe("claimUsername (repository)", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("claims a username for a fresh human identity", async () => {
    const db = await getTestDb();
    const player = await createPlayer(db, "secret");
    expect(player.username).toBeNull();
    expect(player.username_canonical).toBeNull();

    const outcome = await claimUsername(db, player.id, "Alice");
    expect(outcome.kind).toBe("claimed");
    if (outcome.kind !== "claimed") throw new Error("unreachable");
    expect(outcome.player.username).toBe("Alice");
    expect(outcome.player.username_canonical).toBe("alice");
  });

  it("is case-insensitively unique across two different identities", async () => {
    const db = await getTestDb();
    const alice = await createPlayer(db, "secret-a");
    const bob = await createPlayer(db, "secret-b");

    const first = await claimUsername(db, alice.id, "Alice");
    expect(first.kind).toBe("claimed");

    const second = await claimUsername(db, bob.id, "ALICE");
    expect(second.kind).toBe("taken");

    const third = await claimUsername(db, bob.id, "alice");
    expect(third.kind).toBe("taken");
  });

  it("is idempotent: reclaiming the identity's own current username succeeds without changing it", async () => {
    const db = await getTestDb();
    const player = await createPlayer(db, "secret");
    await claimUsername(db, player.id, "Alice");

    const again = await claimUsername(db, player.id, "Alice");
    expect(again.kind).toBe("already_claimed_same");
    if (again.kind !== "already_claimed_same") throw new Error("unreachable");
    expect(again.player.username).toBe("Alice");

    // Case-variant reclaim of the same identity is also treated as the same
    // canonical username, not a change.
    const sameCanonical = await claimUsername(db, player.id, "ALICE");
    expect(sameCanonical.kind).toBe("already_claimed_same");
  });

  it("rejects changing an already-claimed username to a different value", async () => {
    const db = await getTestDb();
    const player = await createPlayer(db, "secret");
    await claimUsername(db, player.id, "Alice");

    const outcome = await claimUsername(db, player.id, "Bob");
    expect(outcome.kind).toBe("already_claimed_different");

    const row = await db
      .selectFrom("players")
      .select(["username", "username_canonical"])
      .where("id", "=", player.id)
      .executeTakeFirstOrThrow();
    expect(row.username).toBe("Alice");
  });

  it("refuses to claim a username for the computer identity", async () => {
    const db = await getTestDb();
    await ensureComputerPlayer(db);

    const outcome = await claimUsername(db, COMPUTER_PLAYER_ID, "Computer2");
    expect(outcome.kind).toBe("not_human");

    const row = await db
      .selectFrom("players")
      .select(["username", "username_canonical"])
      .where("id", "=", COMPUTER_PLAYER_ID)
      .executeTakeFirstOrThrow();
    expect(row.username).toBeNull();
  });

  it("two concurrent claims for the same canonical username result in exactly one success", async () => {
    const db = await getTestDb();
    const alice = await createPlayer(db, "secret-a");
    const bob = await createPlayer(db, "secret-b");

    const [first, second] = await Promise.all([
      claimUsername(db, alice.id, "Racer"),
      claimUsername(db, bob.id, "racer"),
    ]);

    const outcomes = [first.kind, second.kind].sort();
    expect(outcomes).toEqual(["claimed", "taken"]);

    const count = await db
      .selectFrom("players")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("username_canonical", "=", "racer")
      .executeTakeFirstOrThrow();
    expect(Number(count.n)).toBe(1);
  });
});

describe("players username schema constraints (migration 0019)", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("adds the username and username_canonical columns", async () => {
    const db = await getTestDb();
    const cols = await sql<{ column_name: string }>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'players' AND column_name IN ('username', 'username_canonical')
    `.execute(db);
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual(["username", "username_canonical"]);
  });

  it("CHECK forbids setting only one of the paired columns", async () => {
    const db = await getTestDb();
    await expect(
      db
        .insertInto("players")
        .values({
          kind: "human",
          recovery_hash: "hash",
          username: "alice",
          username_canonical: null,
        })
        .execute(),
    ).rejects.toThrow();
    await expect(
      db
        .insertInto("players")
        .values({
          kind: "human",
          recovery_hash: "hash",
          username: null,
          username_canonical: "alice",
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("CHECK forbids a computer identity from having a username", async () => {
    const db = await getTestDb();
    await expect(
      db
        .insertInto("players")
        .values({
          id: "11111111-1111-1111-1111-111111111111",
          kind: "computer",
          recovery_hash: null,
          username: "bot",
          username_canonical: "bot",
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("the partial unique index rejects a duplicate canonical username at the SQL level", async () => {
    const db = await getTestDb();
    await db
      .insertInto("players")
      .values({
        kind: "human",
        recovery_hash: "hash-a",
        username: "alice",
        username_canonical: "alice",
      })
      .execute();

    await expect(
      db
        .insertInto("players")
        .values({
          kind: "human",
          recovery_hash: "hash-b",
          username: "ALICE",
          username_canonical: "alice",
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("leaves legacy/unclaimed identities with a null username", async () => {
    const db = await getTestDb();
    const player = await createPlayer(db, "secret");
    expect(player.username).toBeNull();
    expect(player.username_canonical).toBeNull();
  });
});
