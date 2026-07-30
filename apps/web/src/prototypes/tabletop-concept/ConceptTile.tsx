import { tileColor, type MockTile } from "./mockData.js";

export function ConceptTile({
  tile,
  compact = false,
}: {
  readonly tile: MockTile;
  readonly compact?: boolean;
}) {
  const className = `concept-tile${compact ? " concept-tile--rack" : ""}${
    tile.kind === "joker" ? " concept-tile--joker" : ""
  }`;
  if (tile.kind === "joker") {
    return (
      <span className={className} aria-hidden="true">
        <span className="concept-tile-value">★</span>
      </span>
    );
  }
  const { hex, symbol } = tileColor(tile.color);
  return (
    <span className={className} style={{ color: hex }} aria-hidden="true">
      <span className="concept-tile-value">{tile.value}</span>
      <span className="concept-tile-symbol">{symbol}</span>
    </span>
  );
}
