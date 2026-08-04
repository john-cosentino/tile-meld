// Per-route rate limit configs for @fastify/rate-limit, applied via each
// route's `config.rateLimit`. Recovery gets the tightest limit + backoff
// per docs/opus-implementation-plan.md §9.2.

export const identityCreateLimit = { max: 10, timeWindow: "1 minute" };
export const recoveryLimit = { max: 5, timeWindow: "1 minute" };
// A claim is a rare, once-per-identity action; kept tight (like recovery)
// against username-availability probing.
export const usernameClaimLimit = { max: 10, timeWindow: "1 minute" };
// Account endpoints (accounts plan, Phase B). Registration is as cheap to
// abuse as identity creation was, so it inherits similar tightness; login
// is the online-guessing surface (generic errors + this limit are the v1
// brute-force posture -- per-username lockout is a documented deferral);
// reset requests each send an email, hence the tightest bucket here.
export const registerLimit = { max: 5, timeWindow: "1 minute" };
export const loginLimit = { max: 10, timeWindow: "1 minute" };
export const resetRequestLimit = { max: 3, timeWindow: "1 minute" };
export const resetConfirmLimit = { max: 5, timeWindow: "1 minute" };
// Change-password / upgrade / logout / portrait: authenticated, rare, but
// credential-adjacent -- keep them tight without being obstructive.
export const accountMutationLimit = { max: 10, timeWindow: "1 minute" };
export const roomCreateLimit = { max: 20, timeWindow: "1 minute" };
// Tighter than a normal room create: a bot room spins up two members and a
// bot actor, so guard against automated churn / DoS (docs plan §11).
export const vsComputerCreateLimit = { max: 10, timeWindow: "1 minute" };
export const roomJoinLimit = { max: 30, timeWindow: "1 minute" };
export const publicLobbyLimit = { max: 60, timeWindow: "1 minute" };
export const roomActionLimit = { max: 60, timeWindow: "1 minute" };
