import { sql } from "kysely";
import type { AnyKysely } from "../migration-types.js";

// These literals MUST match apps/server/src/db/botIdentity.ts. They are
// inlined (not imported) on purpose: a migration is an immutable historical
// snapshot and must not depend on mutable app constants -- and Kysely's
// FileMigrationProvider dynamic-imports migration files, which does not
// resolve cross-directory sibling `.ts` imports in the test runtime.
const COMPUTER_PLAYER_ID = "00000000-0000-0000-0000-000000000b01";
const COMPUTER_DISPLAY_NAME = "Computer";

// Computer-opponent V1 domain model (docs plan §5, D-BOT1/1a/3/7).
//
// Authority & consistency model:
//  - players.kind is the AUTHORITATIVE identity classification.
//  - game_seats.controller_type is an immutable historical SNAPSHOT taken from
//    players.kind at deal time.
//  - room_members.controller_type and rooms.has_computer are DENORMALIZED
//    conveniences, written transactionally from the authoritative source and
//    never treated as authority on their own.
//
// AMENDMENT 1 -- reversibility: `down()` is safe ONLY while no dependent bot
// data exists (a fresh or test database, before any computer game). Once the
// credential-less computer player has dependent rows (room_members,
// game_seats, room_scores, idempotency_keys, game_events, turns), deleting it
// would FK-fail and dropping columns would lose historical accuracy. Production
// rollback disables new bot-room creation via the ENABLE_COMPUTER_OPPONENT
// flag and, when a schema change is genuinely required, uses a forward
// corrective migration -- never this destructive `down()`.
export async function up(db: AnyKysely): Promise<void> {
  // players.kind + credential-less computer players. The cross-column CHECK
  // structurally guarantees every human has a recovery_hash and no computer
  // ever does -- so no fake credential is ever created to satisfy an FK.
  await db.schema
    .alterTable("players")
    .addColumn("kind", "text", (col) =>
      col
        .notNull()
        .defaultTo("human")
        .check(sql`kind in ('human', 'computer')`),
    )
    .execute();

  await db.schema
    .alterTable("players")
    .alterColumn("recovery_hash", (col) => col.dropNotNull())
    .execute();

  await sql`
    ALTER TABLE players ADD CONSTRAINT players_recovery_hash_kind_ck
    CHECK ((kind = 'human' AND recovery_hash IS NOT NULL)
        OR (kind = 'computer' AND recovery_hash IS NULL))
  `.execute(db);

  // Composite-FK target: lets room_members/game_seats bind (player_id,
  // controller_type) to (id, kind) so a controller_type can NEVER disagree
  // with the authoritative players.kind (docs plan §5, Amendment 3). id is
  // already unique, so (id, kind) is trivially unique.
  await sql`ALTER TABLE players ADD CONSTRAINT players_id_kind_uk UNIQUE (id, kind)`.execute(db);

  // controller_type: denormalized on room_members (cheap bot-seat lookup),
  // immutable snapshot on game_seats; bot_kind snapshots the bot version.
  await db.schema
    .alterTable("room_members")
    .addColumn("controller_type", "text", (col) =>
      col
        .notNull()
        .defaultTo("human")
        .check(sql`controller_type in ('human', 'computer')`),
    )
    .execute();

  await db.schema
    .alterTable("game_seats")
    .addColumn("controller_type", "text", (col) =>
      col
        .notNull()
        .defaultTo("human")
        .check(sql`controller_type in ('human', 'computer')`),
    )
    .addColumn("bot_kind", "text")
    .execute();

  // bot_kind is present iff the seat is a computer seat: a human seat has no
  // bot version, and a computer seat must record one. Keeps the historical
  // snapshot internally consistent.
  await sql`
    ALTER TABLE game_seats ADD CONSTRAINT game_seats_bot_kind_controller_ck
    CHECK ((controller_type = 'human' AND bot_kind IS NULL)
        OR (controller_type = 'computer' AND bot_kind IS NOT NULL))
  `.execute(db);

  // rooms.has_computer: denormalized marker so bot rooms can be excluded from
  // the public lobby / quick-join / join without a per-room membership scan.
  await db.schema
    .alterTable("rooms")
    .addColumn("has_computer", "boolean", (col) => col.notNull().defaultTo(false))
    .execute();

  // Structural enforcement of the authority model: a member's/seat's
  // controller_type must equal the referenced player's kind. No caller
  // (createRoom, addRoomMember, dealNewGame) can ever store a value that
  // disagrees with players.kind -- the database rejects the write.
  await sql`
    ALTER TABLE room_members ADD CONSTRAINT room_members_controller_matches_player_fk
    FOREIGN KEY (player_id, controller_type) REFERENCES players (id, kind)
  `.execute(db);
  await sql`
    ALTER TABLE game_seats ADD CONSTRAINT game_seats_controller_matches_player_fk
    FOREIGN KEY (player_id, controller_type) REFERENCES players (id, kind)
  `.execute(db);

  // Seed the single global credential-less computer player (idempotent).
  await sql`
    INSERT INTO players (id, kind, recovery_hash, display_name_default)
    VALUES (${COMPUTER_PLAYER_ID}, 'computer', NULL, ${COMPUTER_DISPLAY_NAME})
    ON CONFLICT (id) DO NOTHING
  `.execute(db);
}

// Safe ONLY pre-dependent-data (see the header note). Computer player rows are
// removed first so restoring recovery_hash NOT NULL can succeed; that DELETE
// FK-fails by design if any dependent bot rows still reference them, which is
// the intended guard against a destructive production rollback.
export async function down(db: AnyKysely): Promise<void> {
  await db.deleteFrom("players").where("kind", "=", "computer").execute();

  // Drop the composite FKs and their unique target before the columns/kind
  // they depend on.
  await sql`ALTER TABLE game_seats DROP CONSTRAINT IF EXISTS game_seats_controller_matches_player_fk`.execute(
    db,
  );
  await sql`ALTER TABLE room_members DROP CONSTRAINT IF EXISTS room_members_controller_matches_player_fk`.execute(
    db,
  );
  await sql`ALTER TABLE players DROP CONSTRAINT IF EXISTS players_id_kind_uk`.execute(db);
  await sql`ALTER TABLE players DROP CONSTRAINT IF EXISTS players_recovery_hash_kind_ck`.execute(
    db,
  );
  await sql`ALTER TABLE game_seats DROP CONSTRAINT IF EXISTS game_seats_bot_kind_controller_ck`.execute(
    db,
  );

  await db.schema.alterTable("rooms").dropColumn("has_computer").execute();
  await db.schema.alterTable("game_seats").dropColumn("bot_kind").execute();
  await db.schema.alterTable("game_seats").dropColumn("controller_type").execute();
  await db.schema.alterTable("room_members").dropColumn("controller_type").execute();
  await db.schema.alterTable("players").dropColumn("kind").execute();

  await db.schema
    .alterTable("players")
    .alterColumn("recovery_hash", (col) => col.setNotNull())
    .execute();
}
