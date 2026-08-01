import { PRODUCT_NAME } from "@tile-meld/shared";
import { arcadeAssets } from "../assets/arcade/manifest.js";

/**
 * The tabletop masthead: the concept art's own pixels at exactly the
 * masthead region rect (docs/design-reference/region-maps/
 * tabletop-desktop.json), so the region matches the spec by construction.
 * Decorative -- the page's H1 is the turn heading in TabletopStatus.
 */
export function TabletopMasthead() {
  return (
    <div className="tabletop-masthead">
      <img
        src={arcadeAssets["wordmark-tabletop"].url}
        alt=""
        aria-hidden="true"
        className="tabletop-masthead-wordmark"
        width={arcadeAssets["wordmark-tabletop"].width}
        height={arcadeAssets["wordmark-tabletop"].height}
        draggable={false}
      />
      <span className="visually-hidden">{PRODUCT_NAME}</span>
    </div>
  );
}
