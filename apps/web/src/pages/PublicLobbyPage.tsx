import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { PublicRoomSummary } from "@tile-meld/shared";
import { api, ApiError } from "../api/client.js";
import { addRecentRoom } from "../state/recentRooms.js";
import { formatRoomName } from "../state/roomName.js";
import { useAuth } from "../auth/AuthProvider.js";

const PAGE_SIZE = 20;

export function PublicLobbyPage() {
  const navigate = useNavigate();
  const { state: authState } = useAuth();
  const username = authState.status === "ready" ? authState.username : null;
  const [rooms, setRooms] = useState<PublicRoomSummary[] | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.publicRooms(PAGE_SIZE, offset).then((res) => {
      if (!cancelled) setRooms(res.rooms);
    });
    return () => {
      cancelled = true;
    };
  }, [offset]);

  async function joinRoom(action: () => Promise<{ roomId: string }>): Promise<void> {
    setError(undefined);
    setBusy(true);
    try {
      const { roomId } = await action();
      addRecentRoom(roomId);
      navigate(`/rooms/${roomId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not join a room.");
      setBusy(false);
    }
  }

  // Every room created since Phase 2 has a friendly name; a legacy room
  // (predating it) falls back to the still-preserved code-based route.
  // Either way, the claimed username is used, never a free-text field.
  function joinListedRoom(room: PublicRoomSummary): Promise<{ roomId: string }> {
    return room.name
      ? api.joinRoomByName({ name: room.name })
      : api.joinRoom({ code: room.code, displayName: username! });
  }

  return (
    <div className="stack">
      <h1>Public lobby</h1>

      {!username && (
        <div className="card stack" role="status">
          <p>
            You need a username before joining games. <Link to="/recovery">Claim a username</Link>{" "}
            to get started.
          </p>
        </div>
      )}

      <div className="card stack">
        <p className="muted">
          Joining as <strong>{username ?? "…"}</strong>.
        </p>
        <button
          className="primary"
          disabled={busy || !username}
          onClick={() => void joinRoom(() => api.quickJoin({ displayName: username! }))}
        >
          Quick Join
        </button>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
      </div>

      {rooms === undefined && <p>Loading public rooms…</p>}
      {rooms?.length === 0 && <p className="muted">No open public rooms right now.</p>}

      <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
        {rooms?.map((room) => (
          <li key={room.roomId} className="card row" style={{ justifyContent: "space-between" }}>
            <div>
              <strong>{formatRoomName(room)}</strong>
              <div className="muted">
                {room.memberCount}/{room.capacity} players -- {room.turnLimitHours}h turn limit
              </div>
              <div className="muted">{room.memberDisplayNames.join(", ")}</div>
            </div>
            <button
              disabled={busy || !username || room.memberCount >= room.capacity}
              onClick={() => void joinRoom(() => joinListedRoom(room))}
            >
              Join
            </button>
          </li>
        ))}
      </ul>

      <div className="row">
        <button
          disabled={offset === 0}
          onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
        >
          Previous
        </button>
        <button
          disabled={(rooms?.length ?? 0) < PAGE_SIZE}
          onClick={() => setOffset((o) => o + PAGE_SIZE)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
