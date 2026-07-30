// `?no-inline` forces Vite to always emit this as a real, network-fetchable
// file rather than a base64 data: URI (its default for small assets) --
// <use href="...#fragment"> cannot resolve an in-document fragment ID
// against a data: URI, only against an actual URL, so inlining would
// silently render nothing.
import actionIconsUrl from "../assets/tabletop-production/actions/action-icons-illustrated.svg?no-inline";

/** The four action icons live as named <g id="..."> fragments inside one
 * 384x96 sprite strip (docs/meld-masters-chatgpt-art-generation-prompts.md
 * Batch 5), each in its own fixed 96-wide slot (draw=0, pass=96, sort=192,
 * commit=288) via `transform="translate(<slot> 0)"` baked into the group
 * itself. A referencing <use> keeps that translate, so the consuming
 * <svg>'s viewBox must start at the same x offset to bring that icon back
 * into view -- viewBox="0 0 96 96" for every icon would only ever show
 * "draw" (the one at offset 0) and clip the other three off-canvas.
 * Each fragment already uses stroke="currentColor", so it inherits the
 * button's own accent color exactly like the previous inline-SVG icons
 * did. Decorative only -- the button's real accessible name is its live
 * label text, never this icon. */
const SLOT_X: Record<"draw" | "pass" | "sort" | "commit", number> = {
  draw: 0,
  pass: 96,
  sort: 192,
  commit: 288,
};

export function ActionIcon({
  icon,
  className = "action-icon",
}: {
  readonly icon: "draw" | "pass" | "sort" | "commit";
  readonly className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox={`${SLOT_X[icon]} 0 96 96`}
      aria-hidden="true"
      focusable="false"
    >
      <use href={`${actionIconsUrl}#${icon}`} />
    </svg>
  );
}
