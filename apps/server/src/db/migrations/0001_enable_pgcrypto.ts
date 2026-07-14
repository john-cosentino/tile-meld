import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

export async function up(db: AnyKysely): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.execute(db);
}

// Down migrations are for local-dev convenience only and are never relied
// on in production -- see docs/opus-implementation-plan.md D-MIGRATE.
export async function down(db: AnyKysely): Promise<void> {
  await sql`DROP EXTENSION IF EXISTS pgcrypto`.execute(db);
}
