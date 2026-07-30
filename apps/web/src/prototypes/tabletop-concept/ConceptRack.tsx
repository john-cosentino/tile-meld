import { ConceptTile } from "./ConceptTile.js";
import { MOCK_RACK } from "./mockData.js";

export function ConceptRack() {
  return (
    <div className="concept-panel concept-panel--accent-gold concept-rack" aria-hidden="true">
      <h2 className="concept-rack-title">Your Rack</h2>
      <div className="concept-rack-tiles">
        {MOCK_RACK.map((tile, i) => (
          <ConceptTile tile={tile} compact key={i} />
        ))}
      </div>
    </div>
  );
}
