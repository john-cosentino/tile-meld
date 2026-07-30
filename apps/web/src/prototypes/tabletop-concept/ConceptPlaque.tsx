import type { ReactNode } from "react";

/** Small framed status readout -- the masthead's league/season and
 * round/target/table plaques on desktop and landscape, and the player-row
 * status center on phone portrait. One primitive, reused everywhere a
 * label/value stack in a `.concept-panel` frame is needed. */
export function ConceptPlaque({ children }: { readonly children: ReactNode }) {
  return <div className="concept-panel concept-masthead-plaque">{children}</div>;
}

export function ConceptPlaqueLabel({ children }: { readonly children: ReactNode }) {
  return <span className="concept-masthead-plaque-label">{children}</span>;
}

export function ConceptPlaqueValue({ children }: { readonly children: ReactNode }) {
  return <span className="concept-masthead-plaque-value">{children}</span>;
}
