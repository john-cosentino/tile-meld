import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

// game_seats belong to exactly one game instance and are created from
// *ready* room members when that game starts. They are never physically
// deleted when a game ends -- they become immutable historical records
// governed by the retention policy, not by any cleanup logic here.
export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .createTable("game_seats")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("game_id", "uuid", (col) => col.notNull().references("games.id"))
    .addColumn("room_member_id", "uuid", (col) => col.notNull().references("room_members.id"))
    .addColumn("player_id", "uuid", (col) => col.notNull().references("players.id"))
    .addColumn("seat_index", "smallint", (col) => col.notNull())
    .addColumn("display_name", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) =>
      col
        .notNull()
        .defaultTo("active")
        .check(sql`status in ('active', 'resigned')`),
    )
    .addColumn("has_initial_meld", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("join_order", "integer", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("game_seats_game_seat_idx")
    .on("game_seats")
    .columns(["game_id", "seat_index"])
    .unique()
    .execute();

  await db.schema
    .createIndex("game_seats_game_member_idx")
    .on("game_seats")
    .columns(["game_id", "room_member_id"])
    .unique()
    .execute();
}

export async function down(db: AnyKysely): Promise<void> {
  await db.schema.dropTable("game_seats").execute();
}
