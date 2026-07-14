import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .createTable("turns")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("game_id", "uuid", (col) => col.notNull().references("games.id"))
    .addColumn("seat_index", "smallint", (col) => col.notNull())
    // "invalid_commit" is distinct from "timed_out" -- a rejected
    // submission is forfeited by the active player's own rejected
    // commit, not a missed deadline; kept separate for accurate dispute
    // records.
    .addColumn("status", "text", (col) =>
      col
        .notNull()
        .check(
          sql`status in ('pending', 'active', 'committed', 'invalid_commit', 'drawn', 'passed', 'resigned', 'timed_out')`,
        ),
    )
    .addColumn("started_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("deadline_at", "timestamptz", (col) => col.notNull())
    .addColumn("warned_at", "timestamptz")
    .addColumn("resolved_at", "timestamptz")
    // integer, not bigint -- same node-postgres string-return footgun as
    // games.version (see 0007_create_games.ts); this stores the same
    // counter.
    .addColumn("version_at_start", "integer", (col) => col.notNull())
    .addForeignKeyConstraint("turns_game_seat_fk", ["game_id", "seat_index"], "game_seats", [
      "game_id",
      "seat_index",
    ])
    .execute();

  // Serves both the deadline sweep (`status='active' AND deadline_at <=
  // now()`) and the 15-minute-warning query (`status='active' AND
  // deadline_at > now() AND deadline_at <= now() + interval '15 minutes'`).
  await db.schema
    .createIndex("turns_active_deadline_idx")
    .on("turns")
    .column("deadline_at")
    .where(sql.ref("status"), "=", "active")
    .execute();
}

export async function down(db: AnyKysely): Promise<void> {
  await db.schema.dropTable("turns").execute();
}
