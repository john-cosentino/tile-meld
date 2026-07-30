import { useEffect, useState } from "react";

export type LayoutTarget = "desktop" | "phone-portrait" | "phone-landscape";

/** width < 1000 is the phone/desktop split (844-wide landscape phone stays
 * under it, 1280/1440-wide desktop targets stay over it); orientation
 * (width vs height) then picks phone portrait vs landscape. Recomputed on
 * resize so a real dev window dragged between sizes swaps layouts live --
 * useful with the overlay tool while tuning. */
function computeTarget(): LayoutTarget {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w >= 1000) return "desktop";
  return w > h ? "phone-landscape" : "phone-portrait";
}

export function useLayoutTarget(): LayoutTarget {
  const [target, setTarget] = useState<LayoutTarget>(() =>
    typeof window === "undefined" ? "desktop" : computeTarget(),
  );

  useEffect(() => {
    const onResize = () => setTarget(computeTarget());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return target;
}
