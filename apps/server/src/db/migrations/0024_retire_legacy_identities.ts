import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

// Phase F (accounts plan; user decision 2026-08-04: "I don't care about
// recovery codes... removing old usernames/games is fine"): DESTRUCTIVE,
// deliberate, forward-only.
//
// 1. Purges every legacy human identity (password_hash IS NULL) together
//    with every room it ever belonged to and those rooms' full game
//    subtrees -- freeing the legacy usernames for re-registration. The
//    deletion order mirrors db/repositories/retention.ts's proven
//    deleteGameSubtree/maybeDeleteRoom ordering (games.current_turn_id
//    nulled first; racks/turns before game_seats via their composite FKs;
//    room_members cascade from rooms; sessions and password_reset_tokens
//    cascade from players; push_subscriptions and idempotency_keys have
//    no cascade and are deleted explicitly).
// 2. Drops the recovery credential columns and tightens the credentials
//    CHECK: every human now MUST have a password.
export async function up(db: AnyKysely): Promise<void> {
  await sql`
    CREATE TEMP TABLE _legacy_players AS
    SELECT id FROM players WHERE kind = 'human' AND password_hash IS NULL
  `.execute(db);
  await sql`
    CREATE TEMP TABLE _legacy_rooms AS
    SELECT DISTINCT room_id AS id FROM room_members
    WHERE player_id IN (SELECT id FROM _legacy_players)
  `.execute(db);
  await sql`
    CREATE TEMP TABLE _legacy_games AS
    SELECT id FROM games WHERE room_id IN (SELECT id FROM _legacy_rooms)
  `.execute(db);

  await sql`UPDATE games SET current_turn_id = NULL WHERE id IN (SELECT id FROM _legacy_games)`.execute(
    db,
  );
  await sql`DELETE FROM racks WHERE game_id IN (SELECT id FROM _legacy_games)`.execute(db);
  await sql`DELETE FROM turns WHERE game_id IN (SELECT id FROM _legacy_games)`.execute(db);
  await sql`DELETE FROM game_seats WHERE game_id IN (SELECT id FROM _legacy_games)`.execute(db);
  await sql`DELETE FROM table_sets WHERE game_id IN (SELECT id FROM _legacy_games)`.execute(db);
  await sql`DELETE FROM game_events WHERE game_id IN (SELECT id FROM _legacy_games)`.execute(db);
  await sql`
    DELETE FROM idempotency_keys
    WHERE game_id IN (SELECT id FROM _legacy_games)
       OR player_id IN (SELECT id FROM _legacy_players)
  `.execute(db);
  await sql`DELETE FROM chat_messages WHERE game_id IN (SELECT id FROM _legacy_games)`.execute(db);
  await sql`DELETE FROM games WHERE id IN (SELECT id FROM _legacy_games)`.execute(db);
  // room_members and the rooms' host_room_member back-reference cascade
  // away with the rooms themselves (room_members.room_id ON DELETE CASCADE).
  await sql`DELETE FROM room_scores WHERE room_id IN (SELECT id FROM _legacy_rooms)`.execute(db);
  await sql`DELETE FROM rooms WHERE id IN (SELECT id FROM _legacy_rooms)`.execute(db);
  await sql`
    DELETE FROM push_subscriptions WHERE player_id IN (SELECT id FROM _legacy_players)
  `.execute(db);
  // sessions + password_reset_tokens cascade from players.
  await sql`DELETE FROM players WHERE id IN (SELECT id FROM _legacy_players)`.execute(db);

  await sql`DROP TABLE _legacy_games`.execute(db);
  await sql`DROP TABLE _legacy_rooms`.execute(db);
  await sql`DROP TABLE _legacy_players`.execute(db);

  await sql`ALTER TABLE players DROP CONSTRAINT players_credentials_kind_ck`.execute(db);
  await db.schema
    .alterTable("players")
    .dropColumn("recovery_hash")
    .dropColumn("recovery_rotated_at")
    .execute();
  await sql`
    ALTER TABLE players ADD CONSTRAINT players_credentials_kind_ck
    CHECK ((kind = 'human' AND password_hash IS NOT NULL)
        OR (kind = 'computer' AND password_hash IS NULL
            AND email IS NULL AND portrait_id IS NULL))
  `.execute(db);
}

export async function down(db: AnyKysely): Promise<void> {
  // The purged rows are unrecoverable (forward-only policy, D-MIGRATE);
  // this only restores the schema shape for local/test convenience.
  await sql`ALTER TABLE players DROP CONSTRAINT IF EXISTS players_credentials_kind_ck`.execute(db);
  await db.schema
    .alterTable("players")
    .addColumn("recovery_hash", "text")
    .addColumn("recovery_rotated_at", "timestamptz")
    .execute();
  await sql`
    ALTER TABLE players ADD CONSTRAINT players_credentials_kind_ck
    CHECK ((kind = 'human' AND (recovery_hash IS NOT NULL OR password_hash IS NOT NULL))
        OR (kind = 'computer' AND recovery_hash IS NULL AND password_hash IS NULL
            AND email IS NULL AND portrait_id IS NULL))
  `.execute(db);
}
