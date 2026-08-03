import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

// Password-reset tokens (user-accounts plan, Phase A). Single-use,
// short-TTL, stored only as an HMAC hash (same deterministic-lookup
// rationale as sessions.token_hash -- see security/hashing.ts). Rows are
// consumed by a guarded UPDATE setting used_at; expiry is enforced on read,
// so no sweep is required (the table stays tiny: rows are superseded on each
// new request and cascade-deleted with their player).
export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .createTable("password_reset_tokens")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("player_id", "uuid", (col) =>
      col.notNull().references("players.id").onDelete("cascade"),
    )
    .addColumn("token_hash", "text", (col) => col.notNull().unique())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("used_at", "timestamptz")
    .execute();

  await db.schema
    .createIndex("password_reset_tokens_player_id_idx")
    .on("password_reset_tokens")
    .column("player_id")
    .execute();
}

export async function down(db: AnyKysely): Promise<void> {
  await db.schema.dropTable("password_reset_tokens").ifExists().execute();
}
