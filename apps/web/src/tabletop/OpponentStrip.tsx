import type { RedactedGameView } from "@tile-meld/shared";
import { portraitForPlayer } from "../branding/portraits.js";

type OpponentStripProps = {
  readonly self: RedactedGameView["self"];
  readonly opponents: RedactedGameView["opponents"];
  readonly activeSeat: number;
  readonly gameStatus: RedactedGameView["status"];
};

// Deterministic by seat index (not DOM position) so the self card and
// every opponent card get a stable accent regardless of how many seats
// are actually present -- matches the concept's per-competitor color
// coding (concept-01's YOU/RICO/PIXIE/T-BONE card frames: gold, purple,
// pink, green). The tone selects a concept-sliced frame in
// arcade-kit.css; the accent colors the text.
const TONES = ["gold", "purple", "pink", "green"] as const;
const ACCENT_BY_TONE: Record<(typeof TONES)[number], string> = {
  gold: "var(--neon-gold)",
  purple: "var(--neon-purple)",
  pink: "var(--neon-pink)",
  green: "var(--neon-green)",
};
function toneFor(seatIndex: number): (typeof TONES)[number] {
  return TONES[seatIndex % TONES.length]!;
}
function accentFor(seatIndex: number): string {
  return ACCENT_BY_TONE[toneFor(seatIndex)];
}

/**
 * The competitor rail: a horizontal, name-truncation-safe card for the
 * current player plus one per opponent, each framed with the approved
 * competitor-card-frame artwork (tinted per seat in CSS -- see
 * .competitor-card::before in global.css) and, when active, the approved
 * glow overlay. Name and meta (tile count/resigned/computer/active) are
 * deliberately split onto two lines -- the name alone truncates with an
 * ellipsis (CSS only, via .competitor-name) so a long generated username
 * can never push the meta text out of the frame or grow the card past
 * its rail column, while the meta line (needed verbatim by existing
 * tests/e2e specs -- see TabletopLayout.test.tsx and vs-computer.spec.ts's
 * "🤖: N tiles" pattern) is untouched from its previous single-span
 * composition, just relocated onto its own line. Rack tile COUNT (never
 * contents -- redaction is enforced server-side, this component never
 * receives rack contents to leak in the first place) is the only game
 * data shown; the portrait/frame/badge are decorative only.
 */
export function OpponentStrip({ self, opponents, activeSeat, gameStatus }: OpponentStripProps) {
  const selfIsActive = activeSeat === self.seatIndex && gameStatus === "active";
  return (
    <div className="tabletop-competitors" tabIndex={0}>
      <div
        className={`competitor-card competitor-card--tone-${toneFor(self.seatIndex)} competitor-card--self${selfIsActive ? " competitor-card--active" : ""}`}
        style={{ ["--seat-accent" as string]: accentFor(self.seatIndex) }}
      >
        <img
          className="opponent-portrait"
          src={portraitForPlayer(self.portraitId, self.seatIndex, false)}
          alt=""
          width={64}
          height={96}
          decoding="async"
        />
        <div className="competitor-info">
          <span className="competitor-name-row">
            <span className="competitor-name" title={self.displayName}>
              {self.displayName}
            </span>
            <span className="competitor-you-badge" aria-hidden="true">
              You
            </span>
          </span>
          <span className="muted competitor-meta">
            {self.rackCount} tiles
            {self.status === "resigned" ? " (resigned)" : ""}
            {selfIsActive && <span aria-hidden="true"> ⏳</span>}
          </span>
        </div>
      </div>

      {opponents.length > 0 && (
        <ul className="tabletop-opponents" aria-label="Opponents">
          {opponents.map((o) => {
            const isActive = activeSeat === o.seatIndex && gameStatus === "active";
            return (
              <li
                key={o.seatIndex}
                className={`competitor-card competitor-card--tone-${toneFor(o.seatIndex)} opponent-row${isActive ? " opponent-row--active" : ""}`}
                style={{ ["--seat-accent" as string]: accentFor(o.seatIndex) }}
              >
                <img
                  className="opponent-portrait"
                  src={portraitForPlayer(o.portraitId, o.seatIndex, o.isComputer)}
                  alt=""
                  width={64}
                  height={96}
                  decoding="async"
                />
                <div className="competitor-info">
                  <span className="competitor-name" title={o.displayName}>
                    {o.displayName}
                  </span>
                  <span className="muted competitor-meta">
                    {o.isComputer && <span aria-hidden="true">🤖 </span>}
                    {o.rackCount} tiles
                    {o.status === "resigned" ? " (resigned)" : ""}
                    {isActive && <span aria-hidden="true"> ⏳</span>}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
