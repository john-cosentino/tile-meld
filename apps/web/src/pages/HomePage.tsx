import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PRODUCT_NAME, type GetRoomResponse } from "@tile-meld/shared";
import { api, ApiError } from "../api/client.js";
import { listRecentRoomIds, removeRecentRoom } from "../state/recentRooms.js";

type RoomSummary = {
  readonly roomId: string;
  readonly code: string;
  readonly status: GetRoomResponse["status"];
  readonly latestGameId: string | null;
  readonly memberCount: number;
  readonly capacity: number;
};

export function HomePage() {
  const [rooms, setRooms] = useState<RoomSummary[] | undefined>(undefined);

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
              <strong>Room {room.code}</strong>
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

      <div className="row">
        <Link to="/rooms/new">
          <button className="primary">Create a room</button>
        </Link>
        <Link to="/rooms/join">
          <button>Join by code</button>
        </Link>
        <Link to="/lobby">
          <button>Browse public lobby</button>
        </Link>
      </div>
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
