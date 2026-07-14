// Public API of the pure, server-authoritative game-rules engine.
// No React, DB, network, Date.now(), or Math.random() -- see
// docs/opus-implementation-plan.md §4.2/§4.3. Time and randomness are
// always injected by the caller.

export {
  COLORS,
  MIN_VALUE,
  MAX_VALUE,
  type Color,
  type Value,
  type Tile,
  type NumberedTile,
  type JokerTile,
  type JokerAssignment,
  type RandomInt,
  type SetInvalidReason,
  type RunValidationResult,
  type GroupValidationResult,
  type SetValidationResult,
  type ConservationResult,
} from "./types.js";

export { createTileCatalog, hasDuplicateTileIds } from "./tiles.js";
export { shuffle } from "./shuffle.js";
export {
  MIN_SET_LENGTH,
  MAX_RUN_LENGTH,
  MAX_GROUP_LENGTH,
  validateRun,
  validateGroup,
  validateSet,
} from "./sets.js";
export { checkConservation } from "./conservation.js";

export {
  type SeatStatus,
  type Seat,
  type TableSet,
  type GameStatus,
  type GameState,
  type TurnInvalidReason,
  type ValidTurnResult,
  type InvalidTurnResult,
  type TurnValidationResult,
  type TurnEvent,
  type GameEndReason,
  type GameEndCheck,
  type ScoreEntry,
  type GameEndResult,
  type TransitionResult,
} from "./game-types.js";

export {
  JOKER_RACK_PENALTY,
  rackFaceValue,
  setFaceValue,
  detectGameEnd,
  score,
} from "./scoring.js";

export {
  validateTurn,
  applyCommit,
  applyDraw,
  applyPass,
  applyTimeout,
  applyResign,
} from "./turns.js";
