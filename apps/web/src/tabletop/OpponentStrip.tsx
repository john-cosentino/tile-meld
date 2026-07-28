import type { RedactedGameView } from "@tile-meld/shared";
import { portraitForSeat } from "../branding/portraits.js";

type OpponentStripProps = {
  readonly opponents: RedactedGameView["opponents"];
  readonly activeSeat: number;
  readonly gameStatus: RedactedGameView["status"];
};

/**
 * The minimum useful opponent information (Phase 8): name, rack tile
 * COUNT (never contents -- redaction is enforced server-side, this
 * component never receives rack contents to leak in the first place),
 * resigned state, computer indication, and whose turn it currently is. A
 * semantic list rather than a bare row of spans, wrapped in a labelled
 * region so a screen-reader user can jump straight to "Opponents" instead
 * of reading through table/rack content to find it.
 */
export function OpponentStrip({ opponents, activeSeat, gameStatus }: OpponentStripProps) {
  if (opponents.length === 0) return null;
  return (
    <ul className="tabletop-opponents" aria-label="Opponents">
      {opponents.map((o) => {
        const isActive = activeSeat === o.seatIndex && gameStatus === "active";
        return (
          <li
            key={o.seatIndex}
            className={`opponent-row${isActive ? " opponent-row--active" : ""}`}
          >
            <img
              className="opponent-portrait"
              src={portraitForSeat(o.seatIndex, o.isComputer)}
              alt=""
              width={36}
              height={36}
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
  );
}
