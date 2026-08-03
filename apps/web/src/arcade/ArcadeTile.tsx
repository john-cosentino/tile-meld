import type { CSSProperties, ReactNode } from "react";
import { coverStyle } from "./frameStyle.js";
import { arcadeAssets, type ArcadeAssetName } from "../assets/arcade/manifest.js";

const PIP_BY_COLOR: Record<string, ArcadeAssetName> = {
  C1: "pip-diamond",
  C2: "pip-circle",
  C3: "pip-triangle",
  C4: "pip-square",
};

interface ArcadeTileFaceProps {
  /** Tile label, e.g. 1..13 or a joker mark. Rendered as live text. */
  value: ReactNode;
  /** Engine color id C1..C4; picks the concept pip sprite and numeral color. */
  colorId?: string;
  /** CSS color for the numeral; defaults to the branding token for colorId. */
  color?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * The visual face of a tile: the concept's cream tile art (numeral removed
 * at extraction) with a live numeral and pip sprite. Purely presentational
 * -- selection, drag, and keyboard behavior stay in tabletop/Tile.tsx.
 */
export function ArcadeTileFace({ value, colorId, color, className, style }: ArcadeTileFaceProps) {
  const pip = colorId ? PIP_BY_COLOR[colorId] : undefined;
  const numeralColor =
    color ?? (colorId ? `var(--tile-color-${colorId})` : "var(--text-on-accent)");
  return (
    <span
      className={className ? `arcade-kit-tile ${className}` : "arcade-kit-tile"}
      style={{ ...coverStyle("tile-face"), ...style }}
      aria-hidden="true"
    >
      <span className="arcade-kit-tile-value" style={{ color: numeralColor }}>
        {value}
      </span>
      {pip && (
        <img
          src={arcadeAssets[pip].url}
          alt=""
          draggable={false}
          className="arcade-kit-tile-pip"
          width={arcadeAssets[pip].width}
          height={arcadeAssets[pip].height}
        />
      )}
    </span>
  );
}
