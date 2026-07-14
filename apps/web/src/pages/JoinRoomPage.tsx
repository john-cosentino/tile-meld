import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client.js";
import { addRecentRoom } from "../state/recentRooms.js";
import { getDefaultDisplayName, setDefaultDisplayName } from "../state/displayName.js";

export function JoinRoomPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState(getDefaultDisplayName());
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      setDefaultDisplayName(displayName);
      const { roomId } = await api.joinRoom({ code: code.trim().toUpperCase(), displayName });
      addRecentRoom(roomId);
      navigate(`/rooms/${roomId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not join that room.");
      setSubmitting(false);
    }
  }

  return (
    <form className="stack card" onSubmit={(e) => void onSubmit(e)}>
      <h1>Join a room</h1>

      <label className="stack" style={{ gap: "var(--space-1)" }}>
        Room code
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          maxLength={16}
          autoCapitalize="characters"
        />
      </label>

      <label className="stack" style={{ gap: "var(--space-1)" }}>
        Your display name
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          maxLength={40}
        />
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
