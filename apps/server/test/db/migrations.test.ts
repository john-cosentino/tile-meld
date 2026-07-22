import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { closeTestDb, getTestDb, truncateAll } from "../setup/test-db.js";

describe("migrations", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(await getTestDb());
  });

  it("apply cleanly and create every expected table", async () => {
    const db = await getTestDb();
    const rows = await sql<{ table_name: string }>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name NOT LIKE 'kysely_%'
      ORDER BY table_name
    `.execute(db);

    const tableNames = rows.rows.map((r) => r.table_name).sort();
    expect(tableNames).toEqual(
      [
        "chat_messages",
        "game_events",
        "game_seats",
        "games",
        "idempotency_keys",
        "players",
        "push_subscriptions",
        "racks",
        "room_members",
        "room_scores",
        "rooms",
        "sessions",
        "table_sets",
        "turns",
      ].sort(),
    );
  });

  it("keeps room_members and game_seats as separate tables (the corrected split)", async () => {
    const db = await getTestDb();
    const roomMemberCols = await sql<{ column_name: string }>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'room_members'
    `.execute(db);
    const gameSeatCols = await sql<{ column_name: string }>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'game_seats'
    `.execute(db);

    const roomMemberColumns = roomMemberCols.rows.map((r) => r.column_name);
    const gameSeatColumns = gameSeatCols.rows.map((r) => r.column_name);

    // room_members: persistent, room-scoped, carries readiness.
    expect(roomMemberColumns).toEqual(
      expect.arrayContaining([
        "room_id",
        "player_id",
        "display_name",
        "joined_at",
        "is_ready",
        "left_at",
      ]),
    );
    // game_seats: belongs to exactly one game, references room_members.
    expect(gameSeatColumns).toEqual(
      expect.arrayContaining([
        "game_id",
        "room_member_id",
        "seat_index",
        "status",
        "has_initial_meld",
      ]),
    );
  });

  it("links rooms.host_room_member_id to room_members, not a bare player", async () => {
    const db = await getTestDb();
    const fk = await sql<{ foreign_table_name: string }>`
      SELECT ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_name = 'rooms' AND kcu.column_name = 'host_room_member_id' AND tc.constraint_type = 'FOREIGN KEY'
    `.execute(db);
    expect(fk.rows[0]?.foreign_table_name).toBe("room_members");
  });

  it("supports one down step and re-applying up again", async () => {
    const db = await getTestDb();
    const { migrateDown, migrateToLatest } = await import("../../src/db/migrator.js");
    const down = await migrateDown(db);
    expect(down.ok).toBe(true);
    const up = await migrateToLatest(db);
    expect(up.ok).toBe(true);
  });

  // Phase 7 (migration 0021): the retention sweep's candidate-query index.
  it("creates a partial index on games.completed_at, scoped to status = 'completed'", async () => {
    const db = await getTestDb();
    const rows = await sql<{ indexdef: string }>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'games' AND indexname = 'games_completed_retention_idx'
    `.execute(db);
    expect(rows.rows).toHaveLength(1);
    const indexdef = rows.rows[0]?.indexdef ?? "";
    expect(indexdef).toContain("completed_at");
    // A partial index -- WHERE (status = 'completed') -- not a plain
    // index over every game regardless of status.
    expect(indexdef).toMatch(/WHERE \(status = 'completed'::text\)/);
  });

  it("migration 0021 is additive: no column changes, index-only", async () => {
    const db = await getTestDb();
    const rows = await sql<{ column_name: string }>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'games'
    `.execute(db);
    const columns = rows.rows.map((r) => r.column_name).sort();
    expect(columns).toEqual(
      [
        "id",
        "room_id",
        "seq",
        "status",
        "pool_order",
        "pool_cursor",
        "active_seat",
        "version",
        "consecutive_passes",
        "created_at",
        "completed_at",
        "winner_seat",
        "current_turn_id",
      ].sort(),
    );
  });
});
