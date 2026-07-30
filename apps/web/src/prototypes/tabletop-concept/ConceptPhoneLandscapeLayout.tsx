import { ConceptBrandMark } from "./ConceptBrandMark.js";
import { ConceptPlaque, ConceptPlaqueLabel, ConceptPlaqueValue } from "./ConceptPlaque.js";
import { ConceptCompetitorCard } from "./ConceptCompetitorRail.js";
import { ConceptBoard } from "./ConceptBoard.js";
import { ConceptRack } from "./ConceptRack.js";
import { ConceptActionBar } from "./ConceptActionBar.js";
import { MOCK_COMPETITORS, MOCK_MOVE_LOG, MOCK_STATUS } from "./mockData.js";

/** Fixed 844x390 design canvas -- a dedicated landscape cabinet, not the
 * portrait artboard cropped. Compact masthead strip, a competitor rail of
 * horizontal cards (portrait beside name/score, not stacked), board+rack
 * dominating the center, and a narrow right rail carrying turn/countdown,
 * a trimmed move log, and the action grid (no room for a separate
 * how-to-play panel at this height -- actions take that slot instead,
 * since they're the higher-priority region per the brief). */
export function ConceptPhoneLandscapeLayout() {
  return (
    <div className="concept-phone-landscape">
      <header className="concept-masthead">
        <ConceptPlaque>
          <ConceptPlaqueLabel>{MOCK_STATUS.league}</ConceptPlaqueLabel>
          <ConceptPlaqueValue>{MOCK_STATUS.season}</ConceptPlaqueValue>
        </ConceptPlaque>
        <ConceptBrandMark />
        <ConceptPlaque>
          <ConceptPlaqueLabel>
            Round {MOCK_STATUS.round}/{MOCK_STATUS.totalRounds}
          </ConceptPlaqueLabel>
          <ConceptPlaqueValue>Target {MOCK_STATUS.targetScore}</ConceptPlaqueValue>
        </ConceptPlaque>
      </header>

      <div className="concept-main">
        <div className="concept-rail" aria-hidden="true">
          {MOCK_COMPETITORS.map((c) => (
            <ConceptCompetitorCard c={c} key={c.seatIndex} />
          ))}
        </div>

        <div className="concept-center">
          <ConceptBoard />
          <ConceptRack />
        </div>

        <div className="concept-panel concept-sidebar" aria-hidden="true">
          <div className="concept-sidebar-section concept-sidebar-section--turn">
            <span className="concept-turn-badge">Your Turn</span>
            <span className="concept-turn-countdown">{MOCK_STATUS.turnCountdown}</span>
          </div>
          <div className="concept-sidebar-section concept-sidebar-section--movelog">
            <h2 className="concept-sidebar-title">Move Log</h2>
            {MOCK_MOVE_LOG.slice(0, 3).map((entry, i) => (
              <div className="concept-movelog-row" key={i}>
                <span className="concept-movelog-who">{entry.who}</span>
                <span className="concept-movelog-what">{entry.what}</span>
              </div>
            ))}
          </div>
          <div className="concept-sidebar-section concept-sidebar-section--actions">
            <ConceptActionBar />
          </div>
        </div>
      </div>
    </div>
  );
}
