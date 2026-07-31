import type { RedactedGameView } from "@tile-meld/shared";
import { DeadlineCountdown } from "./DeadlineCountdown.js";
import type { ConnectionState } from "./useGame.js";

type TabletopStatusProps = {
  readonly view: RedactedGameView;
  readonly connectionState: ConnectionState;
  readonly onReconnect: () => void;
  readonly isMyTurn: boolean;
  readonly computerIsPlaying: boolean;
};

// Phase 7 §13.2 "decorative layers ... silent" -- the emoji is a redundant
// visual accent (docs/meld-masters-visual-refresh-plan.md's own Phase 0
// review named these as a cheap Phase 7 fix candidate); the word after it
// already carries the full meaning, so the glyph itself is aria-hidden
// rather than removed, per that review's explicit instruction not to drop
// a useful visual symbol just to correct a duplicate AT announcement.
//
// "reconnecting" and "disconnected" are deliberately distinct (stabilization
// pass): the former means Socket.IO is actively retrying in the background
// right now, the latter means it has genuinely given up (or the server
// forced the disconnect) and nothing will happen without the Reconnect
// button below. Collapsing them into one label left a returning player
// unable to tell "still trying" from "stuck".
function connectionLabel(state: ConnectionState): { emoji: string; text: string } {
  switch (state) {
    case "connected":
      return { emoji: "🟢", text: "Connected" };
    case "connecting":
      return { emoji: "🟡", text: "Connecting…" };
    case "reconnecting":
      return { emoji: "🟡", text: "Reconnecting…" };
    case "disconnected":
      return { emoji: "🔴", text: "Disconnected" };
  }
}

/**
 * The tabletop's single H1 and the page's most prominent element (Phase 8:
 * docs/tabletop-layout-contract.md) -- turn ownership is the one thing a
 * returning player needs to see fastest, so it IS the page heading rather
 * than a `<strong>` buried below a static "Tabletop" title. Owns the
 * connection indicator and, only while a turn is actually running, the
 * deadline countdown -- both were already gated on `status === "active"`
 * before this phase; that gating is unchanged, just relocated here.
 */
export function TabletopStatus({
  view,
  connectionState,
  onReconnect,
  isMyTurn,
  computerIsPlaying,
}: TabletopStatusProps) {
  const turnText =
    view.status === "completed"
      ? "Game over"
      : isMyTurn
        ? "Your turn"
        : computerIsPlaying
          ? "Computer is playing…"
          : `Waiting on seat ${view.activeSeat + 1}`;
  const conn = connectionLabel(connectionState);

  return (
    <div
      className={`tabletop-status${isMyTurn ? " tabletop-status--active-turn" : ""}`}
      role="region"
      aria-label="Game status"
    >
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 className="tabletop-turn">
          {computerIsPlaying && <span aria-hidden="true">🤖 </span>}
          {turnText}
        </h1>
        <span className="row" style={{ gap: "var(--space-2)" }}>
          <span className="muted">
            <span aria-hidden="true">{conn.emoji}</span> {conn.text}
          </span>
          {connectionState === "disconnected" && (
            <button type="button" className="action-utility" onClick={onReconnect}>
              Reconnect
            </button>
          )}
        </span>
      </div>
      {view.status === "active" && (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <span className="tabletop-deadline">
            <DeadlineCountdown deadlineAt={view.deadlineAt} />
          </span>
        </div>
      )}
    </div>
  );
}
