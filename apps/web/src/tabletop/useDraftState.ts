import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildInitialDraft,
  moveTile as applyMoveTile,
  reorderInSet as applyReorderInSet,
  reorderRack as applyReorderRack,
  type DraftState,
  type Destination,
} from "./draftState.js";

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
  const [present, setPresent] = useState<DraftState>(() =>
    buildInitialDraft(canonicalRack, canonicalTable),
  );
  const historyRef = useRef<DraftState[]>([]);
  const [historyLength, setHistoryLength] = useState(0);
  const lastVersionRef = useRef(version);

  useEffect(() => {
    if (lastVersionRef.current === version) return;
    lastVersionRef.current = version;
    historyRef.current = [];
    setHistoryLength(0);
    setPresent(buildInitialDraft(canonicalRack, canonicalTable));
    // canonicalRack/canonicalTable intentionally excluded from the
    // dependency array: this effect should fire only on a real version
    // change, not on every re-render that happens to pass a new array
    // instance with the same contents. (No react-hooks/exhaustive-deps
    // lint rule is configured in this project to enforce/complain about
    // this either way -- documented here for a human reader instead.)
  }, [version]);

  const commit = useCallback((updater: (s: DraftState) => DraftState) => {
    setPresent((prev) => {
      historyRef.current = [...historyRef.current, prev];
      setHistoryLength(historyRef.current.length);
      return updater(prev);
    });
  }, []);

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
    historyRef.current = [];
    setHistoryLength(0);
    setPresent(buildInitialDraft(canonicalRack, canonicalTable));
  }, [canonicalRack, canonicalTable]);

  const undo = useCallback(() => {
    setPresent((prev) => {
      const history = historyRef.current;
      if (history.length === 0) return prev;
      const last = history[history.length - 1]!;
      historyRef.current = history.slice(0, -1);
      setHistoryLength(historyRef.current.length);
      return last;
    });
  }, []);

  return {
    draft: present,
    moveTile,
    reorderInSet,
    reorderRack,
    reset,
    undo,
    canUndo: historyLength > 0,
  };
}
