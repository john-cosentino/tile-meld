import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

// Room members are persistent: they exist before any game starts and
// survive the between-games/rematch lifecycle. They are distinct from
// game_seats, which belong to exactly one game instance.
export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .createTable("room_members")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("room_id", "uuid", (col) => col.notNull().references("rooms.id").onDelete("cascade"))
    .addColumn("player_id", "uuid", (col) => col.notNull().references("players.id"))
    .addColumn("display_name", "text", (col) => col.notNull())
    .addColumn("joined_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("is_ready", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("left_at", "timestamptz")
    .execute();

  // Display-name uniqueness is within a room, not global.
  await db.schema
    .createIndex("room_members_room_display_name_idx")
    .on("room_members")
    .expression(sql`room_id, lower(display_name)`)
    .unique()
    .execute();

  await db.schema
    .createIndex("room_members_room_player_idx")
    .on("room_members")
    .columns(["room_id", "player_id"])
    .unique()
    .execute();
}

export async function down(db: AnyKysely): Promise<void> {
  await db.schema.dropTable("room_members").execute();
}
