// The single, global, credential-less computer opponent actor
// (docs plan D-BOT1/D-BOT1a). Identity authority is always
// `players.kind = 'computer'`; this fixed id is the one bot player row every
// bot room member and game seat points at. No recovery secret, password, or
// session token ever exists for it -- the schema CHECK on `players` enforces
// that a computer player's `recovery_hash` is NULL (migration 0018).
export const COMPUTER_PLAYER_ID = "00000000-0000-0000-0000-000000000b01";

/** Default per-room display name for the computer opponent. Room-scoped
 * uniqueness is satisfied because a bot room has exactly one bot member. */
export const COMPUTER_DISPLAY_NAME = "Computer";

/** Version tag snapshotted onto a computer game seat (`game_seats.bot_kind`)
 * for historical accuracy. */
export const COMPUTER_BOT_KIND = "troubleshooting_v1";
