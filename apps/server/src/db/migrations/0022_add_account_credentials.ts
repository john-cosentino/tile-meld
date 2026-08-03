import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

// Account credentials + profile portrait (user-accounts plan, Phase A).
// Adds password/email/portrait columns and RELAXES migration 0018's
// players_recovery_hash_kind_ck: a human now needs at least one long-term
// credential (recovery_hash for legacy identities, password_hash for
// accounts), while the computer player stays structurally credential-less
// and portrait-less. Additive except for that constraint swap; governed by
// D-MIGRATE: production migrations are forward-only; down() exists for
// local/test convenience only.
export async function up(db: AnyKysely): Promise<void> {
  await db.schema
    .alterTable("players")
    .addColumn("password_hash", "text")
    .addColumn("email", "text")
    .addColumn("password_updated_at", "timestamptz")
    .addColumn("portrait_id", sql`smallint`)
    .execute();

  await sql`ALTER TABLE players DROP CONSTRAINT players_recovery_hash_kind_ck`.execute(db);

  // Humans: at least one credential (legacy recovery secret OR account
  // password). Computer: never any credential, email, or portrait -- the
  // same "nobody can authenticate as it / nothing human-flavored attaches
  // to it" invariant migration 0018 and 0019 established.
  await sql`
    ALTER TABLE players ADD CONSTRAINT players_credentials_kind_ck
    CHECK ((kind = 'human' AND (recovery_hash IS NOT NULL OR password_hash IS NOT NULL))
        OR (kind = 'computer' AND recovery_hash IS NULL AND password_hash IS NULL
            AND email IS NULL AND portrait_id IS NULL))
  `.execute(db);

  // Lower bound only: the roster size (upper bound) is an application
  // constant (PORTRAIT_COUNT in @tile-meld/shared), so growing the portrait
  // roster never needs a migration.
  await sql`
    ALTER TABLE players ADD CONSTRAINT players_portrait_id_ck
    CHECK (portrait_id IS NULL OR portrait_id >= 0)
  `.execute(db);
}

export async function down(db: AnyKysely): Promise<void> {
  await sql`ALTER TABLE players DROP CONSTRAINT IF EXISTS players_portrait_id_ck`.execute(db);
  await sql`ALTER TABLE players DROP CONSTRAINT IF EXISTS players_credentials_kind_ck`.execute(db);
  await sql`
    ALTER TABLE players ADD CONSTRAINT players_recovery_hash_kind_ck
    CHECK ((kind = 'human' AND recovery_hash IS NOT NULL)
        OR (kind = 'computer' AND recovery_hash IS NULL))
  `.execute(db);
  await db.schema
    .alterTable("players")
    .dropColumn("portrait_id")
    .dropColumn("password_updated_at")
    .dropColumn("email")
    .dropColumn("password_hash")
    .execute();
}
