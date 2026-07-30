import { ConceptBrandMark } from "./ConceptBrandMark.js";
import { ConceptPlaqueLabel, ConceptPlaqueValue } from "./ConceptPlaque.js";
import { ConceptCompetitorCard } from "./ConceptCompetitorRail.js";
import { ConceptBoard } from "./ConceptBoard.js";
import { ConceptRack } from "./ConceptRack.js";
import { ConceptActionBar } from "./ConceptActionBar.js";
import { MOCK_COMPETITORS, MOCK_MOVE_LOG, MOCK_STATUS } from "./mockData.js";

/** Fixed 390x844 design canvas, matching concept-04's actual composition:
 * a compact masthead, then self+opponent cards INTEGRATED into one row
 * with the round/target status between them (not a separate status strip
 * above/below, which is what made the earlier version too tall), then
 * board/rack/support/actions/footer -- every region sized to a measured
 * height budget so the whole thing fits in 844px with zero scroll. */
export function ConceptPhonePortraitLayout() {
  const [self, opponent] = MOCK_COMPETITORS;
  return (
    <div className="concept-phone-portrait">
      <header className="concept-masthead">
        <ConceptBrandMark />
      </header>

      <div className="concept-player-row" aria-hidden="true">
        <ConceptCompetitorCard c={self!} />
        <div className="concept-panel concept-status-center">
          <ConceptPlaqueLabel>
            Round {MOCK_STATUS.round} / {MOCK_STATUS.totalRounds}
          </ConceptPlaqueLabel>
          <ConceptPlaqueValue>Target {MOCK_STATUS.targetScore}</ConceptPlaqueValue>
          <ConceptPlaqueLabel>{MOCK_STATUS.tableName}</ConceptPlaqueLabel>
        </div>
        <ConceptCompetitorCard c={opponent!} />
      </div>

      <ConceptBoard />
      <ConceptRack />

      <div className="concept-support-row" aria-hidden="true">
        <div className="concept-panel concept-sidebar-section">
          <h2 className="concept-sidebar-title">Move Log</h2>
          {MOCK_MOVE_LOG.slice(0, 3).map((entry, i) => (
            <div className="concept-movelog-row" key={i}>
              <span className="concept-movelog-who">{entry.who}</span>
              <span className="concept-movelog-what">{entry.what}</span>
            </div>
          ))}
        </div>
        <div className="concept-panel concept-sidebar-section">
          <h2 className="concept-sidebar-title">Tip</h2>
          <p className="concept-tip">"{MOCK_STATUS.tip}"</p>
        </div>
      </div>

      <ConceptActionBar />

      <footer className="concept-phone-footer" aria-hidden="true">
        <span>{MOCK_STATUS.league}</span>
        <strong>{MOCK_STATUS.season}</strong>
      </footer>
    </div>
  );
}
