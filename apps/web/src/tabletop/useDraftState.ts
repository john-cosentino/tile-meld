import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildInitialDraft,
  moveTile as applyMoveTile,
  reorderInSet as applyReorderInSet,
  reorderRack as applyReorderRack,
  type DraftState,
  type Destination,
} from "./draftState.js";

// `present` plus its undo stack, held in ONE piece of state so every update is
// a pure function of the previous value. The prior version kept the history in
// a ref and a separate `historyLength` state, mutating the ref and calling
// setHistoryLength *inside* the setPresent updater -- an impure updater with a
// nested setState. React's StrictMode (enabled in main.tsx) double-invokes
// updaters in dev, which double-applied those side effects and could leave
// `historyLength`/`canUndo` out of sync with the actual history, occasionally
// disabling the Undo button so a click no-op'd. A single pure reducer is
// StrictMode-safe and keeps canUndo exactly consistent with the stack.
type DraftHistory = { readonly present: DraftState; readonly past: readonly DraftState[] };

/**
 * Owns the local draft plus its undo history, and resets to the canonical
 * turn-start state whenever `version` changes -- covers both "the server
 * confirmed my own commit" and "I reconnected/refreshed" (§10.2: refresh
 * discards the draft and restores canonical state, since the draft never
 * left this component).
 */
export function useDraftState(
  canonicalRack: readonly string[],
  canonicalTable: readonly (readonly string[])[],
  version: number,
) {
  const [state, setState] = useState<DraftHistory>(() => ({
    present: buildInitialDraft(canonicalRack, canonicalTable),
    past: [],
  }));
  const lastVersionRef = useRef(version);

  useEffect(() => {
    if (lastVersionRef.current === version) return;
    lastVersionRef.current = version;
    setState({ present: buildInitialDraft(canonicalRack, canonicalTable), past: [] });
    // canonicalRack/canonicalTable intentionally excluded from the
    // dependency array: this effect should fire only on a real version
    // change, not on every re-render that happens to pass a new array
    // instance with the same contents. (No react-hooks/exhaustive-deps
    // lint rule is configured in this project to enforce/complain about
    // this either way -- documented here for a human reader instead.)
  }, [version]);

  const commit = useCallback(
    (updater: (s: DraftState) => DraftState) =>
      setState((s) => ({ present: updater(s.present), past: [...s.past, s.present] })),
    [],
  );

  const moveTile = useCallback(
    (tileId: string, destination: Destination) =>
      commit((s) => applyMoveTile(s, tileId, destination)),
    [commit],
  );

  const reorderInSet = useCallback(
    (setId: string, tileId: string, direction: "left" | "right") =>
      commit((s) => applyReorderInSet(s, setId, tileId, direction)),
    [commit],
  );

  const reorderRack = useCallback(
    (newOrder: readonly string[]) => commit((s) => applyReorderRack(s, newOrder)),
    [commit],
  );

  const reset = useCallback(() => {
    setState({ present: buildInitialDraft(canonicalRack, canonicalTable), past: [] });
  }, [canonicalRack, canonicalTable]);

  const undo = useCallback(() => {
    setState((s) =>
      s.past.length === 0 ? s : { present: s.past[s.past.length - 1]!, past: s.past.slice(0, -1) },
    );
  }, []);

  return {
    draft: state.present,
    moveTile,
    reorderInSet,
    reorderRack,
    reset,
    undo,
    canUndo: state.past.length > 0,
  };
}
