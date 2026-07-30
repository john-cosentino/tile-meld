import { useState } from "react";

type ConceptFile = "meld-masters-concept-01.png" | "meld-masters-concept-04.png";

/**
 * Dev-only alignment tool -- overlays the actual concept art on top of the
 * live prototype at adjustable opacity so the two can be compared pixel-
 * by-pixel while building, not just after the fact. Rendered only inside
 * TabletopConceptPrototype, which is itself gated by PROTOTYPE_ROUTE_ENABLED
 * (see devOnly.ts), so this never ships. The image itself is served by a
 * dev-only Vite middleware plugin (vite.config.ts) directly from
 * docs/design-reference/meld-masters/ -- never copied into apps/web's
 * bundled assets, so there's nothing here for a production build to pick
 * up even if the gating were somehow bypassed.
 */
export function ConceptOverlay() {
  const [visible, setVisible] = useState(false);
  const [opacity, setOpacity] = useState(50);
  const [concept, setConcept] = useState<ConceptFile>("meld-masters-concept-01.png");

  return (
    <>
      {visible && (
        <img
          className="concept-overlay-image"
          src={`/__dev-concept-art/${concept}`}
          alt=""
          style={{ opacity: opacity / 100 }}
        />
      )}
      <div className="concept-overlay-panel">
        <strong>Concept overlay (dev only)</strong>
        <label>
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          Show overlay
        </label>
        <label>
          Opacity
          <input
            type="range"
            min={0}
            max={100}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
          />
          {opacity}%
        </label>
        <label>
          <input
            type="radio"
            name="concept-overlay-target"
            checked={concept === "meld-masters-concept-01.png"}
            onChange={() => setConcept("meld-masters-concept-01.png")}
          />
          Concept 01 (desktop)
        </label>
        <label>
          <input
            type="radio"
            name="concept-overlay-target"
            checked={concept === "meld-masters-concept-04.png"}
            onChange={() => setConcept("meld-masters-concept-04.png")}
          />
          Concept 04 (phone)
        </label>
      </div>
    </>
  );
}
