import { PRODUCT_NAME } from "@tile-meld/shared";
import monogramSrc from "../../assets/brand/meld-masters-monogram-header.png";

/**
 * The monogram + large gradient wordmark + tagline only -- no plaques, no
 * wrapping <header>. Each layout (desktop/phone-portrait/phone-landscape)
 * composes this alongside its own plaque placement, since where the
 * round/target/season info goes differs materially by target (a masthead
 * plaque on desktop and landscape, folded into the player/status row on
 * portrait -- see ConceptPhonePortraitLayout.tsx).
 */
export function ConceptBrandMark() {
  return (
    <div className="concept-masthead-brand">
      <img src={monogramSrc} alt="" width={48} height={48} className="concept-monogram" />
      <h1 className="concept-wordmark">{PRODUCT_NAME}</h1>
      <p className="concept-tagline">Strategy. Combine. Conquer.</p>
    </div>
  );
}
