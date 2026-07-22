import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RoomNameSchema } from "@tile-meld/shared";
import { api, ApiError } from "../api/client.js";
import { addRecentRoom } from "../state/recentRooms.js";
import { useAuth } from "../auth/AuthProvider.js";

// Join Room by Name (Phase 3, corrected DR-8): the normal join path for
// both public and private rooms, resolved by exact name -- no code field,
// no free-text display name (the claimed username is used server-side).
// The legacy code-based join endpoint is preserved server-side for
// compatibility/rollback but is no longer exposed in this primary flow.
export function JoinRoomPage() {
  const navigate = useNavigate();
  const { state: authState } = useAuth();
  const username = authState.status === "ready" ? authState.username : null;
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!username) return;
    setError(undefined);
    const parsed = RoomNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid room name.");
      return;
    }
    setSubmitting(true);
    try {
      const { roomId } = await api.joinRoomByName({ name: parsed.data });
      addRecentRoom(roomId);
      navigate(`/rooms/${roomId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not join that room.");
      setSubmitting(false);
    }
  }

  if (!username) {
    return (
      <div className="stack card">
        <h1>Join Room by Name</h1>
        <p>
          You need a username before joining a room. <Link to="/recovery">Claim a username</Link> to
          continue.
        </p>
      </div>
    );
  }

  return (
    <form className="stack card" onSubmit={(e) => void onSubmit(e)}>
      <h1>Join Room by Name</h1>
      <p className="muted">
        Joining as <strong>{username}</strong>.
      </p>

      <label className="stack" style={{ gap: "var(--space-1)" }}>
        Room name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <button type="submit" className="primary" disabled={submitting}>
        {submitting ? "Joining…" : "Join room"}
      </button>
    </form>
  );
}
