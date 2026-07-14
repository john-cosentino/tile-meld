import { Tile, type TileFace } from "./Tile.js";
import { DropZone } from "./DropZone.js";

type TableSetProps = {
  readonly setId: string;
  readonly index: number;
  readonly tileIds: readonly string[];
  readonly resolve: (tileId: string) => TileFace;
  readonly selectedTileId: string | null;
  readonly onSelectTile: (tileId: string) => void;
  readonly onActivateZone: () => void;
  readonly onReorder: (tileId: string, direction: "left" | "right") => void;
  readonly validity: "valid" | "invalid" | "neutral";
  readonly validityLabel: string;
};

export function TableSet({
  setId,
  index,
  tileIds,
  resolve,
  selectedTileId,
  onSelectTile,
  onActivateZone,
  onReorder,
  validity,
  validityLabel,
}: TableSetProps) {
  return (
    <div className="stack" style={{ gap: "var(--space-1)" }}>
      <span className="muted" style={{ fontSize: "0.85rem" }}>
        Set {index + 1} -- {validityLabel}
      </span>
      <DropZone
        id={`set:${setId}`}
        label={`Set ${index + 1}, ${validityLabel}`}
        validity={validity}
        selectable={selectedTileId !== null}
        onActivate={onActivateZone}
      >
        {tileIds.map((tileId, position) => (
          <span key={tileId} className="row" style={{ gap: 2 }}>
            <Tile
              tile={resolve(tileId)}
              selected={selectedTileId === tileId}
              invalid={validity === "invalid"}
              onActivate={() => onSelectTile(tileId)}
            />
            {selectedTileId === tileId && (
              <span className="reorder-controls" aria-label="Reorder within set">
                <button
                  type="button"
                  disabled={position === 0}
                  aria-label="Move left"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReorder(tileId, "left");
                  }}
                >
                  ◀
                </button>
                <button
                  type="button"
                  disabled={position === tileIds.length - 1}
                  aria-label="Move right"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReorder(tileId, "right");
                  }}
                >
                  ▶
                </button>
              </span>
            )}
          </span>
        ))}
      </DropZone>
    </div>
  );
}
