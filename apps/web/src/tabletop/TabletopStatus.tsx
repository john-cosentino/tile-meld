import type { RedactedGameView } from "@tile-meld/shared";
import { DeadlineCountdown } from "./DeadlineCountdown.js";
import type { ConnectionState } from "./useGame.js";

type TabletopStatusProps = {
  readonly view: RedactedGameView;
  readonly connectionState: ConnectionState;
  readonly isMyTurn: boolean;
  readonly computerIsPlaying: boolean;
};

function connectionLabel(state: ConnectionState): string {
  switch (state) {
    case "connected":
      return "🟢 Connected";
    case "connecting":
      return "🟡 Connecting…";
    case "disconnected":
      return "🔴 Disconnected";
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
  isMyTurn,
  computerIsPlaying,
}: TabletopStatusProps) {
  const turnText =
    view.status === "completed"
      ? "Game over"
      : isMyTurn
        ? "Your turn"
        : computerIsPlaying
          ? "🤖 Computer is playing…"
          : `Waiting on seat ${view.activeSeat + 1}`;

  return (
    <div className="tabletop-status" role="region" aria-label="Game status">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 className="tabletop-turn">{turnText}</h1>
        <span className="muted">{connectionLabel(connectionState)}</span>
      </div>
      {view.status === "active" && (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <DeadlineCountdown deadlineAt={view.deadlineAt} />
        </div>
      )}
    </div>
  );
}
