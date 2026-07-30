import { MOCK_MOVE_LOG, MOCK_HOW_TO_PLAY, MOCK_STATUS } from "./mockData.js";

/** One continuous framed rail (desktop/landscape) divided into sections by
 * hairlines, rather than 3 separately-gapped panels -- denser, reads as
 * one cabinet rail. */
export function ConceptSidebar() {
  return (
    <div className="concept-panel concept-sidebar" aria-hidden="true">
      <div className="concept-sidebar-section concept-sidebar-section--turn">
        <span className="concept-turn-badge">Your Turn</span>
        <span className="concept-turn-countdown">{MOCK_STATUS.turnCountdown}</span>
        <div className="concept-countdown-bar" />
      </div>

      <div className="concept-sidebar-section concept-sidebar-section--movelog">
        <h2 className="concept-sidebar-title">Move Log</h2>
        {MOCK_MOVE_LOG.map((entry, i) => (
          <div className="concept-movelog-row" key={i}>
            <span className="concept-movelog-who">{entry.who}</span>
            <span className="concept-movelog-what">{entry.what}</span>
          </div>
        ))}
      </div>

      <div className="concept-sidebar-section concept-sidebar-section--howto">
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
