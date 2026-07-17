import { createTileCatalog, shuffle, type RandomInt, type Tile } from "@tile-meld/engine";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types.js";
import { createPlayer } from "../../src/db/repositories/players.js";
import { createSession } from "../../src/db/repositories/sessions.js";
import { createRoom } from "../../src/db/repositories/rooms.js";
import { addRoomMember, listRoomMembers } from "../../src/db/repositories/roomMembers.js";
import { dealNewGame } from "../../src/db/repositories/games.js";
import { SESSION_COOKIE_NAME } from "../../src/security/session.js";

export const TEST_HMAC_SECRET = "test-hmac-secret-at-least-32-characters-long";
export const RACK_SIZE = 14;

// Always picks index 0 -- makes the Fisher-Yates shuffle *and* the
// starting-seat pick fully deterministic (see dealNewGame: it calls
// shuffle() first, consuming every call the loop needs, then calls
// randomInt(seatCount) exactly once more for the starting seat -- with
// this generator both land on a computable, reproducible outcome instead
// of a real CSPRNG deal). Lets turn-action tests construct guaranteed-valid
// arrangements instead of fighting real randomness.
export const identityRandomInt: RandomInt = () => 0;

export type FixturePlayer = {
  readonly playerId: string;
  readonly token: string;
  readonly cookie: string;
};

export type DealtGame = {
  readonly gameId: string;
  readonly roomId: string;
  readonly players: readonly FixturePlayer[]; // players[i] holds seat i
  readonly deck: readonly Tile[]; // the exact deterministic shuffle result
};

/**
 * Deals a game with a fully deterministic shuffle rather than going
 * through the HTTP /start route (which hardcodes node:crypto's CSPRNG) --
 * `deck` is exposed so a test can compute exactly which tiles ended up in
 * which seat's rack and construct real, valid arrangements.
 */
export async function dealDeterministicGame(
  db: Kysely<Database>,
  seatCount: 2 | 3 | 4,
  turnLimitHours: 4 | 8 | 12 | 24 = 4,
): Promise<DealtGame> {
  const players: FixturePlayer[] = [];
  for (let i = 0; i < seatCount; i++) {
    const player = await createPlayer(db, `recovery-secret-${i}`);
    const { token } = await createSession(db, player.id, TEST_HMAC_SECRET, 3_600_000);
    players.push({ playerId: player.id, token, cookie: `${SESSION_COOKIE_NAME}=${token}` });
  }

  const { room } = await createRoom(db, {
    creatorPlayerId: players[0]!.playerId,
    creatorDisplayName: "P0",
    capacity: seatCount,
    visibility: "private",
    turnLimitHours,
  });
  for (let i = 1; i < seatCount; i++) {
    await addRoomMember(db, room.id, players[i]!.playerId, `P${i}`);
  }

  const members = await listRoomMembers(db, room.id);
  const readyMembers = members.map((m) => ({
    roomMemberId: m.id,
    playerId: m.player_id,
    displayName: m.display_name,
    controllerType: m.controller_type,
  }));

  const deck = shuffle(createTileCatalog(), identityRandomInt);
  const { gameId } = await db
    .transaction()
    .execute((trx) =>
      dealNewGame(trx, room.id, 1, readyMembers, turnLimitHours, identityRandomInt),
    );

  return { gameId, roomId: room.id, players, deck };
}

/**
 * Finds a same-color run in `rack` (one physical tile per distinct value)
 * whose face value totals at least the initial-meld threshold (30) --
 * enough to commit as a legal opening meld on its own. Throws if the
 * deterministic deal in this file ever stops producing one, so a broken
 * fixture assumption fails loudly instead of silently passing a test that
 * isn't exercising what it claims to.
 */
export function findInitialMeldRun(rack: readonly Tile[]): Tile[] {
  const byColor = new Map<string, Tile[]>();
  for (const tile of rack) {
    if (tile.kind !== "numbered") continue;
    const existing = byColor.get(tile.color) ?? [];
    if (!existing.some((t) => t.kind === "numbered" && t.value === tile.value)) {
      existing.push(tile);
      byColor.set(tile.color, existing);
    }
  }

  for (const tiles of byColor.values()) {
    const sorted = [...tiles].sort((a, b) =>
      a.kind === "numbered" && b.kind === "numbered" ? a.value - b.value : 0,
    );
    let bestStart = 0;
    let bestLen = 1;
    let curStart = 0;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const cur = sorted[i]!;
      const consecutive =
        prev.kind === "numbered" && cur.kind === "numbered" && cur.value === prev.value + 1;
      if (consecutive) {
        if (i - curStart + 1 > bestLen) {
          bestLen = i - curStart + 1;
          bestStart = curStart;
        }
      } else {
        curStart = i;
      }
    }
    const run = sorted.slice(bestStart, bestStart + bestLen);
    const sum = run.reduce((s, t) => s + (t.kind === "numbered" ? t.value : 0), 0);
    if (run.length >= 3 && sum >= 30) return run;
  }
  throw new Error("fixture assumption broken: no valid initial-meld run found in rack");
}
