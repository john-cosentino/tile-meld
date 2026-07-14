import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

// Redaction-safe transition/audit trail -- payload must never contain
// hidden rack contents. Canonical state lives in games/racks/table_sets;
// this is not a complete-replay source. See docs/opus-implementation-plan.md
// D-EVENTLOG.
export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .createTable("game_events")
    .addColumn("id", "bigserial", (col) => col.primaryKey())
    .addColumn("game_id", "uuid", (col) => col.notNull().references("games.id"))
    .addColumn("seq", "integer", (col) => col.notNull())
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("seat_index", "smallint")
    .addColumn("payload", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("game_events_game_seq_idx")
    .on("game_events")
    .columns(["game_id", "seq"])
    .unique()
    .execute();
}

export async function down(db: AnyKysely): Promise<void> {
  await db.schema.dropTable("game_events").execute();
}
