// Public API of the pure deterministic computer-opponent move generator.
// PURE: depends only on @tile-meld/engine; no DB, network, env, logging,
// timers, Date.now(), or Math.random(). See docs plan §4/§6.

export { generateBotTurn } from "./generate.js";
export { DEFAULT_MAX_NODES } from "./search.js";
export type { BotTurnInput, BotDecision, BotCommit, BotDraw, BotPass, BotConfig } from "./types.js";

// Lower-level helpers exposed for white-box unit/property tests (candidate
// generation and the search's instrumentation). Not part of the orchestration
// contract the server depends on.
export { generateCandidates, countJokers, type Candidate } from "./candidates.js";
export {
  search,
  compareCandidates,
  INITIAL_MELD_THRESHOLD,
  type SearchInput,
  type SearchResult,
} from "./search.js";
