import type { RedactedGameView } from "@tile-meld/shared";

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
            {o.displayName}
            {o.isComputer ? " 🤖" : ""}: {o.rackCount} tiles
            {o.status === "resigned" ? " (resigned)" : ""}
            {isActive ? " ⏳" : ""}
          </li>
        );
      })}
    </ul>
  );
}
