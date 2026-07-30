import { MOCK_COMPETITORS, competitorPortrait, type MockCompetitor } from "./mockData.js";

const ACCENT_VAR: Record<MockCompetitor["accent"], string> = {
  gold: "var(--neon-gold)",
  purple: "var(--neon-purple)",
  pink: "var(--neon-pink)",
  green: "var(--neon-green)",
};

export function ConceptCompetitorRail() {
  return (
    <div className="concept-rail" aria-hidden="true">
      {MOCK_COMPETITORS.map((c) => (
        <div
          key={c.seatIndex}
          className={`concept-panel concept-competitor${c.isActive ? " concept-competitor--active" : ""}`}
          style={{ color: ACCENT_VAR[c.accent], borderColor: ACCENT_VAR[c.accent] }}
        >
          <img className="concept-competitor-portrait" src={competitorPortrait(c)} alt="" />
          <span className="concept-competitor-name" style={{ color: "var(--text-primary)" }}>
            {c.name}
            {c.isSelf ? " (You)" : ""}
          </span>
          <span className="concept-competitor-score-label">Score</span>
          <span className="concept-competitor-score-value">{c.score}</span>
        </div>
      ))}
    </div>
  );
}
