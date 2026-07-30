import "./tabletop-concept.css";
import { ConceptMasthead } from "./ConceptMasthead.js";
import { ConceptCompetitorRail } from "./ConceptCompetitorRail.js";
import { ConceptBoard } from "./ConceptBoard.js";
import { ConceptRack } from "./ConceptRack.js";
import { ConceptActionBar } from "./ConceptActionBar.js";
import { ConceptSidebar } from "./ConceptSidebar.js";
import { ConceptOverlay } from "./ConceptOverlay.js";

/**
 * Static, disconnected visual prototype of the Meld Masters tabletop
 * concept art. No live hooks (useGame/useDraftState/socket/room/recovery),
 * no API requests, no identity, no gameplay logic -- see
 * docs/meld-masters-tabletop-static-prototype-summary.md. Rendered outside
 * RootLayout/AuthProvider/AnnouncerProvider entirely (App.tsx) and only
 * reachable when PROTOTYPE_ROUTE_ENABLED is true (devOnly.ts).
 */
export function TabletopConceptPrototype() {
  return (
    <div className="concept-prototype">
      <ConceptMasthead />
      <div className="concept-main">
        <ConceptCompetitorRail />
        <div className="concept-center">
          <ConceptBoard />
          <ConceptRack />
          <ConceptActionBar />
        </div>
        <ConceptSidebar />
      </div>
      <ConceptOverlay />
    </div>
  );
}
