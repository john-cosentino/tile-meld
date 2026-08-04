import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { ensureComputerPlayer } from "../../src/db/repositories/players.js";
import { createTestAccount } from "../setup/test-account.js";

// Global unique human usernames, at the SQL-constraint level. Repository
// semantics (createAccount and its "taken" outcome) are covered in
// test/db/accounts.test.ts; the register route in test/http/account.test.ts.

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
          password_hash: "hash",
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
          password_hash: "hash",
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
          password_hash: null,
          username: "bot",
          username_canonical: "bot",
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("the partial unique index rejects a duplicate canonical username at the SQL level", async () => {
    const db = await getTestDb();
    await createTestAccount(db, "alice");

    await expect(
      db
        .insertInto("players")
        .values({
          kind: "human",
          password_hash: "hash-b",
          username: "ALICE",
          username_canonical: "alice",
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("the computer player has no username and never collides with the index", async () => {
    const db = await getTestDb();
    const computer = await ensureComputerPlayer(db);
    expect(computer.username).toBeNull();
    expect(computer.username_canonical).toBeNull();
  });
});
