import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  TILE_COLOR_BY_CODE,
  JOKER_GLYPH,
  JOKER_LABEL,
  type TileColorCode,
} from "@tile-meld/shared";

export type TileFace =
  | {
      readonly kind: "numbered";
      readonly tileId: string;
      readonly color: TileColorCode;
      readonly value: number;
    }
  | { readonly kind: "joker"; readonly tileId: string };

type TileProps = {
  readonly tile: TileFace;
  readonly selected?: boolean;
  readonly invalid?: boolean;
  readonly onActivate?: () => void;
  readonly draggable?: boolean;
};

/** A single tile: color/value plus a non-color symbol, since color alone
 * must never be the only way to distinguish a tile (§10.3). Both a
 * draggable item (drag-and-drop) and a focusable, clickable button
 * (click/tap + keyboard) at once -- the two interaction paths are
 * additive, not exclusive. */
export function Tile({
  tile,
  selected = false,
  invalid = false,
  onActivate,
  draggable = true,
}: TileProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: tile.tileId,
    disabled: !draggable,
  });

  const label =
    tile.kind === "joker" ? JOKER_LABEL : `${TILE_COLOR_BY_CODE[tile.color].label} ${tile.value}`;

  return (
    <button
      ref={setNodeRef}
      type="button"
      className="tile"
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        borderColor: invalid ? "var(--color-danger)" : "var(--color-border)",
        boxShadow: selected ? "0 0 0 3px var(--color-accent)" : undefined,
        color: tile.kind === "numbered" ? TILE_COLOR_BY_CODE[tile.color].hex : "var(--color-text)",
      }}
      {...listeners}
      {...attributes}
      // Placed after the dnd-kit spreads so an explicit click/tap always
      // wins even if `listeners`/`attributes` ever includes its own
      // onClick -- drag-and-drop and click/tap must both work on the same
      // element (§10.2), not have one silently shadow the other.
      onClick={onActivate}
      // Not role="option" -- that role requires an ancestor with
      // role="listbox" (ARIA 1.2), which DropZone (rack/table containers)
      // doesn't provide and structurally can't always provide (some
      // DropZones are also click targets in their own right, role="button"
      // when a tile is selected elsewhere). aria-pressed on a plain button
      // has no such parent requirement and is the same toggle-state
      // pattern Rack.tsx's sort-mode buttons already use.
      aria-pressed={selected}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true" className="tile-symbol">
        {tile.kind === "joker" ? JOKER_GLYPH : TILE_COLOR_BY_CODE[tile.color].symbol}
      </span>
      <span aria-hidden="true" className="tile-value">
        {tile.kind === "joker" ? "" : tile.value}
      </span>
    </button>
  );
}
