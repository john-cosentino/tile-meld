import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { PRODUCT_NAME } from "@tile-meld/shared";
import { api, ApiError } from "../api/client.js";
import { addRecentRoom, listRecentRoomIds, removeRecentRoom } from "../state/recentRooms.js";
import { formatRoomName } from "../state/roomName.js";
import { formatRelativeTime } from "../state/relativeTime.js";
import { useAuth } from "../auth/AuthProvider.js";
import { GameStatusCard, type DashboardRoomSummary } from "../dashboard/GameStatusCard.js";
import { ArcadePanel } from "../arcade/ArcadePanel.js";
import { ArcadePlate, ArcadePlateLink } from "../arcade/ArcadePlate.js";
import { frameStyle } from "../arcade/frameStyle.js";
import { portraitForSeat } from "../branding/portraits.js";
import { arcadeAssets } from "../assets/arcade/manifest.js";

// The Home screen is composed to the concept spec new_layout1.png; every
// major region carries data-region and its geometry lives in
// docs/design-reference/region-maps/home-desktop.json (checked by
// `pnpm run test:arcade`). Concept panels whose features don't exist
// (seasons, XP, daily bonus...) host REAL content instead -- nothing here
// renders fictional data.

export function HomePage() {
  const navigate = useNavigate();
  const { state: authState } = useAuth();
  const username = authState.status === "ready" ? authState.username : null;
  const hasFreshRecoverySecret =
    authState.status === "ready" && authState.newRecoverySecret !== null;
  const [rooms, setRooms] = useState<DashboardRoomSummary[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [startingBot, setStartingBot] = useState(false);
  const [botError, setBotError] = useState<string | undefined>(undefined);

  async function playVsComputer(): Promise<void> {
    if (!username) return;
    setBotError(undefined);
    setStartingBot(true);
    try {
      const { roomId } = await api.createVsComputer(username);
      addRecentRoom(roomId);
      navigate(`/rooms/${roomId}`);
    } catch (err) {
      setBotError(
        err instanceof ApiError ? err.message : "Could not start a game vs the computer.",
      );
      setStartingBot(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setLoadError(undefined);
      try {
        const ids = listRecentRoomIds();
        const results = await Promise.all(
          ids.map(async (roomId) => {
            try {
              const room = await api.getRoom(roomId);
              return {
                roomId: room.roomId,
                code: room.code,
                name: room.name,
                visibility: room.visibility,
                status: room.status,
                latestGameId: room.latestGameId,
                latestGameStatus: room.latestGameStatus,
                selfSeatStatus: room.selfSeatStatus,
                hasComputer: room.hasComputer,
                lastActivityAt: room.lastActivityAt,
                memberCount: room.members.length,
                capacity: room.capacity,
              } satisfies DashboardRoomSummary;
            } catch (err) {
              if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
                removeRecentRoom(roomId);
                return undefined;
              }
              throw err;
            }
          }),
        );
        if (!cancelled) {
          setRooms(results.filter((r): r is DashboardRoomSummary => r !== undefined));
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : "Could not load your games.");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Real data for the concept's "recent activity" rail panel: the same
  // rooms, re-ranked by recency.
  const recentActivity = rooms
    ? [...rooms]
        .sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt))
        .slice(0, 3)
    : [];

  return (
    <div className="home-arcade arcade-scanlines" data-region-root>
      <header className="home-region home-region--masthead" data-region="masthead">
        <h1 className="home-masthead-heading">
          <img
            className="home-wordmark"
            src={arcadeAssets.wordmark.url}
            alt={PRODUCT_NAME}
            draggable={false}
          />
        </h1>
      </header>

      <div
        className="home-region home-region--info-badge home-info-badge"
        data-region="info-badge"
        style={frameStyle("panel-info-cyan")}
      >
        <p className="home-info-line">Multiplayer</p>
        <p className="home-info-line">Asynchronous play</p>
      </div>

      <nav
        className="home-region home-region--menu-rail home-menu-rail"
        data-region="menu-rail"
        aria-label="Main navigation"
      >
        <h2 className="visually-hidden">Create a Game</h2>
        {!username && (
          <p className="home-claim-note" role="status">
            You need a username before creating games. <Link to="/recovery">Claim a username</Link>{" "}
            to get started.
          </p>
        )}
        <ArcadePlate
          plate="plate-menu-cyan"
          icon="icon-bolt"
          iconScale={0.7}
          label={startingBot ? "Starting…" : "Play vs Computer (beta)"}
          sublabel="Beta computer opponent"
          disabled={startingBot || !username}
          onClick={() => void playVsComputer()}
          className="home-menu-plate"
        />
        <ArcadePlateLink
          plate="plate-menu-gold"
          icon="icon-plus-gold"
          iconScale={0.7}
          to="/rooms/new"
          label="New Game"
          sublabel="Make your own room"
          className="home-menu-plate"
        />
        <ArcadePlateLink
          plate="plate-menu-purple"
          icon="icon-grid-purple"
          iconScale={0.7}
          to="/rooms/join"
          label="Join Room by Name"
          sublabel="Enter a room by its name"
          className="home-menu-plate"
        />
        <ArcadePlateLink
          plate="plate-menu-green"
          icon="icon-grid-green"
          iconScale={0.7}
          to="/lobby"
          label="Browse Public Lobby"
          sublabel="Find an open public room"
          className="home-menu-plate"
        />
        <ArcadePlateLink
          plate="plate-menu-red"
          icon="icon-recycle-red"
          iconScale={0.7}
          to="/recovery"
          label="Recovery"
          sublabel="Restore your recovery code"
          className="home-menu-plate"
        />
      </nav>

      <ArcadePanel
        frame="panel-browser"
        scrollable
        title="Your Games"
        className="home-region home-region--browser home-browser"
        data-region="browser"
      >
        {rooms === undefined && !loadError && <p role="status">Loading your games…</p>}
        {loadError && (
          <div className="error-banner" role="alert">
            {loadError}
          </div>
        )}
        {rooms?.length === 0 && (
          <p className="home-browser-empty">
            No rooms yet. Create one, join by name, or browse the public lobby.
          </p>
        )}
        {rooms && rooms.length > 0 && (
          <ul className="home-games-list" aria-label="Your games">
            {rooms.map((room) => (
              <GameStatusCard key={room.roomId} room={room} />
            ))}
          </ul>
        )}
      </ArcadePanel>

      <section
        className="home-region home-region--bottom-strip home-bottom-strip"
        data-region="bottom-strip"
        style={frameStyle("strip-tip")}
        aria-label="Getting started"
      >
        <p className="home-strip-text">
          Play vs Computer sets up a private game against a simple, beta computer opponent — great
          for trying the game out or troubleshooting on your own.
        </p>
        {botError && (
          <div className="error-banner" role="alert">
            {botError}
          </div>
        )}
      </section>

      <div
        className="home-region home-region--signed-in home-signed-in"
        data-region="signed-in"
        style={frameStyle("badge-signed-in")}
      >
        <span className="home-signed-in-eyebrow">{username ? "Signed in" : "Guest"}</span>
        <span className="home-signed-in-name">{username ?? "No username yet"}</span>
      </div>

      <ArcadePanel
        frame="panel-profile"
        scrollable
        title="Your Profile"
        titleColor="var(--neon-gold)"
        className="home-region home-region--profile home-profile"
        data-region="profile"
      >
        <div className="home-profile-body">
          <span className="home-profile-window">
            <img
              src={portraitForSeat(-1, false)}
              alt=""
              aria-hidden="true"
              className="home-profile-portrait"
              draggable={false}
            />
          </span>
          <div className="home-profile-facts">
            <span className="home-profile-name">{username ?? "Guest"}</span>
            <span className="home-profile-fact">
              {rooms ? `${rooms.length} game${rooms.length === 1 ? "" : "s"}` : "—"}
            </span>
          </div>
        </div>
      </ArcadePanel>

      <ArcadePanel
        frame="panel-recovery"
        scrollable
        title="Recovery Access"
        titleColor="var(--neon-purple)"
        className="home-region home-region--recovery home-recovery"
        data-region="recovery-access"
      >
        {hasFreshRecoverySecret ? (
          <p className="home-recovery-alert" role="status">
            You're new here — <Link to="/recovery">save your recovery code</Link> so you can get
            back into your games from another device.
          </p>
        ) : (
          <p className="home-recovery-text">
            Save or rotate your recovery code to get back into your games.{" "}
            <Link to="/recovery">Manage recovery code</Link>
          </p>
        )}
      </ArcadePanel>

      <ArcadePanel
        frame="panel-activity"
        scrollable
        title="Recent Activity"
        className="home-region home-region--activity home-activity"
        data-region="activity"
      >
        {recentActivity.length === 0 ? (
          <p className="home-activity-empty">No recent games yet.</p>
        ) : (
          <ul className="home-activity-list">
            {recentActivity.map((room) => (
              <li key={room.roomId} className="home-activity-row">
                <span className="home-activity-name">{formatRoomName(room)}</span>
                <span className="home-activity-when">
                  {formatRelativeTime(room.lastActivityAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ArcadePanel>

      <ArcadePanel
        frame="panel-howto"
        scrollable
        title="How to Play"
        className="home-region home-region--rail-extra home-howto"
        data-region="rail-extra"
      >
        <ul className="home-howto-list">
          <li>Create runs of 3+ consecutive numbers.</li>
          <li>Create sets of 3+ of the same number.</li>
          <li>Open with 30 points of melds.</li>
        </ul>
      </ArcadePanel>

      <section
        className="home-region home-region--notice home-notice"
        data-region="notice"
        style={frameStyle("panel-notice")}
        aria-label="Notice board"
      >
        <h2 className="home-notice-title">Notice Board</h2>
        <ul className="home-notice-list">
          <li>Games stay live until every seat finishes.</li>
          <li>Save your recovery code — it's the only way back in.</li>
          <li>Play vs Computer is in beta.</li>
        </ul>
      </section>

      <footer
        className="home-region home-region--tip-strip home-tip"
        data-region="tip-strip"
        style={frameStyle("strip-tip")}
      >
        <span className="home-tip-label">Tip:</span>
        <span className="home-strip-text">
          {PRODUCT_NAME} is asynchronous — come back whenever it's your turn.
        </span>
      </footer>
    </div>
  );
}
