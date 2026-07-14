import type { RandomInt } from "./types.js";

/**
 * Fisher-Yates shuffle. Pure: returns a new array and never mutates the
 * input. Randomness is injected via `randomInt` -- the caller (server)
 * supplies a CSPRNG-backed implementation; the engine itself never calls
 * Math.random(). See docs/opus-implementation-plan.md D-SHUFFLE.
 */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}
