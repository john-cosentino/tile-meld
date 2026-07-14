import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

// host_room_member_id is added later (0006), once room_members exists --
// a room and its host member reference each other, so the FK has to be
// bootstrapped in two steps. The host is DB-linked to a current
// room_members row (not a bare player), per the follow-up clarification.
export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .createTable("rooms")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("code", "text", (col) => col.notNull().unique())
    .addColumn("visibility", "text", (col) =>
      col.notNull().check(sql`visibility in ('private', 'public')`),
    )
    .addColumn("capacity", "smallint", (col) => col.notNull().check(sql`capacity between 2 and 4`))
    .addColumn("turn_limit_hours", "smallint", (col) =>
      col.notNull().check(sql`turn_limit_hours in (4, 8, 12, 24)`),
    )
    .addColumn("status", "text", (col) =>
      col
        .notNull()
        .defaultTo("open")
        .check(sql`status in ('open', 'in_game', 'between_games', 'closed', 'abandoned')`),
    )
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("last_activity_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Public-lobby listing query: open public rooms only.
  await db.schema
    .createIndex("rooms_public_open_idx")
    .on("rooms")
    .column("last_activity_at")
    .where(sql.ref("visibility"), "=", "public")
    .where(sql.ref("status"), "=", "open")
    .execute();
}

export async function down(db: AnyKysely): Promise<void> {
  await db.schema.dropTable("rooms").execute();
}
