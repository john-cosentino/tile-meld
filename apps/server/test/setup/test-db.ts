import { sql, type Kysely } from "kysely";
import { createDb } from "../../src/db/connection.js";
import { migrateToLatest } from "../../src/db/migrator.js";
import type { Database } from "../../src/db/types.js";

const TEST_DATABASE_URL =
  process.env["TEST_DATABASE_URL"] ??
  process.env["DATABASE_URL"] ??
  "postgres://tilemeld:tilemeld@localhost:5432/tilemeld";

let db: Kysely<Database> | undefined;

/** Lazily connects and migrates to latest. Reused across a whole test
 * file -- callers truncate between tests rather than reconnecting. */
export async function getTestDb(): Promise<Kysely<Database>> {
  if (!db) {
    db = createDb(TEST_DATABASE_URL);
    const result = await migrateToLatest(db);
    if (!result.ok) {
      throw new Error(`Test DB migration failed: ${String(result.error)}`);
    }
  }
  return db;
}

// Dependency order matters for TRUNCATE ... CASCADE to be unambiguous,
// though CASCADE would handle it regardless -- listed for readability.
const TABLES = [
  "room_scores",
  "push_subscriptions",
  "chat_messages",
  "idempotency_keys",
  "game_events",
  "turns",
  "table_sets",
  "racks",
  "game_seats",
  "games",
  "room_members",
  "rooms",
  "sessions",
  "players",
] as const;

export async function truncateAll(database: Kysely<Database>): Promise<void> {
  await sql`TRUNCATE TABLE ${sql.raw(TABLES.join(", "))} RESTART IDENTITY CASCADE`.execute(
    database,
  );
}

export async function closeTestDb(): Promise<void> {
  if (db) {
    await db.destroy();
    db = undefined;
  }
}
