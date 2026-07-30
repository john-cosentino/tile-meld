import type { MockCompetitor } from "./mockData.js";
import { competitorPortrait } from "./mockData.js";

const ACCENT_VAR: Record<MockCompetitor["accent"], string> = {
  gold: "var(--neon-gold)",
  purple: "var(--neon-purple)",
  pink: "var(--neon-pink)",
  green: "var(--neon-green)",
};

function ConceptCompetitorCard({ c }: { readonly c: MockCompetitor }) {
  return (
    <div
      className={`concept-panel concept-competitor${c.isActive ? " concept-competitor--active" : ""}`}
      style={{ color: ACCENT_VAR[c.accent], borderColor: ACCENT_VAR[c.accent] }}
    >
      <img className="concept-competitor-portrait" src={competitorPortrait(c)} alt="" />
      <div className="concept-competitor-text">
        <span className="concept-competitor-name" style={{ color: "var(--text-primary)" }}>
          {c.name}
          {c.isSelf ? " (You)" : ""}
        </span>
        <span className="concept-competitor-score-label">Score</span>
        <span className="concept-competitor-score-value">{c.score}</span>
      </div>
    </div>
  );
}

/** Vertical rail (desktop: all 4; phone portrait: the 2 the caller passes
 * in). Phone landscape uses the same ConceptCompetitorCard markup but its
 * own horizontal-row CSS (see ConceptPhoneLandscapeLayout.tsx) rather than
 * this wrapper. */
export function ConceptCompetitorRail({
  competitors,
}: {
  readonly competitors: readonly MockCompetitor[];
}) {
  return (
    <div className="concept-rail" aria-hidden="true">
      {competitors.map((c) => (
        <ConceptCompetitorCard c={c} key={c.seatIndex} />
      ))}
    </div>
  );
}

export { ConceptCompetitorCard };
