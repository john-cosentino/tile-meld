// Public API of packages/shared: Zod DTO schemas + inferred types for every
// HTTP/WS message, shared by apps/server (for request/response validation)
// and, later, apps/web (for client-side type-safety). Depends on nothing
// but zod -- see docs/opus-implementation-plan.md §4.2.

export * from "./schemas/game.js";
export * from "./schemas/identity.js";
export * from "./schemas/rooms.js";
export * from "./schemas/realtime.js";
