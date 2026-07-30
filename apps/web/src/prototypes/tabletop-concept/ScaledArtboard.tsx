import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fixed-size internal design canvas, uniformly scaled (never stretched) to
 * fit whatever viewport it's actually rendered in, and centered -- so the
 * complete composition authored at `width`x`height` always stays fully
 * visible with no scrolling, letterboxing evenly on whichever axis has
 * slack rather than cropping either axis. This is what lets
 * ConceptDesktopLayout/ConceptPhonePortraitLayout/
 * ConceptPhoneLandscapeLayout be authored at exact pixel measurements
 * (matching the concept art's own proportions) instead of fighting
 * responsive reflow to hit several very different target aspect ratios.
 */
export function ScaledArtboard({
  width,
  height,
  children,
}: {
  readonly width: number;
  readonly height: number;
  readonly children: ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const recompute = () => {
      const availableWidth = outer.clientWidth;
      const availableHeight = outer.clientHeight;
      setScale(Math.min(availableWidth / width, availableHeight / height));
    };
    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(outer);
    return () => observer.disconnect();
  }, [width, height]);

  return (
    <div ref={outerRef} className="concept-artboard-viewport">
      <div
        className="concept-artboard-canvas"
        style={{
          width,
          height,
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
