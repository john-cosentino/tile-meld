// Per-route rate limit configs for @fastify/rate-limit, applied via each
// route's `config.rateLimit`. Recovery gets the tightest limit + backoff
// per docs/opus-implementation-plan.md §9.2.

export const identityCreateLimit = { max: 10, timeWindow: "1 minute" };
export const recoveryLimit = { max: 5, timeWindow: "1 minute" };
export const roomCreateLimit = { max: 20, timeWindow: "1 minute" };
// Tighter than a normal room create: a bot room spins up two members and a
// bot actor, so guard against automated churn / DoS (docs plan §11).
export const vsComputerCreateLimit = { max: 10, timeWindow: "1 minute" };
export const roomJoinLimit = { max: 30, timeWindow: "1 minute" };
export const publicLobbyLimit = { max: 60, timeWindow: "1 minute" };
export const roomActionLimit = { max: 60, timeWindow: "1 minute" };
