import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";
import { createPlayer } from "../../src/db/repositories/players.js";
import { createRoom, createComputerRoom } from "../../src/db/repositories/rooms.js";
import { ensureComputerPlayer } from "../../src/db/repositories/players.js";

// Phase 2 -- human-readable room names (docs/next-changes-implementation-
// plan.md). Repository- and constraint-level coverage of the allocation
// algorithm; HTTP-level coverage (username_required, response shape) lives
// in test/http/rooms.test.ts and test/http/vsComputer.test.ts.

async function createHostPlayer(db: Awaited<ReturnType<typeof getTestDb>>, secret: string) {
  return createPlayer(db, secret);
}

describe("room name allocation (repository)", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("names the first private room after the bare username", async () => {
    const db = await getTestDb();
    const player = await createHostPlayer(db, "s1");
    const { room } = await createRoom(db, {
      creatorPlayerId: player.id,
      creatorUsername: "John",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
    });
    expect(room.name).toBe("John");
  });

  it("numbers subsequent private rooms from the same creator with the smallest available suffix", async () => {
    const db = await getTestDb();
    const player = await createHostPlayer(db, "s1");
    const names: (string | null)[] = [];
    for (let i = 0; i < 3; i++) {
      const { room } = await createRoom(db, {
        creatorPlayerId: player.id,
        creatorUsername: "John",
        capacity: 2,
        visibility: "private",
        turnLimitHours: 4,
      });
      names.push(room.name);
    }
    expect(names).toEqual(["John", "John 1", "John 2"]);
  });

  it("prefixes public rooms with public_ and numbers them independently", async () => {
    const db = await getTestDb();
    const player = await createHostPlayer(db, "s1");
    const names: (string | null)[] = [];
    for (let i = 0; i < 2; i++) {
      const { room } = await createRoom(db, {
        creatorPlayerId: player.id,
        creatorUsername: "John",
        capacity: 2,
        visibility: "public",
        turnLimitHours: 4,
      });
      names.push(room.name);
    }
    expect(names).toEqual(["public_John", "public_John 1"]);
  });

  it("keeps private and public namespaces distinct for the same creator", async () => {
    const db = await getTestDb();
    const player = await createHostPlayer(db, "s1");
    const { room: privateRoom } = await createRoom(db, {
      creatorPlayerId: player.id,
      creatorUsername: "John",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
    });
    const { room: publicRoom } = await createRoom(db, {
      creatorPlayerId: player.id,
      creatorUsername: "John",
      capacity: 2,
      visibility: "public",
      turnLimitHours: 4,
    });
    // Both get the un-suffixed base name in their own namespace -- the
    // public_ prefix is what keeps them from colliding.
    expect(privateRoom.name).toBe("John");
    expect(publicRoom.name).toBe("public_John");
  });

  it("Play vs Computer rooms follow the private naming convention", async () => {
    const db = await getTestDb();
    await ensureComputerPlayer(db);
    const player = await createHostPlayer(db, "s1");
    const { room } = await createComputerRoom(db, {
      humanPlayerId: player.id,
      humanUsername: "Solo",
    });
    expect(room.name).toBe("Solo");
    expect(room.visibility).toBe("private");
  });

  it("reuses the smallest suffix once an older room is no longer relevant (abandoned)", async () => {
    const db = await getTestDb();
    const player = await createHostPlayer(db, "s1");
    const { room: first } = await createRoom(db, {
      creatorPlayerId: player.id,
      creatorUsername: "John",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
    });
    const { room: second } = await createRoom(db, {
      creatorPlayerId: player.id,
      creatorUsername: "John",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
    });
    expect([first.name, second.name]).toEqual(["John", "John 1"]);

    // "John" (the un-suffixed room) becomes terminal -- abandoned -- and no
    // longer reserves the name.
    await db.updateTable("rooms").set({ status: "abandoned" }).where("id", "=", first.id).execute();

    const { room: third } = await createRoom(db, {
      creatorPlayerId: player.id,
      creatorUsername: "John",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
    });
    // Smallest available: "John" is free again (abandoned), "John 1" is
    // still taken by `second`, so the next room gets "John" back, not
    // "John 2".
    expect(third.name).toBe("John");

    // The abandoned room's own name is untouched -- immutable history.
    const reloaded = await db
      .selectFrom("rooms")
      .select(["name", "status"])
      .where("id", "=", first.id)
      .executeTakeFirstOrThrow();
    expect(reloaded.name).toBe("John");
    expect(reloaded.status).toBe("abandoned");
  });

  it("closed rooms also free their name (same terminal treatment as abandoned)", async () => {
    const db = await getTestDb();
    const player = await createHostPlayer(db, "s1");
    const { room: first } = await createRoom(db, {
      creatorPlayerId: player.id,
      creatorUsername: "Jane",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
    });
    await db.updateTable("rooms").set({ status: "closed" }).where("id", "=", first.id).execute();

    const { room: second } = await createRoom(db, {
      creatorPlayerId: player.id,
      creatorUsername: "Jane",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 4,
    });
    expect(second.name).toBe("Jane");
  });

  it("two concurrent creations by the same identity/base produce distinct names", async () => {
    const db = await getTestDb();
    const player = await createHostPlayer(db, "s1");

    const [a, b] = await Promise.all([
      createRoom(db, {
        creatorPlayerId: player.id,
        creatorUsername: "Race",
        capacity: 2,
        visibility: "private",
        turnLimitHours: 4,
      }),
      createRoom(db, {
        creatorPlayerId: player.id,
        creatorUsername: "Race",
        capacity: 2,
        visibility: "private",
        turnLimitHours: 4,
      }),
    ]);

    expect(a.room.name).not.toBe(b.room.name);
    expect([a.room.name, b.room.name].sort()).toEqual(["Race", "Race 1"]);
  });
});

describe("rooms.name schema constraints (migration 0020)", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("adds the name column", async () => {
    const db = await getTestDb();
    const cols = await sql<{ column_name: string }>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'rooms' AND column_name = 'name'
    `.execute(db);
    expect(cols.rows.map((r) => r.column_name)).toEqual(["name"]);
  });

  it("allows multiple legacy rooms with a null name", async () => {
    const db = await getTestDb();
    await db
      .insertInto("rooms")
      .values([
        { code: "AAAAAAAA", visibility: "private", capacity: 2, turn_limit_hours: 4 },
        { code: "BBBBBBBB", visibility: "private", capacity: 2, turn_limit_hours: 4 },
      ])
      .execute();
    const rooms = await db.selectFrom("rooms").select(["name"]).execute();
    expect(rooms.every((r) => r.name === null)).toBe(true);
  });

  it("the partial unique index rejects a case-variant duplicate name among non-terminal rooms", async () => {
    const db = await getTestDb();
    await db
      .insertInto("rooms")
      .values({
        code: "CCCCCCCC",
        name: "john",
        visibility: "private",
        capacity: 2,
        turn_limit_hours: 4,
        status: "open",
      })
      .execute();

    await expect(
      db
        .insertInto("rooms")
        .values({
          code: "DDDDDDDD",
          name: "JOHN",
          visibility: "private",
          capacity: 2,
          turn_limit_hours: 4,
          status: "open",
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("the partial unique index does not block the same name once the first room is terminal", async () => {
    const db = await getTestDb();
    await db
      .insertInto("rooms")
      .values({
        code: "EEEEEEEE",
        name: "jane",
        visibility: "private",
        capacity: 2,
        turn_limit_hours: 4,
        status: "abandoned",
      })
      .execute();

    await expect(
      db
        .insertInto("rooms")
        .values({
          code: "FFFFFFFF",
          name: "jane",
          visibility: "private",
          capacity: 2,
          turn_limit_hours: 4,
          status: "open",
        })
        .execute(),
    ).resolves.not.toThrow();
  });
});
