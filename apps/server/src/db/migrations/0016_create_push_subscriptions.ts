import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .createTable("push_subscriptions")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("player_id", "uuid", (col) => col.notNull().references("players.id"))
    .addColumn("endpoint", "text", (col) => col.notNull().unique())
    .addColumn("p256dh", "text", (col) => col.notNull())
    .addColumn("auth", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("last_success_at", "timestamptz")
    .addColumn("failure_count", "integer", (col) => col.notNull().defaultTo(0))
    .execute();
}

export async function down(db: AnyKysely): Promise<void> {
  await db.schema.dropTable("push_subscriptions").execute();
}
