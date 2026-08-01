import type { CSSProperties } from "react";
import { arcadeAssets, type ArcadeAssetName } from "../assets/arcade/manifest.js";

/**
 * CSS border-image properties for a 9-sliced concept-art frame.
 *
 * The slice insets come from the generated asset manifest (single source of
 * truth: scripts/arcade-kit.manifest.json), so components never hardcode
 * pixel values that must match the extracted art. `scale` multiplies the
 * on-screen border width; keep it an integer so the pixel art stays crisp.
 */
export function frameStyle(name: ArcadeAssetName, scale = 1): CSSProperties {
  const asset = arcadeAssets[name];
  const slice = "slice" in asset ? asset.slice : undefined;
  if (!slice) {
    throw new Error(`arcade asset "${name}" has no 9-slice metadata`);
  }
  const { top, right, bottom, left } = slice;
  return {
    borderStyle: "solid",
    borderWidth: `${top * scale}px ${right * scale}px ${bottom * scale}px ${left * scale}px`,
    borderImageSource: `url(${asset.url})`,
    borderImageSlice: `${top} ${right} ${bottom} ${left} fill`,
    borderImageRepeat: "stretch",
  };
}

/** Whole-asset CSS background (non-sliced art stretched edge to edge). */
export function coverStyle(name: ArcadeAssetName): CSSProperties {
  const asset = arcadeAssets[name];
  return {
    backgroundImage: `url(${asset.url})`,
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
  };
}
