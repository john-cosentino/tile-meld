// Consistent friendly-room-name display (Phase 2: docs/next-changes-
// implementation-plan.md). Falls back to the opaque code for legacy rooms
// created before server-generated names existed.
export function formatRoomName(room: {
  readonly name: string | null;
  readonly code: string;
}): string {
  return room.name ?? `Room ${room.code}`;
}
