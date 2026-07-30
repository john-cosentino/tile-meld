import type { RedactedGameView } from "@tile-meld/shared";
import { portraitForSeat } from "../branding/portraits.js";

type OpponentStripProps = {
  readonly self: RedactedGameView["self"];
  readonly opponents: RedactedGameView["opponents"];
  readonly activeSeat: number;
  readonly gameStatus: RedactedGameView["status"];
};

/**
 * The competitor rail (Meld Masters concept-01 left column): a large-portrait
 * card for the current player plus one per opponent. Name, rack tile COUNT
 * (never contents -- redaction is enforced server-side, this component never
 * receives rack contents to leak in the first place), resigned state,
 * computer indication, and whose turn it currently is are all real data;
 * text is always the source of truth, the portrait/accent frame is
 * decorative only.
 */
export function OpponentStrip({ self, opponents, activeSeat, gameStatus }: OpponentStripProps) {
  const selfIsActive = activeSeat === self.seatIndex && gameStatus === "active";
  return (
    <div className="tabletop-competitors">
      <div
        className={`competitor-card competitor-card--self${selfIsActive ? " competitor-card--active" : ""}`}
      >
        <img
          className="competitor-portrait"
          src={portraitForSeat(self.seatIndex, false)}
          alt=""
          width={96}
          height={96}
          decoding="async"
        />
        <span className="competitor-name">
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
              >
                <img
                  className="competitor-portrait"
                  src={portraitForSeat(o.seatIndex, o.isComputer)}
                  alt=""
                  width={96}
                  height={96}
                  decoding="async"
                />
                <span className="competitor-name">
                  {o.displayName}
                  {/* Emoji aria-hidden (Phase 7 §13.2 "decorative layers ...
                      silent") -- redundant with the "BOT"/text already
                      elsewhere on the row; kept visible, just not
                      double-announced. */}
                  {o.isComputer && <span aria-hidden="true"> 🤖</span>}
                </span>
                {/* Plain-text colon (not inside either span) so the row's
                    combined text content stays exactly "...🤖: N tiles..." --
                    e2e specs (vs-computer.spec.ts, rematch.spec.ts) regex-match
                    getByText(/🤖:\s*\d+\s*tiles/) against this element. */}
                {": "}
                <span className="muted">
                  {o.rackCount} tiles
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
