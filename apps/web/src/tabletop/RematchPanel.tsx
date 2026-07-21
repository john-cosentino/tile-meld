import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GetRoomResponse } from "@tile-meld/shared";
import { api, ApiError } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";

const POLL_INTERVAL_MS = 3000;

type RematchPanelProps = {
  readonly roomId: string;
  readonly gameId: string;
};

/**
 * The completed-game rematch control (Phase 5, one-click rematch). Mounted
 * only while the current game's status is "completed" -- its lifecycle IS
 * the "rematch is relevant" window, so polling starts on mount and stops on
 * unmount/navigation with no extra state to track. Reuses the same
 * GET /api/rooms/:id poll WaitingRoomPage already relies on (there is no
 * room-scoped realtime channel, only game-scoped) so every member still
 * looking at this completed game is carried into the new one the instant
 * the host starts it, without a page refresh.
 */
export function RematchPanel({ roomId, gameId }: RematchPanelProps) {
  const navigate = useNavigate();
  const { state: authState } = useAuth();
  const myPlayerId = authState.status === "ready" ? authState.playerId : undefined;

  const [room, setRoom] = useState<GetRoomResponse | undefined>(undefined);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function poll(): Promise<void> {
      try {
        const fetched = await api.getRoom(roomId);
        if (!cancelled) setRoom(fetched);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        // Any other transient failure just leaves the previous room state in
        // place -- the next tick retries, same as WaitingRoomPage's poll.
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [roomId]);

  // Every member still looking at this completed game -- host included --
  // is carried straight to the room's authoritative new game the moment one
  // exists, with no manual refresh. Guarding on "differs from the game
  // we're viewing" (not just "is set") avoids re-navigating to the game
  // already on screen, and only ever targets a gameId this room itself
  // reported, so this can't be steered anywhere else.
  useEffect(() => {
    if (room?.latestGameId && room.latestGameId !== gameId) {
      navigate(`/games/${room.latestGameId}`, { replace: true });
    }
  }, [room, gameId, navigate]);

  async function startRematch(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const { gameId: newGameId } = await api.rematchRoom(roomId);
      navigate(`/games/${newGameId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start a rematch.");
      setBusy(false);
    }
  }

  if (notFound) {
    return <p className="muted">This room no longer exists.</p>;
  }
  if (!room) return null;

  const isHost = myPlayerId !== undefined && myPlayerId === room.hostPlayerId;

  return (
    <div className="stack">
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {isHost ? (
        <button className="primary" disabled={busy} onClick={() => void startRematch()}>
          {busy ? "Starting rematch…" : "Rematch"}
        </button>
      ) : (
        <p className="muted">Waiting for the host to start a rematch.</p>
      )}
    </div>
  );
}
