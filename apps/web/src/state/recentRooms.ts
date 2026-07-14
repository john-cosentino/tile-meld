// The server has no "list my rooms" endpoint (there's no accounts system
// to aggregate against in the MVP) -- the home dashboard instead remembers
// which rooms this browser has created or joined, client-side, and
// re-fetches each one's live status via GET /api/rooms/:id. A room that
// 404s (past its 48h-inactivity retention window) is dropped silently.

const STORAGE_KEY = "tilemeld.recentRooms";
const MAX_RECENT = 20;

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function write(ids: readonly string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export function listRecentRoomIds(): string[] {
  return read();
}

export function addRecentRoom(roomId: string): void {
  const existing = read().filter((id) => id !== roomId);
  write([roomId, ...existing].slice(0, MAX_RECENT));
}

export function removeRecentRoom(roomId: string): void {
  write(read().filter((id) => id !== roomId));
}
