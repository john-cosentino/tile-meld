import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PRODUCT_NAME, type GetRoomResponse } from "@tile-meld/shared";
import { api, ApiError } from "../api/client.js";
import { addRecentRoom, listRecentRoomIds, removeRecentRoom } from "../state/recentRooms.js";
import { formatRoomName } from "../state/roomName.js";
import { useAuth } from "../auth/AuthProvider.js";

type RoomSummary = {
  readonly roomId: string;
  readonly code: string;
  readonly name: string | null;
  readonly status: GetRoomResponse["status"];
  readonly latestGameId: string | null;
  readonly memberCount: number;
  readonly capacity: number;
};

export function HomePage() {
  const navigate = useNavigate();
  const { state: authState } = useAuth();
  const username = authState.status === "ready" ? authState.username : null;
  const [rooms, setRooms] = useState<RoomSummary[] | undefined>(undefined);
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
      const ids = listRecentRoomIds();
      const results = await Promise.all(
        ids.map(async (roomId) => {
          try {
            const room = await api.getRoom(roomId);
            return {
              roomId: room.roomId,
              code: room.code,
              name: room.name,
              status: room.status,
              latestGameId: room.latestGameId,
              memberCount: room.members.length,
              capacity: room.capacity,
            };
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
        setRooms(results.filter((r): r is RoomSummary => r !== undefined));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="stack">
      <h1>Your games</h1>
      <p className="muted">
        {PRODUCT_NAME} is asynchronous -- you don't need to be online at the same time as anyone
        else. Come back whenever it's your turn.
      </p>

      {rooms === undefined && <p>Loading your rooms…</p>}
      {rooms?.length === 0 && (
        <p className="muted">No rooms yet. Create one, join by code, or browse the public lobby.</p>
      )}

      <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
        {rooms?.map((room) => (
          <li key={room.roomId} className="card row" style={{ justifyContent: "space-between" }}>
            <div>
              <strong>{formatRoomName(room)}</strong>
              <div className="muted">
                {room.memberCount}/{room.capacity} players -- {statusLabel(room.status)}
              </div>
            </div>
            <Link
              to={room.latestGameId ? `/games/${room.latestGameId}` : `/rooms/${room.roomId}`}
              className="row"
            >
              <button className="primary">
                {room.status === "in_game" ? "Go to table" : "Open room"}
              </button>
            </Link>
          </li>
        ))}
      </ul>

      {!username && (
        <div className="card stack" role="status">
          <p>
            You need a username before creating games. <Link to="/recovery">Claim a username</Link>{" "}
            to get started.
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
          <button>Create a room</button>
        </Link>
        <Link to="/rooms/join">
          <button>Join Room by Name</button>
        </Link>
        <Link to="/lobby">
          <button>Browse public lobby</button>
        </Link>
      </div>

      {botError && (
        <div className="error-banner" role="alert">
          {botError}
        </div>
      )}

      <p className="muted">
        Play vs Computer sets up a private game against a simple, beta computer opponent — great for
        trying the game out or troubleshooting on your own.
      </p>
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "open":
      return "waiting for players";
    case "in_game":
      return "game in progress";
    case "between_games":
      return "waiting for rematch";
    case "closed":
      return "closed";
    case "abandoned":
      return "abandoned";
    default:
      return status;
  }
}
