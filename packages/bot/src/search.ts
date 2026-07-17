import type { Candidate } from "./candidates.js";

// Deterministic branch-and-bound set-packing over disjoint candidate sets.
// Chooses the best complete turn under the approved ranking (docs plan §6):
//   1. a winning move (empties the rack);
//   2. greatest number of rack tiles played;
//   3. greatest face value played;
//   4. stable canonical serialization (candidate resource keys) tie-break.
// Bounded by a fixed NODE COUNT, never a wall clock, so the selected move is
// identical for identical input regardless of machine speed.

/** Mirrors the engine's private initial-meld threshold (packages/engine
 * turns.ts). Used ONLY as a pre-initial-meld search filter; validateTurn is
 * the authoritative gate that independently enforces it at emission, so a
 * generated commit can never be illegal even if this ever drifted. */
export const INITIAL_MELD_THRESHOLD = 30;

export const DEFAULT_MAX_NODES = 100_000;

export type SearchInput = {
  readonly hasInitialMeld: boolean;
  readonly rackSize: number;
};

type Turn = {
  readonly combo: readonly Candidate[];
  readonly tilesPlayed: number;
  readonly faceValuePlayed: number;
  readonly wins: boolean;
  readonly serialization: string;
};

/** Canonical ordering for the DFS: bigger plays first (better bounds sooner),
 * ties broken by the stable resource key. Exploration order does not change
 * which turn is selected -- the comparator + serialization tie-break make the
 * winner deterministic -- but it makes pruning effective. */
export function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.tilesPlayed !== b.tilesPlayed) return b.tilesPlayed - a.tilesPlayed;
  if (a.faceValuePlayed !== b.faceValuePlayed) return b.faceValuePlayed - a.faceValuePlayed;
  return a.resourceKey < b.resourceKey ? -1 : a.resourceKey > b.resourceKey ? 1 : 0;
}

function isBetter(candidate: Turn, best: Turn): boolean {
  if (candidate.wins !== best.wins) return candidate.wins;
  if (candidate.tilesPlayed !== best.tilesPlayed) return candidate.tilesPlayed > best.tilesPlayed;
  if (candidate.faceValuePlayed !== best.faceValuePlayed) {
    return candidate.faceValuePlayed > best.faceValuePlayed;
  }
  return candidate.serialization < best.serialization;
}

export type SearchResult = {
  readonly combo: readonly Candidate[] | null;
  readonly nodesVisited: number;
  readonly budgetExceeded: boolean;
};

/**
 * `candidates` MUST already be sorted by `compareCandidates`. Returns the best
 * disjoint combination found, plus instrumentation (nodes visited, whether the
 * budget was hit) for observability and tests.
 */
export function search(
  input: SearchInput,
  candidates: readonly Candidate[],
  jokerCount: number,
  maxNodes: number,
): SearchResult {
  // Suffix sums of tilesPlayed -- a loose upper bound on how many more rack
  // tiles the remaining candidates could add, for branch-and-bound pruning.
  const suffixTiles = new Array<number>(candidates.length + 1).fill(0);
  for (let i = candidates.length - 1; i >= 0; i--) {
    suffixTiles[i] = suffixTiles[i + 1]! + candidates[i]!.tilesPlayed;
  }

  // Held in an object so TypeScript's control-flow analysis doesn't narrow it
  // across the nested closures below.
  const bestBox: { turn: Turn | null } = { turn: null };
  let nodes = 0;
  let budgetExceeded = false;

  const chosen: Candidate[] = [];
  const usedRack = new Set<string>();
  const usedTargets = new Set<number>();
  let usedJokers = 0;
  let tilesPlayed = 0;
  let faceValuePlayed = 0;

  const consider = (): void => {
    if (chosen.length === 0) return;
    // Pre-initial-meld, only a rack-only meld reaching the threshold is legal.
    if (!input.hasInitialMeld && faceValuePlayed < INITIAL_MELD_THRESHOLD) return;
    const wins = tilesPlayed === input.rackSize;
    const serialization = chosen
      .map((c) => c.resourceKey)
      .sort()
      .join(";");
    const turn: Turn = {
      combo: [...chosen],
      tilesPlayed,
      faceValuePlayed,
      wins,
      serialization,
    };
    if (bestBox.turn === null || isBetter(turn, bestBox.turn)) bestBox.turn = turn;
  };

  const dfs = (start: number): void => {
    if (budgetExceeded) return;
    nodes++;
    if (nodes > maxNodes) {
      budgetExceeded = true;
      return;
    }
    consider();
    // A win empties the rack: nothing can beat it, so stop everywhere.
    if (bestBox.turn?.wins) return;

    for (let i = start; i < candidates.length; i++) {
      // Prune: if even taking every remaining candidate can't out-play the
      // best tile count, this subtree cannot improve on it.
      if (bestBox.turn && tilesPlayed + suffixTiles[i]! < bestBox.turn.tilesPlayed) return;

      const candidate = candidates[i]!;
      if (candidate.targetIndex !== null && usedTargets.has(candidate.targetIndex)) continue;
      if (usedJokers + candidate.jokersUsed > jokerCount) continue;
      let overlaps = false;
      for (const id of candidate.usedRackTileIds) {
        if (usedRack.has(id)) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;

      chosen.push(candidate);
      for (const id of candidate.usedRackTileIds) usedRack.add(id);
      usedJokers += candidate.jokersUsed;
      if (candidate.targetIndex !== null) usedTargets.add(candidate.targetIndex);
      tilesPlayed += candidate.tilesPlayed;
      faceValuePlayed += candidate.faceValuePlayed;

      dfs(i + 1);

      chosen.pop();
      for (const id of candidate.usedRackTileIds) usedRack.delete(id);
      usedJokers -= candidate.jokersUsed;
      if (candidate.targetIndex !== null) usedTargets.delete(candidate.targetIndex);
      tilesPlayed -= candidate.tilesPlayed;
      faceValuePlayed -= candidate.faceValuePlayed;

      if (budgetExceeded) return;
    }
  };

  dfs(0);
  return {
    combo: bestBox.turn ? bestBox.turn.combo : null,
    nodesVisited: nodes,
    budgetExceeded,
  };
}
