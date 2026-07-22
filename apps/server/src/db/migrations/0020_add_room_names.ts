import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

// Human-readable room names derived from the creator's globally unique
// username (Phase 2: docs/next-changes-implementation-plan.md). Purely
// additive; nothing else references this column. `name` is server-
// generated only (never free user input -- see the rooms repository), so
// the partial unique index below is the sole authority on availability;
// the app-level allocator (nextCandidateRoomName + retry-on-23505) is a
// fast-path hint, not a second source of truth.
export async function up(db: AnyKysely): Promise<void> {
  await db.schema.alterTable("rooms").addColumn("name", "text").execute();

  // Case-insensitively unique among the room's CURRENT relevance window
  // (open/in_game/between_games) only -- a terminal (closed/abandoned)
  // room's name is retained (immutable, per docs plan) but no longer
  // reserves the slot, so a later room may reuse the same numbered name.
  // Private "John" and public "public_John" never collide: the `public_`
  // prefix is baked into the generated string itself, so no extra
  // visibility scoping is needed here. Multiple legacy NULL names are
  // unaffected -- Postgres unique indexes already treat NULLs as distinct
  // from one another.
  await sql`
    CREATE UNIQUE INDEX rooms_name_lower_uk
    ON rooms (lower(name))
    WHERE status IN ('open', 'in_game', 'between_games')
  `.execute(db);
}

export async function down(db: AnyKysely): Promise<void> {
  await sql`DROP INDEX IF EXISTS rooms_name_lower_uk`.execute(db);
  await db.schema.alterTable("rooms").dropColumn("name").execute();
}
