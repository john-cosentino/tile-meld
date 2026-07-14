import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { TURN_LIMIT_OPTIONS, type TurnLimitHours } from "@tile-meld/shared";
import { api, ApiError } from "../api/client.js";
import { addRecentRoom } from "../state/recentRooms.js";
import { getDefaultDisplayName, setDefaultDisplayName } from "../state/displayName.js";

export function CreateRoomPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(getDefaultDisplayName());
  const [capacity, setCapacity] = useState<2 | 3 | 4>(4);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [turnLimitHours, setTurnLimitHours] = useState<TurnLimitHours>(4);
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      setDefaultDisplayName(displayName);
      const { roomId } = await api.createRoom({
        displayName,
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

  return (
    <form className="stack card" onSubmit={(e) => void onSubmit(e)}>
      <h1>Create a room</h1>

      <label className="stack" style={{ gap: "var(--space-1)" }}>
        Your display name
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          maxLength={40}
        />
      </label>

      <fieldset>
        <legend>Capacity</legend>
        <div className="row">
          {([2, 3, 4] as const).map((n) => (
            <label key={n} className="row">
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
        <div className="row">
          <label className="row">
            <input
              type="radio"
              name="visibility"
              checked={visibility === "private"}
              onChange={() => setVisibility("private")}
            />
            Private (invite by code)
          </label>
          <label className="row">
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
        <div className="row">
          {TURN_LIMIT_OPTIONS.map((opt) => (
            <label key={opt.hours} className="row">
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

      <button type="submit" className="primary" disabled={submitting}>
        {submitting ? "Creating…" : "Create room"}
      </button>
    </form>
  );
}
