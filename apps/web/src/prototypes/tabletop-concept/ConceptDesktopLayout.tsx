import { ConceptBrandMark } from "./ConceptBrandMark.js";
import { ConceptPlaque, ConceptPlaqueLabel, ConceptPlaqueValue } from "./ConceptPlaque.js";
import { ConceptCompetitorRail } from "./ConceptCompetitorRail.js";
import { ConceptBoard } from "./ConceptBoard.js";
import { ConceptRack } from "./ConceptRack.js";
import { ConceptActionBar } from "./ConceptActionBar.js";
import { ConceptSidebar } from "./ConceptSidebar.js";
import { MOCK_COMPETITORS, MOCK_STATUS } from "./mockData.js";

/** Fixed 1440x900 design canvas -- see tabletop-concept.css's ".concept-
 * desktop" section for the measured region heights this targets (masthead
 * 155px, board 470px, rack 140px, actions fills the rest of the center
 * column, sidebar one continuous 3-section rail spanning the full row
 * height). All 4 competitors fit without clipping. */
export function ConceptDesktopLayout() {
  return (
    <div className="concept-desktop">
      <header className="concept-masthead">
        <ConceptPlaque>
          <ConceptPlaqueLabel>{MOCK_STATUS.league}</ConceptPlaqueLabel>
          <ConceptPlaqueValue>{MOCK_STATUS.season}</ConceptPlaqueValue>
        </ConceptPlaque>

        <ConceptBrandMark />

        <ConceptPlaque>
          <ConceptPlaqueLabel>
            Round {MOCK_STATUS.round} of {MOCK_STATUS.totalRounds}
          </ConceptPlaqueLabel>
          <ConceptPlaqueValue>Target {MOCK_STATUS.targetScore}</ConceptPlaqueValue>
          <ConceptPlaqueLabel>Table: {MOCK_STATUS.tableName}</ConceptPlaqueLabel>
        </ConceptPlaque>
      </header>

      <div className="concept-main">
        <ConceptCompetitorRail competitors={MOCK_COMPETITORS} />

        <div className="concept-center">
          <ConceptBoard />
          <ConceptRack />
          <ConceptActionBar />
        </div>

        <ConceptSidebar />
      </div>
    </div>
  );
}
