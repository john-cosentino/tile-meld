import "./tabletop-concept.css";
import { ScaledArtboard } from "./ScaledArtboard.js";
import { useLayoutTarget } from "./useLayoutTarget.js";
import { ConceptDesktopLayout } from "./ConceptDesktopLayout.js";
import { ConceptPhonePortraitLayout } from "./ConceptPhonePortraitLayout.js";
import { ConceptPhoneLandscapeLayout } from "./ConceptPhoneLandscapeLayout.js";
import { ConceptOverlay } from "./ConceptOverlay.js";

const CANVASES = {
  desktop: { width: 1440, height: 900 },
  "phone-portrait": { width: 390, height: 844 },
  "phone-landscape": { width: 844, height: 390 },
} as const;

/**
 * Static, disconnected visual prototype of the Meld Masters tabletop
 * concept art. No live hooks (useGame/useDraftState/socket/room/recovery),
 * no API requests, no identity, no gameplay logic -- see
 * docs/meld-masters-tabletop-static-prototype-v2-summary.md. Rendered
 * outside RootLayout/AuthProvider/AnnouncerProvider entirely (App.tsx) and
 * only reachable when PROTOTYPE_ROUTE_ENABLED is true (devOnly.ts).
 *
 * v2: three fixed-pixel design canvases (desktop/phone-portrait/phone-
 * landscape), auto-selected from the real viewport size and scaled to fit
 * via ScaledArtboard -- see useLayoutTarget.ts and ScaledArtboard.tsx.
 */
export function TabletopConceptPrototype() {
  const target = useLayoutTarget();
  const canvas = CANVASES[target];
  return (
    <div className="concept-prototype">
      <ScaledArtboard width={canvas.width} height={canvas.height}>
        {target === "desktop" && <ConceptDesktopLayout />}
        {target === "phone-portrait" && <ConceptPhonePortraitLayout />}
        {target === "phone-landscape" && <ConceptPhoneLandscapeLayout />}
      </ScaledArtboard>
      <ConceptOverlay />
    </div>
  );
}
