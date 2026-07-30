import { tileColor, type MockTile } from "./mockData.js";

export function ConceptTile({
  tile,
  variant,
}: {
  readonly tile: MockTile;
  readonly variant: "board" | "rack";
}) {
  const className = `concept-tile concept-tile--${variant}${
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
