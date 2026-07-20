import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

// Global unique human usernames (docs/next-changes-implementation-plan.md,
// Phase 1, DR-1/DR-2). Purely additive: unlike migration 0018's
// credential-less computer player, nothing else in the schema references
// these two columns, so there is no dependent data for down() to protect --
// it is safe to run at any time, not just pre-production. Still governed by
// D-MIGRATE: production migrations are forward-only; down() exists for
// local/test convenience only.
export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .alterTable("players")
    .addColumn("username", "text")
    .addColumn("username_canonical", "text")
    .execute();

  // Both columns travel together: a claimed identity has both set (from the
  // same claim), an unclaimed one has neither.
  await sql`
    ALTER TABLE players ADD CONSTRAINT players_username_pair_ck
    CHECK ((username IS NULL AND username_canonical IS NULL)
        OR (username IS NOT NULL AND username_canonical IS NOT NULL))
  `.execute(db);

  // Computer identities never participate in the human username namespace
  // (players.kind is the authoritative discriminator -- migration 0018).
  await sql`
    ALTER TABLE players ADD CONSTRAINT players_username_human_only_ck
    CHECK (kind = 'human' OR username_canonical IS NULL)
  `.execute(db);

  // Case-insensitive global uniqueness among human identities, via the
  // lowercase canonical form. Partial (WHERE kind='human') so the computer
  // player -- whose username_canonical is structurally always NULL, per the
  // CHECK above -- is never even considered, and the index stays small.
  // (Postgres unique indexes already treat NULLs as distinct from one
  // another, so unclaimed humans don't need special-casing here either.)
  await sql`
    CREATE UNIQUE INDEX players_username_canonical_human_uk
    ON players (username_canonical)
    WHERE kind = 'human'
  `.execute(db);
}

export async function down(db: AnyKysely): Promise<void> {
  await sql`DROP INDEX IF EXISTS players_username_canonical_human_uk`.execute(db);
  await sql`ALTER TABLE players DROP CONSTRAINT IF EXISTS players_username_human_only_ck`.execute(
    db,
  );
  await sql`ALTER TABLE players DROP CONSTRAINT IF EXISTS players_username_pair_ck`.execute(db);
  await db.schema
    .alterTable("players")
    .dropColumn("username_canonical")
    .dropColumn("username")
    .execute();
}
