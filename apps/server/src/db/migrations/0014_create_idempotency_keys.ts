import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

// Scoped by (player_id, key) -- a client-generated key is only guaranteed
// unique per player, not globally. Persists the full original result so a
// duplicate request can be answered without reprocessing, not just a hash.
export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .createTable("idempotency_keys")
    .addColumn("player_id", "uuid", (col) => col.notNull().references("players.id"))
    .addColumn("key", "text", (col) => col.notNull())
    .addColumn("game_id", "uuid", (col) => col.references("games.id"))
    .addColumn("result_payload", "jsonb", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("idempotency_keys_pk", ["player_id", "key"])
    .execute();
}

export async function down(db: AnyKysely): Promise<void> {
  await db.schema.dropTable("idempotency_keys").execute();
}
