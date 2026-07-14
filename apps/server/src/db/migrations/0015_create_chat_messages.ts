import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

// Always game-scoped (never room-scoped). Becomes read-only once the game
// completes and a rematch starts a fresh history -- enforced at the
// application layer (Phase 4/5), not by this schema.
export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .createTable("chat_messages")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("game_id", "uuid", (col) => col.notNull().references("games.id"))
    .addColumn("seat_index", "smallint")
    .addColumn("sender_player_id", "uuid", (col) => col.notNull().references("players.id"))
    .addColumn("body", "text", (col) => col.notNull().check(sql`char_length(body) <= 500`))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("chat_messages_game_created_idx")
    .on("chat_messages")
    .columns(["game_id", "created_at"])
    .execute();
}

export async function down(db: AnyKysely): Promise<void> {
  await db.schema.dropTable("chat_messages").execute();
}
