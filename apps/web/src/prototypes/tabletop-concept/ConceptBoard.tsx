import { ConceptTile } from "./ConceptTile.js";
import { MOCK_TABLE_MELDS, MOCK_STATUS } from "./mockData.js";

export function ConceptBoard() {
  return (
    <div className="concept-panel concept-board" aria-hidden="true">
      <h2 className="concept-board-title">On the Table</h2>
      <div className="concept-board-melds">
        {MOCK_TABLE_MELDS.map((meld, i) => (
          <div className="concept-meld" key={i}>
            <span className="concept-meld-label">{meld.label}</span>
            <div className="concept-meld-tiles">
              {meld.tiles.map((tile, j) => (
                <ConceptTile tile={tile} key={j} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="concept-board-stats">
        <span>
          Tiles left: <strong>{MOCK_STATUS.tilesLeft}</strong>
        </span>
        <span>
          Possible melds: <strong>{MOCK_STATUS.possibleMelds}</strong>
        </span>
      </div>
    </div>
  );
}
