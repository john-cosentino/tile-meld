import { useState } from "react";
import { Tile, type TileFace } from "./Tile.js";
import { DropZone } from "./DropZone.js";

type RackProps = {
  readonly tileIds: readonly string[];
  readonly resolve: (tileId: string) => TileFace;
  readonly selectedTileId: string | null;
  readonly onSelectTile: (tileId: string) => void;
  readonly onActivateZone: () => void;
  readonly onReorder: (newOrder: readonly string[]) => void;
};

/** The player's own rack -- always a drop zone (destination for "put this
 * tile back") plus manual/sort-by-number/sort-by-color controls (§10.2). */
export function Rack({
  tileIds,
  resolve,
  selectedTileId,
  onSelectTile,
  onActivateZone,
  onReorder,
}: RackProps) {
  const [sortMode, setSortMode] = useState<"manual" | "number" | "color">("manual");

  function applySort(mode: "number" | "color"): void {
    setSortMode(mode);
    const sorted = [...tileIds].sort((a, b) => {
      const ta = resolve(a);
      const tb = resolve(b);
      if (mode === "number") {
        const va = ta.kind === "numbered" ? ta.value : 99;
        const vb = tb.kind === "numbered" ? tb.value : 99;
        return va - vb;
      }
      const ca = ta.kind === "numbered" ? ta.color : "Z";
      const cb = tb.kind === "numbered" ? tb.color : "Z";
      return ca === cb
        ? (ta.kind === "numbered" ? ta.value : 0) - (tb.kind === "numbered" ? tb.value : 0)
        : ca.localeCompare(cb);
    });
    onReorder(sorted);
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Your rack ({tileIds.length})</h2>
        <div className="row" role="group" aria-label="Sort rack">
          <button aria-pressed={sortMode === "manual"} onClick={() => setSortMode("manual")}>
            Manual
          </button>
          <button aria-pressed={sortMode === "number"} onClick={() => applySort("number")}>
            Sort by number
          </button>
          <button aria-pressed={sortMode === "color"} onClick={() => applySort("color")}>
            Sort by color
          </button>
        </div>
      </div>
      <DropZone
        id="rack"
        label="Your rack"
        selectable={selectedTileId !== null}
        onActivate={onActivateZone}
      >
        {tileIds.length === 0 && <span className="muted">Empty</span>}
        {tileIds.map((tileId) => (
          <Tile
            key={tileId}
            tile={resolve(tileId)}
            selected={selectedTileId === tileId}
            onActivate={() => onSelectTile(tileId)}
          />
        ))}
      </DropZone>
    </div>
  );
}
