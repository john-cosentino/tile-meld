import type { AnyKysely } from "../migration-types.js";

export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .createTable("room_scores")
    .addColumn("room_id", "uuid", (col) => col.notNull().references("rooms.id"))
    .addColumn("player_id", "uuid", (col) => col.notNull().references("players.id"))
    .addColumn("cumulative_score", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("games_played", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("games_won", "integer", (col) => col.notNull().defaultTo(0))
    .addPrimaryKeyConstraint("room_scores_pk", ["room_id", "player_id"])
    .execute();
}

export async function down(db: AnyKysely): Promise<void> {
  await db.schema.dropTable("room_scores").execute();
}
