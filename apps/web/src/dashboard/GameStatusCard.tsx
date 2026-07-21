import { Link } from "react-router-dom";
import { formatRoomName } from "../state/roomName.js";
import { formatRelativeTime } from "../state/relativeTime.js";
import { classifyRoomStatus, dashboardCardHref, type ClassifiableRoom } from "./dashboardStatus.js";

export type DashboardRoomSummary = ClassifiableRoom & {
  readonly roomId: string;
  readonly code: string;
  readonly name: string | null;
  readonly visibility: "public" | "private";
  readonly latestGameId: string | null;
  readonly memberCount: number;
  readonly capacity: number;
  readonly hasComputer: boolean;
  readonly lastActivityAt: string;
};

/**
 * One dashboard game card. The whole card is a single link (never a button
 * nested inside a link) so it's natively keyboard-operable with one tab
 * stop and a visible focus ring from the global `:focus-visible` rule.
 * Status is always communicated as visible text (never tone alone) --
 * every field here is either always-present or renders a plain sentence
 * when there's nothing to show, so there is no hover-only information.
 */
export function GameStatusCard({ room }: { readonly room: DashboardRoomSummary }) {
  const status = classifyRoomStatus(room);
  const href = dashboardCardHref(room, status);
  const displayName = formatRoomName(room);
  const visibilityLabel = room.visibility === "public" ? "Public" : "Private";
  const meta = `${room.memberCount}/${room.capacity} players · ${visibilityLabel}${
    room.hasComputer ? " · vs Computer" : ""
  }`;
  const activity = `Last activity ${formatRelativeTime(room.lastActivityAt)}`;

  const body = (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>{displayName}</strong>
        <span className={`status-badge status-badge--${status.tone}`}>{status.label}</span>
      </div>
      <div className="muted">{meta}</div>
      <div className="muted">{activity}</div>
    </>
  );

  if (!href) {
    return (
      <li>
        <div className={`card dashboard-card dashboard-card--${status.tone}`}>
          {body}
          <p className="muted">This room is no longer available.</p>
        </div>
      </li>
    );
  }

  return (
    <li>
      <Link to={href} className={`card dashboard-card dashboard-card--${status.tone}`}>
        {body}
      </Link>
    </li>
  );
}
