import { PRODUCT_NAME } from "@tile-meld/shared";
import wordmarkSrc from "../assets/tabletop-production/masthead/wordmark-meld-masters.png";

/**
 * The tabletop's own arcade masthead -- the approved illustrated wordmark,
 * scoped to this page only. The site-wide header/nav in RootLayout.tsx is
 * untouched and still renders above this on every route, including this
 * one; this is an additional, tabletop-specific region, not a replacement
 * for the global header.
 */
export function TabletopMasthead() {
  return (
    <div className="tabletop-masthead">
      <img
        src={wordmarkSrc}
        alt=""
        aria-hidden="true"
        className="tabletop-masthead-wordmark"
        width={2400}
        height={900}
      />
      <span className="visually-hidden">{PRODUCT_NAME}</span>
    </div>
  );
}
