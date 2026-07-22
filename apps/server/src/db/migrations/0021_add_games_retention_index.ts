import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

// Phase 7 (docs/next-changes-implementation-plan.md, corrected to a fixed
// 48-hour window -- see the amendment at the top of that plan): the
// retention sweep's candidate query is
//   SELECT ... FROM games WHERE status = 'completed' AND completed_at <= ?
//   ORDER BY completed_at ASC LIMIT ?
// A partial index on `completed_at`, scoped to status = 'completed' only
// (mirroring rooms_public_open_idx's partial-index convention, migration
// 0004), gives that query both the filter and the ascending scan order for
// free -- no new column, no data rewrite, additive and production-safe.
export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .createIndex("games_completed_retention_idx")
    .on("games")
    .column("completed_at")
    .where(sql.ref("status"), "=", "completed")
    .execute();
}

export async function down(db: AnyKysely): Promise<void> {
  await db.schema.dropIndex("games_completed_retention_idx").execute();
}
