import type { ColumnType, Generated } from "kysely";

// Kysely row types for every table in docs/opus-implementation-plan.md §6,
// with the corrections from the follow-up clarification pass:
//  - rooms.host_room_member_id references room_members.id (not a player).
//  - game_seats are never deleted at game end; they become immutable
//    historical records governed by retention, not by this schema.
//  - idempotency_keys are scoped by (player_id, key) and persist the full
//    result payload, not a hash.
//  - sessions.token_hash is a deterministic keyed HMAC (computed by the
//    application), NOT Argon2id -- Argon2id is reserved for
//    players.recovery_hash, where deterministic indexed lookup is not
//    required.

type Timestamp = ColumnType<Date, Date | string, Date | string>;
// Same as Timestamp, but optional on insert -- for columns with a DB-level
// `DEFAULT now()` that inserts are allowed to omit.
type TimestampWithDefault = ColumnType<Date, Date | string | undefined, Date | string>;

export type Visibility = "private" | "public";
// Identity authority for an actor. players.kind is the single source of truth;
// controller_type columns are denormalized snapshots derived from it (see
// migration 0018 and docs plan §5, Amendment 3).
export type PlayerKind = "human" | "computer";
export type ControllerType = "human" | "computer";
export type RoomStatus = "open" | "in_game" | "between_games" | "closed" | "abandoned";
export type GameStatus = "active" | "completed";
export type SeatStatus = "active" | "resigned";
export type TableSetKind = "run" | "group";
// Includes "invalid_commit" alongside the engine's TurnEvent variants --
// an invalid-commit penalty is a distinct outcome from a timeout (it's a
// different trigger, forfeited by the active player's own rejected
// submission rather than a missed deadline), so it gets its own status
// rather than being folded into "timed_out" for accurate dispute records.
export type TurnStatus =
  | "pending"
  | "active"
  | "committed"
  | "invalid_commit"
  | "drawn"
  | "passed"
  | "resigned"
  | "timed_out";

export interface PlayersTable {
  id: Generated<string>;
  created_at: ColumnType<Date, Date | string | undefined, never>;
  // Nullable since migration 0018: a computer player has no recovery secret.
  // A DB CHECK enforces non-null for humans and null for computers.
  recovery_hash: string | null;
  recovery_rotated_at: Timestamp | null;
  display_name_default: string | null;
  kind: Generated<PlayerKind>;
  // Globally unique among kind='human' rows (migration 0019). `username`
  // preserves entered casing for display; `username_canonical` is the
  // lowercased form the partial unique index enforces uniqueness on. Both
  // are NULL until claimed, and NULL forever for kind='computer'.
  username: string | null;
  username_canonical: string | null;
}

export interface SessionsTable {
  id: Generated<string>;
  player_id: string;
  token_hash: string;
  created_at: ColumnType<Date, Date | string | undefined, never>;
  last_seen_at: TimestampWithDefault;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
}

export interface RoomsTable {
  id: Generated<string>;
  code: string;
  visibility: Visibility;
  capacity: number;
  turn_limit_hours: number;
  status: Generated<RoomStatus>;
  host_room_member_id: string | null;
  created_at: ColumnType<Date, Date | string | undefined, never>;
  last_activity_at: TimestampWithDefault;
  // Denormalized marker (migration 0018): true iff this room has a computer
  // member. Excludes bot rooms from public lobby / quick-join / join.
  has_computer: Generated<boolean>;
}

export interface RoomMembersTable {
  id: Generated<string>;
  room_id: string;
  player_id: string;
  display_name: string;
  joined_at: ColumnType<Date, Date | string | undefined, never>;
  is_ready: Generated<boolean>;
  left_at: Timestamp | null;
  controller_type: Generated<ControllerType>;
}

export interface GamesTable {
  id: Generated<string>;
  room_id: string;
  seq: number;
  status: GameStatus;
  pool_order: string[];
  pool_cursor: Generated<number>;
  active_seat: number;
  current_turn_id: string | null;
  version: Generated<number>;
  consecutive_passes: Generated<number>;
  created_at: ColumnType<Date, Date | string | undefined, never>;
  completed_at: Timestamp | null;
  winner_seat: number | null;
}

export interface GameSeatsTable {
  id: Generated<string>;
  game_id: string;
  room_member_id: string;
  player_id: string;
  seat_index: number;
  display_name: string;
  status: Generated<SeatStatus>;
  has_initial_meld: Generated<boolean>;
  join_order: number;
  // Immutable historical snapshot of the seat's controller at deal time
  // (migration 0018). bot_kind records the bot version for a computer seat.
  controller_type: Generated<ControllerType>;
  bot_kind: string | null;
}

export interface RacksTable {
  game_id: string;
  seat_index: number;
  tiles: string[];
}

export interface TableSetsTable {
  id: Generated<string>;
  game_id: string;
  ordinal: number;
  kind: TableSetKind;
  tiles: string[];
  joker_repr: unknown;
}

export interface TurnsTable {
  id: Generated<string>;
  game_id: string;
  seat_index: number;
  status: TurnStatus;
  started_at: ColumnType<Date, Date | string | undefined, never>;
  deadline_at: Timestamp;
  warned_at: Timestamp | null;
  resolved_at: Timestamp | null;
  version_at_start: number;
}

export interface GameEventsTable {
  id: Generated<string>;
  game_id: string;
  seq: number;
  type: string;
  seat_index: number | null;
  payload: unknown;
  created_at: ColumnType<Date, Date | string | undefined, never>;
}

export interface IdempotencyKeysTable {
  player_id: string;
  key: string;
  game_id: string | null;
  result_payload: unknown;
  created_at: ColumnType<Date, Date | string | undefined, never>;
}

export interface ChatMessagesTable {
  id: Generated<string>;
  game_id: string;
  seat_index: number | null;
  sender_player_id: string;
  body: string;
  created_at: ColumnType<Date, Date | string | undefined, never>;
}

export interface PushSubscriptionsTable {
  id: Generated<string>;
  player_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: ColumnType<Date, Date | string | undefined, never>;
  last_success_at: Timestamp | null;
  failure_count: Generated<number>;
}

export interface RoomScoresTable {
  room_id: string;
  player_id: string;
  cumulative_score: Generated<number>;
  games_played: Generated<number>;
  games_won: Generated<number>;
}

export interface Database {
  players: PlayersTable;
  sessions: SessionsTable;
  rooms: RoomsTable;
  room_members: RoomMembersTable;
  games: GamesTable;
  game_seats: GameSeatsTable;
  racks: RacksTable;
  table_sets: TableSetsTable;
  turns: TurnsTable;
  game_events: GameEventsTable;
  idempotency_keys: IdempotencyKeysTable;
  chat_messages: ChatMessagesTable;
  push_subscriptions: PushSubscriptionsTable;
  room_scores: RoomScoresTable;
}
