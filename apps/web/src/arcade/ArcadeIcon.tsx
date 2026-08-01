import { arcadeAssets, type ArcadeAssetName } from "../assets/arcade/manifest.js";

interface ArcadeIconProps {
  name: ArcadeAssetName;
  /** Integer display scale over the extracted 1x size. */
  scale?: number;
  className?: string;
}

/**
 * Decorative concept-art icon. Always aria-hidden: an icon accompanies live
 * text, never replaces it (layout-contract rule; keeps e2e role/name
 * selectors stable).
 */
export function ArcadeIcon({ name, scale = 1, className }: ArcadeIconProps) {
  const asset = arcadeAssets[name];
  return (
    <img
      src={asset.url}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className ? `arcade-icon ${className}` : "arcade-icon"}
      width={Math.round(asset.width * scale)}
      height={Math.round(asset.height * scale)}
    />
  );
}
