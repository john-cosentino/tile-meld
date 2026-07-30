import { MOCK_MOVE_LOG, MOCK_HOW_TO_PLAY, MOCK_STATUS } from "./mockData.js";

export function ConceptSidebar() {
  return (
    <div className="concept-sidebar" aria-hidden="true">
      <div className="concept-panel concept-sidebar-panel">
        <span className="concept-turn-badge">Your Turn</span>
        <span className="concept-sidebar-title" style={{ textAlign: "center" }}>
          Time remaining
        </span>
        <span className="concept-turn-countdown">{MOCK_STATUS.turnCountdown}</span>
      </div>

      <div className="concept-panel concept-sidebar-panel">
        <h2 className="concept-sidebar-title">Move Log</h2>
        {MOCK_MOVE_LOG.map((entry, i) => (
          <div className="concept-movelog-row" key={i}>
            <span className="concept-movelog-who">{entry.who}</span>
            <span className="concept-movelog-what">{entry.what}</span>
          </div>
        ))}
      </div>

      <div className="concept-panel concept-sidebar-panel">
        <h2 className="concept-sidebar-title">How to Play</h2>
        <ul className="concept-howtoplay-list">
          {MOCK_HOW_TO_PLAY.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        <p className="concept-tip">"{MOCK_STATUS.tip}"</p>
      </div>
    </div>
  );
}
