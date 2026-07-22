import type { GetRoomResponse } from "@tile-meld/shared";

// The one authoritative status-classification rule for a dashboard game
// card (Phase 6: docs/next-changes-implementation-plan.md). Every input
// here is a primitive the server already returns authoritatively (room
// status, the latest game's status, and the CALLER'S OWN seat status in
// that latest game) -- nothing here infers state the server hasn't already
// told us. Kept as one small, pure, thoroughly-tested function rather than
// conditional logic scattered across JSX, per the phase's explicit
// instruction.

export type DashboardStatusLabel = "Open" | "Active" | "Completed" | "Resigned" | "Ended";

/** The three visual treatments the product spec allows -- "neutral"
 * (white/plain) for Open, "active" (green) for Active, "grey" for every
 * terminal-or-past-game state (Completed/Resigned/Ended). Status must never
 * be communicated by tone alone -- every tone is always paired with the
 * `label` text. */
export type DashboardTone = "neutral" | "active" | "grey";

export type DashboardStatus = {
  readonly label: DashboardStatusLabel;
  readonly tone: DashboardTone;
};

/** The subset of GetRoomResponse the classifier needs -- every field is an
 * authoritative primitive from the server, not a client-side guess. */
export type ClassifiableRoom = Pick<
  GetRoomResponse,
  "status" | "latestGameStatus" | "selfSeatStatus"
>;

/**
 * Maps the repository's real room/game status vocabulary onto the five
 * user-facing dashboard labels:
 *
 * | rooms.status                      | latest game            | → label      | tone    |
 * |------------------------------------|-------------------------|--------------|---------|
 * | closed / abandoned                 | (any)                    | Ended        | grey    |
 * | in_game                            | (active, by definition)  | Active       | active  |
 * | open                                | none dealt yet            | Open         | neutral |
 * | between_games                      | completed, self resigned  | Resigned     | grey    |
 * | between_games                      | completed, self not resigned (or no self seat) | Completed | grey |
 *
 * Priority is current-state-first, never stale history: a terminal room is
 * always Ended regardless of how its last game went; a currently active
 * game (including a fresh rematch) is always Active even if the player
 * resigned from an earlier game in the same room, because `latestGameId`/
 * `selfSeatStatus` are always evaluated against the CURRENT latest game,
 * never a stale one. `closed` is a real, defined `rooms.status` value with
 * no production code path that sets it today (reserved for a future
 * host-close action) -- it is mapped here defensively, alongside the
 * currently-reachable `abandoned`, so this classifier doesn't need to
 * change if that path is added later.
 */
export function classifyRoomStatus(room: ClassifiableRoom): DashboardStatus {
  if (room.status === "closed" || room.status === "abandoned") {
    return { label: "Ended", tone: "grey" };
  }
  if (room.status === "in_game") {
    return { label: "Active", tone: "active" };
  }
  if (room.status === "open") {
    return { label: "Open", tone: "neutral" };
  }
  // room.status === "between_games": a game has completed and no new one
  // has been dealt yet. Resigned applies only to the LATEST completed
  // game's outcome for the current player, per the phase spec.
  if (room.selfSeatStatus === "resigned") {
    return { label: "Resigned", tone: "grey" };
  }
  return { label: "Completed", tone: "grey" };
}

export type LinkableRoom = Pick<GetRoomResponse, "roomId" | "latestGameId">;

/**
 * The most useful authoritative destination for a card in a given status:
 * Open → the Waiting Room; Active/Completed/Resigned → the latest game
 * (active table or its Game Over screen, whichever the game's own status
 * renders); Ended → the latest completed game if one still exists, or
 * `undefined` when there's nothing left to show (the card renders a
 * disabled/unavailable state instead of a broken link -- see
 * GameStatusCard). Never links to a stale game other than the room's own
 * `latestGameId` -- there is no other game identifier this function will
 * ever return.
 */
export function dashboardCardHref(room: LinkableRoom, status: DashboardStatus): string | undefined {
  switch (status.label) {
    case "Open":
      return `/rooms/${room.roomId}`;
    case "Active":
    case "Completed":
    case "Resigned":
      return room.latestGameId ? `/games/${room.latestGameId}` : `/rooms/${room.roomId}`;
    case "Ended":
      return room.latestGameId ? `/games/${room.latestGameId}` : undefined;
  }
}
