import { TILE_COLOR_TOKENS } from "@tile-meld/shared";

/** Writes the tile-color palette from packages/shared -- the single source
 * of truth for branding (§10.4) -- onto :root as CSS custom properties, so
 * CSS never hardcodes a hex value that could drift from branding.ts. */
export function applyBrandingTokens(): void {
  const root = document.documentElement;
  for (const token of TILE_COLOR_TOKENS) {
    root.style.setProperty(`--tile-color-${token.code}`, token.hex);
  }
}
