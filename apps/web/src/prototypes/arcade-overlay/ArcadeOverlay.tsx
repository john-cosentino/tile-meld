import { useEffect, useState } from "react";

// Dev-only concept-art overlay for overlay-first building: renders the
// binding concept image over the LIVE app at adjustable opacity so panels
// can be positioned against the target before any styling detail work.
//
// Activate with ?concept-overlay=<name> on any route, e.g.
//   http://localhost:5173/?concept-overlay=home
// Keys: [ and ] adjust opacity, o toggles visibility.
//
// Mounted from App.tsx behind a literal import.meta.env.DEV gate; the /@fs
// URLs below only resolve under the Vite dev server, which is fine -- this
// component never ships.

const CONCEPTS: Record<string, string> = {
  home: "/@fs/home/johnc/git/tile-meld/docs/design-reference/v2/new_layout1.png",
  "tabletop-desktop":
    "/@fs/home/johnc/git/tile-meld/docs/design-reference/meld-masters/meld-masters-concept-01.png",
  "tabletop-portrait":
    "/@fs/home/johnc/git/tile-meld/docs/design-reference/meld-masters/meld-masters-concept-03.png",
};

export function ArcadeOverlay() {
  const [opacity, setOpacity] = useState(0.5);
  const [visible, setVisible] = useState(true);
  const name = new URLSearchParams(window.location.search).get("concept-overlay");
  const src = name ? CONCEPTS[name] : undefined;

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "[") setOpacity((o) => Math.max(0, +(o - 0.1).toFixed(2)));
      if (e.key === "]") setOpacity((o) => Math.min(1, +(o + 0.1).toFixed(2)));
      if (e.key === "o") setVisible((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src]);

  if (!src || !visible) return null;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        objectFit: "fill",
        opacity,
        pointerEvents: "none",
        zIndex: 9999,
        imageRendering: "pixelated",
      }}
    />
  );
}
