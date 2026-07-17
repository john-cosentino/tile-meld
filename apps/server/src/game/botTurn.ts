import { generateBotTurn, type BotDecision, type BotTurnInput } from "@tile-meld/bot";
import type { AppInstance } from "../http/types.js";
import { COMPUTER_PLAYER_ID } from "../db/botIdentity.js";
import { listGameSeatControllers, loadGameState } from "../db/repositories/games.js";
import { findIdempotentResult } from "../db/repositories/idempotencyKeys.js";
import {
  ActionError,
  commitTurn,
  drawTurn,
  passTurn,
  type TurnActionResult,
} from "./turnActions.js";

// Server-side computer-opponent orchestration -- docs plan §7 (Amendment 2:
// read snapshot -> generate OUTSIDE any transaction -> short locking write).
//
// The bot never mutates state directly and never re-implements the rules. It
// reads a bot-safe snapshot, asks the pure @tile-meld/bot generator for a
// move, then submits that move through the SAME authoritative pathway a human
// uses (commitTurn/drawTurn/passTurn in ./turnActions.ts). That pathway
// already provides the game-row lock, idempotency, version/turn optimistic
// concurrency, active-seat authorization, on-read overdue settlement, engine
// validation, persistence, event log, room scoring, and turn rotation -- so
// every duplicate / stale / concurrent / completed-game / wrong-seat execution
// collapses to a safe no-op here without any new locking code.
//
// The three stages are exposed separately (loadBotSnapshot / generateBotTurn /
// submitBotDecision) as well as composed (runBotTurn). The split is not just
// for tests: it is what guarantees the node-bounded search runs strictly
// between the read and the write, never while holding the games-row lock --
// generateBotTurn's type signature takes only a BotTurnInput, so a database
// handle cannot even be passed to it.

/** Why a bot-turn attempt did nothing. All are safe, expected outcomes -- a
 * no-op never corrupts or strands a game. */
export type BotNoopReason =
  | "game_not_active"
  | "no_current_turn"
  | "not_bot_seat"
  | "already_processed"
  | "stale_snapshot"
  | "seat_conflict";

export type BotTurnOutcome =
  | { readonly kind: "acted"; readonly result: TurnActionResult }
  | { readonly kind: "noop"; readonly reason: BotNoopReason };

/** What triggered this attempt -- for structured logs only. */
export type BotTrigger = "scheduled" | "recovered";

/**
 * The bot-safe snapshot: everything (and ONLY everything) the generator is
 * allowed to see, plus the optimistic-concurrency coordinates the write stage
 * will re-check under the lock. The human's private rack and the hidden pool
 * order are never represented here -- `input` carries the bot's own rack, the
 * public table, the bot's initial-meld flag, and a pool-non-empty boolean.
 */
export type BotSnapshot = {
  readonly gameId: string;
  readonly input: BotTurnInput;
  readonly snapshotVersion: number;
  readonly snapshotTurnId: string;
  readonly botSeatIndex: number;
  readonly idempotencyKey: string;
};

export type BotSnapshotResult =
  | { readonly ready: true; readonly snapshot: BotSnapshot }
  | { readonly ready: false; readonly reason: BotNoopReason };

/** The idempotency key for a bot turn is derived deterministically from the
 * turn it acts on, so every retry/duplicate for the same turn collapses onto
 * one persisted result. Global-bot-player scoped, so the turnId (a UUID)
 * guarantees global uniqueness. */
export function botIdempotencyKey(turnId: string): string {
  return `bot:${turnId}`;
}

/**
 * Stage 1 -- read a versioned, bot-safe snapshot with a plain (non-locking)
 * read. Returns `ready: false` with a reason when the active seat is not a
 * live computer turn, or when this turn was already acted on.
 */
export async function loadBotSnapshot(
  app: AppInstance,
  gameId: string,
): Promise<BotSnapshotResult> {
  const loaded = await loadGameState(app.db, gameId);
  if (loaded.status !== "active") return { ready: false, reason: "game_not_active" };
  if (!loaded.turnId) return { ready: false, reason: "no_current_turn" };

  const controllers = await listGameSeatControllers(app.db, gameId);
  if (controllers.get(loaded.activeSeat) !== "computer") {
    return { ready: false, reason: "not_bot_seat" };
  }
  const botSeat = loaded.seats.find((seat) => seat.seatIndex === loaded.activeSeat);
  if (!botSeat) return { ready: false, reason: "not_bot_seat" };

  const idempotencyKey = botIdempotencyKey(loaded.turnId);
  // Cheap short-circuit: if this exact turn was already acted on, skip. (The
  // write stage re-checks this under the lock, so it is an optimization, not
  // the correctness guard.)
  const already = await findIdempotentResult(app.db, COMPUTER_PLAYER_ID, idempotencyKey);
  if (already) return { ready: false, reason: "already_processed" };

  return {
    ready: true,
    snapshot: {
      gameId,
      input: {
        rack: botSeat.rack,
        table: loaded.table,
        hasInitialMeld: botSeat.hasInitialMeld,
        poolNonEmpty: loaded.pool.length > 0,
      },
      snapshotVersion: loaded.version,
      snapshotTurnId: loaded.turnId,
      botSeatIndex: botSeat.seatIndex,
      idempotencyKey,
    },
  };
}

/**
 * Stage 3 -- submit the generated decision through the authoritative pathway
 * in one short locking transaction. `commitTurn`/`drawTurn`/`passTurn` lock the
 * games row and re-check idempotency + version + turnId + active seat + status
 * + overdue-settlement, so a snapshot that went stale between stages, a
 * duplicate, a concurrent attempt, a completed game, or a seat that is no
 * longer the bot's all surface as an ActionError we translate to a safe no-op.
 * A stale generated result is therefore discarded, never applied.
 */
export async function submitBotDecision(
  app: AppInstance,
  snapshot: BotSnapshot,
  decision: BotDecision,
  trigger: BotTrigger,
  startedAt = Date.now(),
): Promise<BotTurnOutcome> {
  const params = {
    gameId: snapshot.gameId,
    playerId: COMPUTER_PLAYER_ID,
    expectedVersion: snapshot.snapshotVersion,
    turnId: snapshot.snapshotTurnId,
    idempotencyKey: snapshot.idempotencyKey,
  };

  try {
    let result: TurnActionResult;
    if (decision.kind === "commit") {
      result = await commitTurn(app, { ...params, arrangement: decision.arrangement });
    } else if (decision.kind === "draw") {
      result = await drawTurn(app, params);
    } else {
      result = await passTurn(app, params);
    }
    logActed(app, snapshot, trigger, decision, result, startedAt);
    return { kind: "acted", result };
  } catch (err) {
    if (err instanceof ActionError) {
      const reason = noopReasonForActionError(err);
      return logNoop(app, snapshot.gameId, trigger, reason, startedAt);
    }
    throw err;
  }
}

/**
 * Runs at most one computer-opponent action for `gameId` (compose of the three
 * stages). Safe to call redundantly -- from the fast-path timer AND the
 * recovery sweep, across multiple instances: at most one attempt ever mutates
 * the game; the rest return a `noop`.
 */
export async function runBotTurn(
  app: AppInstance,
  gameId: string,
  trigger: BotTrigger,
): Promise<BotTurnOutcome> {
  const startedAt = Date.now();
  const snap = await loadBotSnapshot(app, gameId);
  if (!snap.ready) return logNoop(app, gameId, trigger, snap.reason, startedAt);

  // Stage 2 -- pure generation, OUTSIDE any transaction. generateBotTurn takes
  // only a BotTurnInput; it holds no DB handle and no lock.
  const decision = generateBotTurn(snap.snapshot.input);

  return submitBotDecision(app, snap.snapshot, decision, trigger, startedAt);
}

function noopReasonForActionError(err: ActionError): BotNoopReason {
  switch (err.code) {
    case "stale":
      return "stale_snapshot";
    case "forbidden":
      return "seat_conflict";
    case "conflict":
    case "not_found":
      return "game_not_active";
    case "invalid":
      // A draw-on-empty-pool / pass-on-nonempty-pool mismatch caused by the
      // pool changing under us; treat as a stale snapshot no-op.
      return "stale_snapshot";
  }
}

// --- structured logging (safe fields only; docs plan §10) --------------------
// Never logs: rack contents, pool order, secrets, tokens, or unredacted state.

function logNoop(
  app: AppInstance,
  gameId: string,
  trigger: BotTrigger,
  reason: BotNoopReason,
  startedAt: number,
): BotTurnOutcome {
  app.log.debug(
    {
      event: "bot_turn",
      gameId,
      trigger,
      outcome: "noop",
      noopReason: reason,
      durationMs: Date.now() - startedAt,
    },
    "computer opponent no-op",
  );
  return { kind: "noop", reason };
}

function logActed(
  app: AppInstance,
  snapshot: BotSnapshot,
  trigger: BotTrigger,
  decision: BotDecision,
  result: TurnActionResult,
  startedAt: number,
): void {
  app.log.info(
    {
      event: "bot_turn",
      gameId: snapshot.gameId,
      turnId: snapshot.snapshotTurnId,
      botSeatIndex: snapshot.botSeatIndex,
      trigger,
      outcome: "acted",
      selectedAction: decision.kind,
      tilesPlayed: decision.kind === "commit" ? decision.tilesPlayed : 0,
      faceValuePlayed: decision.kind === "commit" ? decision.faceValuePlayed : 0,
      drew: decision.kind === "draw",
      gameEnded: result.gameEnd.ended,
      newVersion: result.version,
      durationMs: Date.now() - startedAt,
    },
    "computer opponent acted",
  );
}
