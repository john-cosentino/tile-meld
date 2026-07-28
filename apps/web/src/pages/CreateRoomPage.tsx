import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { TURN_LIMIT_OPTIONS, type TurnLimitHours } from "@tile-meld/shared";
import { api, ApiError } from "../api/client.js";
import { addRecentRoom } from "../state/recentRooms.js";
import { useAuth } from "../auth/AuthProvider.js";

export function CreateRoomPage() {
  const navigate = useNavigate();
  const { state: authState } = useAuth();
  const username = authState.status === "ready" ? authState.username : null;
  const [capacity, setCapacity] = useState<2 | 3 | 4>(4);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [turnLimitHours, setTurnLimitHours] = useState<TurnLimitHours>(4);
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!username) return;
    setError(undefined);
    setSubmitting(true);
    try {
      // displayName is kept only for wire backward compatibility -- the
      // server always uses the creator's claimed username as the host's
      // display name (Phase 2), never this field.
      const { roomId } = await api.createRoom({
        displayName: username,
        capacity,
        visibility,
        turnLimitHours,
      });
      addRecentRoom(roomId);
      navigate(`/rooms/${roomId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the room.");
      setSubmitting(false);
    }
  }

  if (!username) {
    return (
      <div className="stack arcade-panel">
        <h1 className="page-title">Create a room</h1>
        <p>
          You need a username before creating a room. <Link to="/recovery">Claim a username</Link>{" "}
          to continue.
        </p>
      </div>
    );
  }

  return (
    <form className="stack arcade-panel" onSubmit={(e) => void onSubmit(e)}>
      <h1 className="page-title">Create a room</h1>
      <p className="muted">
        Creating as <strong>{username}</strong>.
      </p>

      <fieldset>
        <legend>Capacity</legend>
        <div className="arcade-choice-group">
          {([2, 3, 4] as const).map((n) => (
            <label key={n} className="arcade-choice">
              <input
                type="radio"
                name="capacity"
                checked={capacity === n}
                onChange={() => setCapacity(n)}
              />
              {n} players
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Visibility</legend>
        <div className="arcade-choice-group">
          <label className="arcade-choice">
            <input
              type="radio"
              name="visibility"
              checked={visibility === "private"}
              onChange={() => setVisibility("private")}
            />
            Private (invite by code)
          </label>
          <label className="arcade-choice">
            <input
              type="radio"
              name="visibility"
              checked={visibility === "public"}
              onChange={() => setVisibility("public")}
            />
            Public (listed in the lobby)
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Turn time limit</legend>
        <div className="arcade-choice-group">
          {TURN_LIMIT_OPTIONS.map((opt) => (
            <label key={opt.hours} className="arcade-choice">
              <input
                type="radio"
                name="turnLimit"
                checked={turnLimitHours === opt.hours}
                onChange={() => setTurnLimitHours(opt.hours)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <button type="submit" className="accent-gold" disabled={submitting}>
        {submitting ? "Creating…" : "Create room"}
      </button>
    </form>
  );
}
