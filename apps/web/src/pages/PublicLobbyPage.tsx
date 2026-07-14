import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { PublicRoomSummary } from "@tile-meld/shared";
import { api, ApiError } from "../api/client.js";
import { addRecentRoom } from "../state/recentRooms.js";
import { getDefaultDisplayName, setDefaultDisplayName } from "../state/displayName.js";

const PAGE_SIZE = 20;

export function PublicLobbyPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<PublicRoomSummary[] | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const [displayName, setDisplayName] = useState(getDefaultDisplayName());
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
    if (!displayName.trim()) {
      setError("Enter a display name first.");
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      setDefaultDisplayName(displayName);
      const { roomId } = await action();
      addRecentRoom(roomId);
      navigate(`/rooms/${roomId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not join a room.");
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <h1>Public lobby</h1>

      <div className="card stack">
        <label className="stack" style={{ gap: "var(--space-1)" }}>
          Your display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
          />
        </label>
        <button
          className="primary"
          disabled={busy}
          onClick={() => void joinRoom(() => api.quickJoin({ displayName }))}
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
              <strong>Room {room.code}</strong>
              <div className="muted">
                {room.memberCount}/{room.capacity} players -- {room.turnLimitHours}h turn limit
              </div>
              <div className="muted">{room.memberDisplayNames.join(", ")}</div>
            </div>
            <button
              disabled={busy || room.memberCount >= room.capacity}
              onClick={() => void joinRoom(() => api.joinRoom({ code: room.code, displayName }))}
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
