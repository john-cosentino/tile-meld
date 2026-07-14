import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .createTable("players")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    // Argon2id hash of the long-term recovery secret. The raw secret is
    // never stored -- see docs/opus-implementation-plan.md D-IDENTITY.
    .addColumn("recovery_hash", "text", (col) => col.notNull())
    .addColumn("recovery_rotated_at", "timestamptz")
    .addColumn("display_name_default", "text")
    .execute();
}

export async function down(db: AnyKysely): Promise<void> {
  await db.schema.dropTable("players").execute();
}
