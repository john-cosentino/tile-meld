// Character-portrait registry (Phase 5,
// docs/meld-masters-visual-refresh-plan.md §9.3 and §11 Phase 5). The
// approved production assets live in apps/web/src/assets/portraits/ (see
// that directory's README for provenance/derivation); this module is the
// only place that imports them, and the only place that decides which
// portrait a given seat/participant gets.
//
// Deterministic mapping strategy: `portraitForSeat(seatIndex, isComputer)`
// picks a portrait purely as a function of its inputs -- no randomness, no
// stored/persisted selection, no server round-trip. A human seat gets
// `ROSTER[seatIndex % ROSTER.length]`, so the same seat index always maps
// to the same rival portrait for the lifetime of a room/game (seat indices
// don't change mid-game), and it degrades gracefully (via modulo, never an
// out-of-range access) for any capacity this app supports (2-4 seats,
// far under the 8-portrait roster, but wrapping is harmless if that ever
// changes). No dedicated "bot" portrait was included in the delivered
// asset pack (unlike the plan's original §9.3 sketch, which assumed one) --
// the computer opponent instead gets FALLBACK, which reads reasonably as a
// neutral, non-human character on its own merits, not merely as an error
// state. See the Phase 5 summary for the full discussion of this
// deviation from the original plan text.

import rival01 from "../assets/portraits/portrait-rival-01.png";
import rival02 from "../assets/portraits/portrait-rival-02.png";
import rival03 from "../assets/portraits/portrait-rival-03.png";
import rival04 from "../assets/portraits/portrait-rival-04.png";
import rival05 from "../assets/portraits/portrait-rival-05.png";
import rival06 from "../assets/portraits/portrait-rival-06.png";
import rival07 from "../assets/portraits/portrait-rival-07.png";
import rival08 from "../assets/portraits/portrait-rival-08.png";
import fallback from "../assets/portraits/portrait-fallback.png";

/** The 8 approved rival portraits, in a stable order -- index 0..7. Never
 * reordered at runtime; `portraitForSeat` is what makes the mapping to a
 * seat deterministic, not the order of this array changing. */
export const PORTRAIT_ROSTER: readonly string[] = [
  rival01,
  rival02,
  rival03,
  rival04,
  rival05,
  rival06,
  rival07,
  rival08,
];

/** Used whenever a specific portrait can't be resolved (out-of-range
 * index, missing data) and for the computer opponent (no dedicated bot
 * portrait was supplied -- see the module comment above). Always a real,
 * intentional portrait asset, never a broken-image state. */
export const PORTRAIT_FALLBACK: string = fallback;

/**
 * Deterministically resolves the portrait for one seat. Pure function of
 * its inputs -- same seatIndex/isComputer always returns the same URL, so
 * a participant's portrait stays stable for the whole room/game flow
 * without needing to store a selection anywhere.
 *
 * - Computer seats always get the fallback (no dedicated bot art was
 *   supplied -- see the module comment above).
 * - Human seats cycle through the 8-portrait roster by seat index modulo
 *   the roster length, so any seat index (including one from a room
 *   capacity larger than 8, or a negative/NaN value from malformed data)
 *   resolves to a real portrait, never an out-of-bounds access.
 */
export function portraitForSeat(seatIndex: number, isComputer: boolean): string {
  if (isComputer) return PORTRAIT_FALLBACK;
  if (!Number.isInteger(seatIndex) || seatIndex < 0) return PORTRAIT_FALLBACK;
  return PORTRAIT_ROSTER[seatIndex % PORTRAIT_ROSTER.length] ?? PORTRAIT_FALLBACK;
}

/**
 * Resolves a participant's portrait with their account pick taking
 * precedence (accounts plan, Phase C): a valid `portraitId` (an integer
 * index into the roster, from the wire's `portraitId` field) wins;
 * anything else -- null (no pick yet), out-of-range, or non-integer --
 * falls back to the legacy deterministic seat mapping. Computer seats
 * always get the fallback portrait regardless of data.
 */
export function portraitForPlayer(
  portraitId: number | null | undefined,
  seatIndex: number,
  isComputer: boolean,
): string {
  if (isComputer) return PORTRAIT_FALLBACK;
  if (
    typeof portraitId === "number" &&
    Number.isInteger(portraitId) &&
    portraitId >= 0 &&
    portraitId < PORTRAIT_ROSTER.length
  ) {
    return PORTRAIT_ROSTER[portraitId] ?? PORTRAIT_FALLBACK;
  }
  return portraitForSeat(seatIndex, isComputer);
}
