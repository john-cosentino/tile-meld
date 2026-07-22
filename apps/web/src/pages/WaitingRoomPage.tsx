import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import type { GetRoomResponse } from "@tile-meld/shared";
import { api, ApiError } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";
import { addRecentRoom, removeRecentRoom } from "../state/recentRooms.js";
import { formatRoomName } from "../state/roomName.js";

const POLL_INTERVAL_MS = 3000;

export function WaitingRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { state: authState } = useAuth();
  const myPlayerId = authState.status === "ready" ? authState.playerId : undefined;

  const [room, setRoom] = useState<GetRoomResponse | undefined>(undefined);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    async function poll(): Promise<void> {
      try {
        const fetched = await api.getRoom(roomId!);
        if (!cancelled) {
          setRoom(fetched);
          addRecentRoom(roomId!);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          removeRecentRoom(roomId!);
          setNotFound(true);
        }
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [roomId]);

  // The moment the host starts the game (or a rematch), everyone sitting
  // on the waiting room is carried straight to the table.
  useEffect(() => {
    if (room?.status === "in_game" && room.latestGameId) {
      navigate(`/games/${room.latestGameId}`, { replace: true });
    }
  }, [room, navigate]);

  if (notFound) {
    return (
      <div className="stack">
        <p>This room no longer exists.</p>
        <Link to="/">Back home</Link>
      </div>
    );
  }
  if (!room) return <p>Loading room…</p>;

  const isHost = myPlayerId !== undefined && myPlayerId === room.hostPlayerId;
  const me = room.members.find((m) => m.playerId === myPlayerId);
  const readyCount = room.members.filter((m) => m.isReady).length;
  const canStart = readyCount >= 2;

  async function toggleReady(): Promise<void> {
    if (!me || !roomId) return;
    setBusy(true);
    try {
      await api.setReady(roomId, !me.isReady);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update readiness.");
    } finally {
      setBusy(false);
    }
  }

  async function startOrRematch(): Promise<void> {
    if (!roomId) return;
    setBusy(true);
    setError(undefined);
    try {
      const { gameId } =
        room!.status === "between_games"
          ? await api.rematchRoom(roomId)
          : await api.startRoom(roomId);
      navigate(`/games/${gameId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the game.");
      setBusy(false);
    }
  }

  async function leave(): Promise<void> {
    if (!roomId) return;
    setBusy(true);
    try {
      await api.leaveRoom(roomId);
      removeRecentRoom(roomId);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not leave the room.");
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <h1>{formatRoomName(room)}</h1>
      <p className="muted">
        {room.visibility === "public" ? "Public" : "Private"} -- {room.capacity} players max --{" "}
        {room.turnLimitHours}h turn limit
      </p>
      {/* The heading now shows the friendly name (which may differ from the
          code), so the invite code -- still the authoritative join
          credential -- needs its own always-visible line. */}
      <p className="muted">Room code: {room.code}</p>

      {room.status === "between_games" && (
        <p className="card" role="status">
          The last game finished. Ready up for a rematch when you're ready to play again.
        </p>
      )}

      <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
        {room.members.map((m) => (
          <li key={m.playerId} className="row card" style={{ justifyContent: "space-between" }}>
            <span>
              {m.displayName}
              {m.isComputer && (
                <span
                  className="badge"
                  aria-label="computer opponent"
                  style={{ marginLeft: "var(--space-1)" }}
                >
                  🤖 BOT
                </span>
              )}
              {m.playerId === room.hostPlayerId && " (host)"}
              {m.playerId === myPlayerId && " (you)"}
            </span>
            <span aria-label={m.isReady ? "ready" : "not ready"}>
              {m.isReady ? "✅ Ready" : "Not ready"}
            </span>
          </li>
        ))}
      </ul>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <div className="row">
        {me && (
          <button disabled={busy} onClick={() => void toggleReady()}>
            {me.isReady ? "Mark not ready" : "Mark ready"}
          </button>
        )}
        {isHost && (
          <button
            className="primary"
            disabled={busy || !canStart}
            onClick={() => void startOrRematch()}
          >
            {room.status === "between_games" ? "Start rematch" : "Start game"} ({readyCount} ready)
          </button>
        )}
        <button className="danger" disabled={busy} onClick={() => void leave()}>
          Leave room
        </button>
      </div>
    </div>
  );
}
