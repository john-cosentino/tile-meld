import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

// current_turn_id is added later (0012), once turns exists -- same
// circular-reference bootstrap pattern as rooms/room_members.
export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .createTable("games")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("room_id", "uuid", (col) => col.notNull().references("rooms.id"))
    .addColumn("seq", "integer", (col) => col.notNull())
    .addColumn("status", "text", (col) =>
      col.notNull().check(sql`status in ('active', 'completed')`),
    )
    // Persisted secure shuffle as it stood at deal time (does not include
    // dealt rack tiles); pool_cursor counts tiles drawn from its end since.
    .addColumn("pool_order", sql`text[]`, (col) => col.notNull())
    .addColumn("pool_cursor", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("active_seat", "smallint", (col) => col.notNull())
    // integer, not bigint: node-postgres returns bigint columns as
    // strings (to avoid precision loss for values a JS number can't
    // represent), which silently turns `version + 1` into string
    // concatenation. A game will never approach integer's ~2.1 billion
    // range, so there's no reason to take on that footgun.
    .addColumn("version", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("consecutive_passes", "smallint", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("completed_at", "timestamptz")
    .addColumn("winner_seat", "smallint")
    .execute();

  await db.schema
    .createIndex("games_room_seq_idx")
    .on("games")
    .columns(["room_id", "seq"])
    .unique()
    .execute();
}

export async function down(db: AnyKysely): Promise<void> {
  await db.schema.dropTable("games").execute();
}
