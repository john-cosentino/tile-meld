// Remembers the player's last-used display name across rooms -- purely a
// convenience default for the create/join forms, not identity (room-scoped
// display names are validated unique-in-room server-side regardless).

const STORAGE_KEY = "tilemeld.displayName";

export function getDefaultDisplayName(): string {
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function setDefaultDisplayName(name: string): void {
  localStorage.setItem(STORAGE_KEY, name);
}
