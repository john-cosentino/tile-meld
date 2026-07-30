import type { RedactedGameView } from "@tile-meld/shared";
import { portraitForSeat } from "../branding/portraits.js";

type OpponentStripProps = {
  readonly self: RedactedGameView["self"];
  readonly opponents: RedactedGameView["opponents"];
  readonly activeSeat: number;
  readonly gameStatus: RedactedGameView["status"];
};

// Deterministic by seat index (not DOM position) so the self card and
// every opponent card get a stable accent regardless of how many seats
// are actually present -- matches the approved concept's per-competitor
// color coding.
const ACCENT_BY_SEAT: readonly string[] = [
  "var(--neon-cyan)",
  "var(--neon-gold)",
  "var(--neon-purple)",
  "var(--neon-green)",
];
function accentFor(seatIndex: number): string {
  return ACCENT_BY_SEAT[seatIndex % ACCENT_BY_SEAT.length]!;
}

/**
 * The competitor rail: a large-portrait card for the current player plus
 * one per opponent, each framed with the approved competitor-card-frame
 * artwork (tinted per seat in CSS -- see .competitor-card::before in
 * global.css) and, when active, the approved glow overlay. Name, rack
 * tile COUNT (never contents -- redaction is enforced server-side, this
 * component never receives rack contents to leak in the first place),
 * resigned state, computer indication, and whose turn it currently is are
 * all real data; text is always the source of truth, the portrait/frame
 * is decorative only.
 */
export function OpponentStrip({ self, opponents, activeSeat, gameStatus }: OpponentStripProps) {
  const selfIsActive = activeSeat === self.seatIndex && gameStatus === "active";
  return (
    <div className="tabletop-competitors">
      <div
        className={`competitor-card competitor-card--self${selfIsActive ? " competitor-card--active" : ""}`}
        style={{ ["--seat-accent" as string]: accentFor(self.seatIndex) }}
      >
        <img
          className="opponent-portrait"
          src={portraitForSeat(self.seatIndex, false)}
          alt=""
          width={96}
          height={96}
          decoding="async"
        />
        <span>
          {self.displayName} <span aria-hidden="true">(You)</span>
        </span>
        <span className="muted">
          {self.rackCount} tiles
          {self.status === "resigned" ? " (resigned)" : ""}
          {selfIsActive && <span aria-hidden="true"> ⏳</span>}
        </span>
      </div>

      {opponents.length > 0 && (
        <ul className="tabletop-opponents" aria-label="Opponents">
          {opponents.map((o) => {
            const isActive = activeSeat === o.seatIndex && gameStatus === "active";
            return (
              <li
                key={o.seatIndex}
                className={`competitor-card opponent-row${isActive ? " opponent-row--active" : ""}`}
                style={{ ["--seat-accent" as string]: accentFor(o.seatIndex) }}
              >
                <img
                  className="opponent-portrait"
                  src={portraitForSeat(o.seatIndex, o.isComputer)}
                  alt=""
                  width={96}
                  height={96}
                  decoding="async"
                />
                <span>
                  {o.displayName}
                  {/* Emoji aria-hidden (Phase 7 §13.2 "decorative layers ...
                      silent") -- redundant with the "BOT"/text already
                      elsewhere on the row; kept visible, just not
                      double-announced. Whitespace matches the previous plain
                      string exactly so rendered text (and existing
                      getByText(/🤖:...tiles/) queries, which match textContent
                      regardless of aria-hidden) is unchanged. */}
                  {o.isComputer && <span aria-hidden="true"> 🤖</span>}: {o.rackCount} tiles
                  {o.status === "resigned" ? " (resigned)" : ""}
                  {isActive && <span aria-hidden="true"> ⏳</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
