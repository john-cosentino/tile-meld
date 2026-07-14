// A minimal in-memory sliding-window rate limiter for Socket.IO events.
// @fastify/rate-limit (used for every HTTP route -- see http/rateLimits.ts)
// only covers HTTP; docs/opus-implementation-plan.md §9.2 calls for rate
// limiting on chat too, which is socket-only, so it needs its own
// mechanism. In-memory state is fine for the single-process topology this
// project is deliberately built around (§8.2/D-SCHED) -- there's no second
// process for it to ever be inconsistent with.
//
// Tradeoff, accepted for MVP/friends-first scale (§9.1): a key for a
// player who rate-limits once and never sends chat again stays in the map
// indefinitely rather than being swept. Not worth a cleanup sweep at this
// project's expected traffic; revisit if that changes.

export type RateLimiter = {
  /** Returns true and records a hit if `key` is under its limit for the
   * current window; returns false (no hit recorded) if not. */
  readonly tryConsume: (key: string) => boolean;
};

export function createRateLimiter(maxEvents: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();

  function tryConsume(key: string): boolean {
    const now = Date.now();
    const windowStart = now - windowMs;
    const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
    if (recent.length >= maxEvents) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  }

  return { tryConsume };
}
