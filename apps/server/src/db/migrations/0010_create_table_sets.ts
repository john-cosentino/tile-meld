import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

// The full set of table_sets rows for a game is replaced wholesale on
// every accepted commit, mirroring the pure engine's GameState.table.
export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .createTable("table_sets")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("game_id", "uuid", (col) => col.notNull().references("games.id"))
    .addColumn("ordinal", "integer", (col) => col.notNull())
    .addColumn("kind", "text", (col) => col.notNull().check(sql`kind in ('run', 'group')`))
    .addColumn("tiles", sql`text[]`, (col) => col.notNull())
    .addColumn("joker_repr", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .execute();

  await db.schema
    .createIndex("table_sets_game_id_idx")
    .on("table_sets")
    .column("game_id")
    .execute();
}

export async function down(db: AnyKysely): Promise<void> {
  await db.schema.dropTable("table_sets").execute();
}
