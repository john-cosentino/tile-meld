import { INITIAL_MELD_THRESHOLD } from "@tile-meld/shared";

/**
 * Progressive rule help (Phase 6 stabilization: "prefer progressive help
 * over a large permanent wall of instructions... do not obstruct
 * experienced players with a mandatory tutorial every time"). A native
 * <details>/<summary> disclosure -- collapsed by default, zero JS,
 * keyboard/screen-reader accessible for free via native semantics, and
 * nothing to persist across sessions (unlike a dismissible modal). Lives
 * in the info rail, the same "existing help area" the mascot tip already
 * uses, rather than a new panel. Every rule stated here must match the
 * real engine behavior -- see packages/engine/src/{sets,turns,scoring}.ts;
 * this is documentation of existing rules, not a design decision.
 */
export function HowToPlay() {
  return (
    <details className="tabletop-how-to-play">
      <summary>How to play</summary>
      <ul>
        <li>Be the first to empty your rack by melding all your tiles into valid runs and sets.</li>
        <li>A run is 3 or more consecutive numbers, all the same color.</li>
        <li>A set is 3 or more tiles of the same number, each a different color.</li>
        <li>
          Your first meld(s) in the game must total at least {INITIAL_MELD_THRESHOLD} points before
          they count -- arrange tiles into sets on the table to build toward it.
        </li>
        <li>On your turn: draw a tile if you have no play, or arrange and commit one.</li>
        <li>Pass is only available once the tile pool is empty.</li>
        <li>
          Committing an arrangement the server rejects costs a 3-tile penalty and ends your turn --
          check the hints above the action buttons before committing.
        </li>
        <li>The game ends when a player melds their entire rack, or the pool runs out.</li>
      </ul>
    </details>
  );
}
