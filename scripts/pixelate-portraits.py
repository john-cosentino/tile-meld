#!/usr/bin/env python3
"""Convert the approved smooth portrait pack to pixel-art style.

Deterministic, no AI: LANCZOS downscale to a coarse pixel grid, median-cut
palette quantization (no dither), then NEAREST integer upscale back to the
128x192 size the app already ships. Sources in docs/design-reference/
meld-masters/ are never modified; outputs overwrite apps/web/src/assets/
portraits/ under the same filenames so the seat mapping and tests are
untouched.

Usage:
  python3 scripts/pixelate-portraits.py                # overwrite app portraits
  python3 scripts/pixelate-portraits.py --sheet out.png  # also write a
                                                        # before/after sheet
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = REPO_ROOT / "docs" / "design-reference" / "meld-masters"
OUT_DIR = REPO_ROOT / "apps" / "web" / "src" / "assets" / "portraits"

NAMES = [f"portrait-rival-{i:02d}.png" for i in range(1, 9)] + ["portrait-fallback.png"]

# Coarse grid: 64x96 gives 2px blocks at the shipped 128x192, matching the
# concept portraits' visible pixel pitch.
GRID = (64, 96)
OUT_SIZE = (128, 192)
COLORS = 40


def pixelate(src: Image.Image) -> Image.Image:
    rgba = src.convert("RGBA")
    small = rgba.resize(GRID, Image.LANCZOS)
    alpha = small.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    rgb = small.convert("RGB").quantize(colors=COLORS, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out.resize(OUT_SIZE, Image.NEAREST)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sheet", type=Path, help="also write a before/after contact sheet")
    args = parser.parse_args()

    results: list[tuple[str, Image.Image, Image.Image]] = []
    for name in NAMES:
        src_path = SRC_DIR / name
        if not src_path.exists():
            raise FileNotFoundError(src_path)
        src = Image.open(src_path)
        out = pixelate(src)
        out.save(OUT_DIR / name)
        results.append((name, src, out))
        print(f"{name}: {src.size[0]}x{src.size[1]} -> {out.size[0]}x{out.size[1]}")

    if args.sheet:
        cell_w, cell_h, pad, label_h = 128, 192, 12, 22
        cols = len(results)
        sheet = Image.new("RGB", (cols * (cell_w + pad) + pad, 2 * (cell_h + pad) + pad + label_h), (8, 12, 20))
        draw = ImageDraw.Draw(sheet)
        for i, (name, src, out) in enumerate(results):
            x = pad + i * (cell_w + pad)
            before = src.convert("RGBA").resize((cell_w, cell_h), Image.LANCZOS)
            sheet.paste(before, (x, pad), before)
            sheet.paste(out, (x, pad * 2 + cell_h), out)
            draw.text((x, 2 * (cell_h + pad)), name.replace("portrait-", "").replace(".png", ""), fill=(255, 220, 80))
        args.sheet.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(args.sheet)
        print(f"wrote {args.sheet}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
