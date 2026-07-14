import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .createTable("sessions")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("player_id", "uuid", (col) =>
      col.notNull().references("players.id").onDelete("cascade"),
    )
    // Deterministic keyed HMAC-SHA256 of the session token, NOT Argon2id --
    // this needs indexed lookup by token, which a slow deliberately-
    // non-deterministic hash cannot support. See D-IDENTITY.
    .addColumn("token_hash", "text", (col) => col.notNull().unique())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("last_seen_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("revoked_at", "timestamptz")
    .execute();

  await db.schema
    .createIndex("sessions_player_id_idx")
    .on("sessions")
    .column("player_id")
    .execute();
}

export async function down(db: AnyKysely): Promise<void> {
  await db.schema.dropTable("sessions").execute();
}
