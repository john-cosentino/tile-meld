#!/usr/bin/env python3
"""Composite concept-vs-app comparison sheets for the arcade review loop.

For each screen with a region map (docs/design-reference/region-maps/) and a
raw capture (docs/design-reference/arcade-review/<screen>/app--<viewport>.png,
produced by e2e/scripts/arcade/capture-arcade-screens.ts), writes into the
same directory:

  triptych--<viewport>.png    concept | app | 50% blend, side by side
  silhouette--<viewport>.png  blurred massing comparison (composition only)

These sheets are the checkpoint evidence: the user judges them; the agent
never declares visual success from them.

Usage:
  python3 scripts/build-arcade-comparisons.py [screen ...]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

REPO_ROOT = Path(__file__).resolve().parent.parent
MAPS_DIR = REPO_ROOT / "docs" / "design-reference" / "region-maps"
REVIEW_ROOT = REPO_ROOT / "docs" / "design-reference" / "arcade-review"

PANEL_W = 900
GAP = 16
LABEL_H = 28
BG = (8, 12, 20)
LABEL = (255, 220, 80)

VIEWPORT_NAMES = {
    (1440, 900): "desktop-1440x900",
    (390, 844): "phone-portrait-390x844",
    (844, 390): "phone-landscape-844x390",
}


def fit(im: Image.Image, width: int) -> Image.Image:
    height = round(im.height * width / im.width)
    return im.resize((width, height), Image.LANCZOS)


def silhouette(im: Image.Image) -> Image.Image:
    """Blur + posterize so only the massing/composition reads."""
    g = im.convert("L").filter(ImageFilter.GaussianBlur(radius=6))
    return g.point(lambda v: (v // 32) * 32).convert("RGB")


def build_for(map_path: Path) -> None:
    spec = json.loads(map_path.read_text())
    screen = spec["screen"]
    viewport_name = VIEWPORT_NAMES.get((spec["viewport"]["width"], spec["viewport"]["height"]))
    if viewport_name is None:
        raise ValueError(f"{map_path.name}: viewport not in the contract trio")
    shot_path = REVIEW_ROOT / screen / f"app--{viewport_name}.png"
    if not shot_path.exists():
        print(f"skip {screen}/{viewport_name}: no capture at {shot_path.relative_to(REPO_ROOT)}")
        return
    concept = Image.open(REPO_ROOT / spec["source"]).convert("RGB")
    shot = Image.open(shot_path).convert("RGB")

    panels = [
        (f"CONCEPT ({Path(spec['source']).name})", fit(concept, PANEL_W)),
        (f"APP (app--{viewport_name}.png)", fit(shot, PANEL_W)),
    ]
    blend_h = max(panels[0][1].height, panels[1][1].height)
    blend = Image.blend(
        panels[0][1].resize((PANEL_W, blend_h)),
        panels[1][1].resize((PANEL_W, blend_h)),
        0.5,
    )
    panels.append(("50% BLEND", blend))

    h = LABEL_H + max(p.height for _, p in panels) + GAP
    sheet = Image.new("RGB", (PANEL_W * 3 + GAP * 4, h), BG)
    draw = ImageDraw.Draw(sheet)
    x = GAP
    for label, panel in panels:
        draw.text((x, 6), label, fill=LABEL)
        sheet.paste(panel, (x, LABEL_H))
        x += PANEL_W + GAP
    out = REVIEW_ROOT / screen / f"triptych--{viewport_name}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f"wrote {out.relative_to(REPO_ROOT)}")

    sil_panels = [silhouette(fit(concept, PANEL_W)), silhouette(fit(shot, PANEL_W))]
    sh = LABEL_H + max(p.height for p in sil_panels) + GAP
    sil = Image.new("RGB", (PANEL_W * 2 + GAP * 3, sh), BG)
    d = ImageDraw.Draw(sil)
    d.text((GAP, 6), "CONCEPT SILHOUETTE", fill=LABEL)
    d.text((PANEL_W + GAP * 2, 6), "APP SILHOUETTE", fill=LABEL)
    sil.paste(sil_panels[0], (GAP, LABEL_H))
    sil.paste(sil_panels[1], (PANEL_W + GAP * 2, LABEL_H))
    out = REVIEW_ROOT / screen / f"silhouette--{viewport_name}.png"
    sil.save(out)
    print(f"wrote {out.relative_to(REPO_ROOT)}")


def main() -> int:
    requested = set(sys.argv[1:])
    for map_path in sorted(MAPS_DIR.glob("*.json")):
        spec = json.loads(map_path.read_text())
        if requested and spec["screen"] not in requested:
            continue
        build_for(map_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
