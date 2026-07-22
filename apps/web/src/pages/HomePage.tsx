import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PRODUCT_NAME } from "@tile-meld/shared";
import { api, ApiError } from "../api/client.js";
import { addRecentRoom, listRecentRoomIds, removeRecentRoom } from "../state/recentRooms.js";
import { useAuth } from "../auth/AuthProvider.js";
import { GameStatusCard, type DashboardRoomSummary } from "../dashboard/GameStatusCard.js";

export function HomePage() {
  const navigate = useNavigate();
  const { state: authState } = useAuth();
  const username = authState.status === "ready" ? authState.username : null;
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

  return (
    <div className="stack">
      <header className="stack">
        <h1 className="dashboard-title">{PRODUCT_NAME}</h1>
        <p className="muted">
          {PRODUCT_NAME} is asynchronous -- you don't need to be online at the same time as anyone
          else. Come back whenever it's your turn.
        </p>
      </header>

      <section className="stack" aria-labelledby="create-game-heading">
        <h2 id="create-game-heading">Create a Game</h2>

        {!username && (
          <div className="card stack" role="status">
            <p>
              You need a username before creating games.{" "}
              <Link to="/recovery">Claim a username</Link> to get started.
            </p>
          </div>
        )}

        <div className="row">
          <button
            className="primary"
            disabled={startingBot || !username}
            onClick={() => void playVsComputer()}
          >
            {startingBot ? "Starting…" : "Play vs Computer (beta)"}
          </button>
          <Link to="/rooms/new">
            <button>New Game</button>
          </Link>
          <Link to="/rooms/join">
            <button>Join Room by Name</button>
          </Link>
          <Link to="/lobby">
            <button>Browse Public Lobby</button>
          </Link>
        </div>

        {botError && (
          <div className="error-banner" role="alert">
            {botError}
          </div>
        )}

        <p className="muted">
          Play vs Computer sets up a private game against a simple, beta computer opponent — great
          for trying the game out or troubleshooting on your own.
        </p>
      </section>

      <section className="stack" aria-labelledby="your-games-heading">
        <h2 id="your-games-heading">Your Games</h2>

        {rooms === undefined && !loadError && <p role="status">Loading your games…</p>}
        {loadError && (
          <div className="error-banner" role="alert">
            {loadError}
          </div>
        )}
        {rooms?.length === 0 && (
          <p className="muted">
            No rooms yet. Create one, join by name, or browse the public lobby.
          </p>
        )}

        {rooms && rooms.length > 0 && (
          <ul className="dashboard-grid" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {rooms.map((room) => (
              <GameStatusCard key={room.roomId} room={room} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
