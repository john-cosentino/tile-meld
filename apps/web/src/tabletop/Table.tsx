import type { DraftSet } from "./draftState.js";
import type { TileFace } from "./Tile.js";
import { TableSet } from "./TableSet.js";
import { DropZone } from "./DropZone.js";

type TableProps = {
  readonly sets: readonly DraftSet[];
  readonly resolve: (tileId: string) => TileFace;
  readonly selectedTileId: string | null;
  readonly onSelectTile: (tileId: string) => void;
  readonly onActivateZone: (
    destination: { readonly zone: "set"; readonly setId: string } | { readonly zone: "new-set" },
  ) => void;
  readonly onReorder: (setId: string, tileId: string, direction: "left" | "right") => void;
  readonly setValidity: (setId: string) => {
    readonly validity: "valid" | "invalid" | "neutral";
    readonly label: string;
  };
};

export function Table({
  sets,
  resolve,
  selectedTileId,
  onSelectTile,
  onActivateZone,
  onReorder,
  setValidity,
}: TableProps) {
  return (
    <div className="stack">
      <h2 style={{ margin: 0 }}>Table</h2>
      {sets.length === 0 && <p className="muted">No sets on the table yet.</p>}
      {sets.map((set, index) => {
        const { validity, label } = setValidity(set.id);
        return (
          <TableSet
            key={set.id}
            setId={set.id}
            index={index}
            tileIds={set.tileIds}
            resolve={resolve}
            selectedTileId={selectedTileId}
            onSelectTile={onSelectTile}
            onActivateZone={() => onActivateZone({ zone: "set", setId: set.id })}
            onReorder={(tileId, direction) => onReorder(set.id, tileId, direction)}
            validity={validity}
            validityLabel={label}
          />
        );
      })}
      <DropZone
        id="new-set"
        label="Start a new set"
        selectable={selectedTileId !== null}
        onActivate={() => onActivateZone({ zone: "new-set" })}
      >
        <span className="muted">Drop or select here to start a new set</span>
      </DropZone>
    </div>
  );
}
