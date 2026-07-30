import { PRODUCT_NAME } from "@tile-meld/shared";
import monogramSrc from "../../assets/brand/meld-masters-monogram-header.png";
import { MOCK_STATUS } from "./mockData.js";

/**
 * The concept's full-width arcade masthead -- large live-text wordmark
 * (Silkscreen, gradient, no new artwork) plus left/right mock status
 * plaques. This intentionally replaces the real app's small header for
 * this route only; the prototype is a standalone screen, not nested inside
 * RootLayout.
 */
export function ConceptMasthead() {
  return (
    <header className="concept-masthead">
      <div className="concept-panel concept-masthead-plaque">
        <span className="concept-masthead-plaque-label">{MOCK_STATUS.league}</span>
        <span className="concept-masthead-plaque-value">{MOCK_STATUS.season}</span>
      </div>

      <div className="concept-masthead-brand">
        <img src={monogramSrc} alt="" width={48} height={48} className="concept-monogram" />
        <h1 className="concept-wordmark">{PRODUCT_NAME}</h1>
        <p className="concept-tagline">Strategy. Combine. Conquer.</p>
      </div>

      <div className="concept-panel concept-masthead-plaque">
        <span className="concept-masthead-plaque-label">
          Round {MOCK_STATUS.round} of {MOCK_STATUS.totalRounds}
        </span>
        <span className="concept-masthead-plaque-value">Target {MOCK_STATUS.targetScore}</span>
        <span className="concept-masthead-plaque-label">Table: {MOCK_STATUS.tableName}</span>
      </div>
    </header>
  );
}
