// `?no-inline` -- see the same-purpose comment in ActionIcon.tsx.
import chromeIconsUrl from "../assets/tabletop-production/chrome/footer-chrome-icons.svg?no-inline";

/** Purely decorative footer flourish (lightning/stats fragments from the
 * approved sprite) -- never the sole carrier of any information, so the
 * whole footer strip that uses this is aria-hidden rather than given an
 * accessible name of its own. Two fragments in one 128x64 strip, each in
 * its own 64-wide slot (lightning=0, stats=64) via a `translate` baked
 * into the group -- see the matching comment in ActionIcon.tsx for why
 * the consuming viewBox must start at that same offset. */
const SLOT_X: Record<"lightning" | "stats", number> = {
  lightning: 0,
  stats: 64,
};

export function ChromeIcon({
  icon,
  className = "tabletop-footer-icon",
}: {
  readonly icon: "lightning" | "stats";
  readonly className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox={`${SLOT_X[icon]} 0 64 64`}
      aria-hidden="true"
      focusable="false"
    >
      <use href={`${chromeIconsUrl}#${icon}`} />
    </svg>
  );
}
