import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .createTable("racks")
    .addColumn("game_id", "uuid", (col) => col.notNull())
    .addColumn("seat_index", "smallint", (col) => col.notNull())
    // tileIds. Hidden data -- must only ever be returned to its own seat's
    // viewer; see redactGameFor.
    .addColumn("tiles", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addPrimaryKeyConstraint("racks_pk", ["game_id", "seat_index"])
    .addForeignKeyConstraint("racks_game_seat_fk", ["game_id", "seat_index"], "game_seats", [
      "game_id",
      "seat_index",
    ])
    .execute();
}

export async function down(db: AnyKysely): Promise<void> {
  await db.schema.dropTable("racks").execute();
}
