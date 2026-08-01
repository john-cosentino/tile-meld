#!/usr/bin/env python3
"""Extract the arcade pixel kit from the concept art.

Reads scripts/arcade-kit.manifest.json, crops each declared rect out of its
source concept image, applies the declared center treatment, and writes the
results under apps/web/src/assets/arcade/. Also generates the TypeScript
manifest (apps/web/src/assets/arcade/manifest.ts) that components consume for
border-image slice values, and a labelled contact sheet for visual review.

The concept images are the single source of truth: never hand-edit the
extracted PNGs -- adjust the manifest and re-run this script.

Usage:
  python3 scripts/extract-arcade-kit.py                 # extract + manifest.ts + preview
  python3 scripts/extract-arcade-kit.py --preview-only  # contact sheet only, no asset writes
  python3 scripts/extract-arcade-kit.py --preview-out /tmp/sheet.png

Center treatments (see the manifest's $comment):
  keep         -- crop exactly as-is (icons, sprites, wordmark)
  flatten      -- fill the area inside the 9-slice insets with the median
                  color of flattenSample, removing baked text/content so live
                  HTML text can sit on an authentic frame
  transparent  -- punch the area inside transparentInset (or the slice
                  insets) to alpha 0, for frames layered over live content
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = REPO_ROOT / "scripts" / "arcade-kit.manifest.json"
OUT_ROOT = REPO_ROOT / "apps" / "web" / "src" / "assets" / "arcade"
TS_MANIFEST_PATH = OUT_ROOT / "manifest.ts"
PREVIEW_PATH = REPO_ROOT / "docs" / "design-reference" / "arcade-kit-preview.png"

PREVIEW_COLS = 6
PREVIEW_CELL_PAD = 14
PREVIEW_LABEL_H = 26
PREVIEW_MAX_THUMB = 240
PREVIEW_BG = (8, 12, 20)
PREVIEW_CHECKER = ((70, 70, 70), (110, 110, 110))


def median_color(im: Image.Image, rect: tuple[int, int, int, int]) -> tuple[int, ...]:
    x, y, w, h = rect
    region = im.crop((x, y, x + w, y + h))
    pixels = list(region.getdata())
    channels = len(pixels[0]) if pixels else 3
    med = []
    for c in range(channels):
        vals = sorted(p[c] for p in pixels)
        med.append(vals[len(vals) // 2])
    return tuple(med)


def apply_erase(
    asset_name: str, entry: dict, crop: Image.Image, src_im: Image.Image
) -> None:
    """Fill crop-relative rects with a sampled color, before center treatment.

    Removes baked text that sits inside a kept slice band (e.g. a title on a
    decorative header hump) where the flatten interior cannot reach it.
    """
    for i, erase in enumerate(entry.get("erase", [])):
        ex, ey, ew, eh = erase["rect"]
        if ex < 0 or ey < 0 or ex + ew > crop.width or ey + eh > crop.height:
            raise ValueError(f"{asset_name}: erase[{i}] rect exceeds crop")
        fill = median_color(src_im, tuple(erase["sample"]))
        if crop.mode == "RGBA" and len(fill) == 3:
            fill = fill + (255,)
        ImageDraw.Draw(crop).rectangle([ex, ey, ex + ew - 1, ey + eh - 1], fill=fill)


def apply_center(
    asset_name: str, entry: dict, crop: Image.Image, src_im: Image.Image
) -> Image.Image:
    mode = entry.get("center", "keep")
    if mode == "keep":
        return crop
    insets = entry.get("transparentInset") or entry.get("slice")
    if insets is None:
        raise ValueError(f"{asset_name}: center={mode} requires slice or transparentInset")
    left, top = insets["left"], insets["top"]
    right, bottom = insets["right"], insets["bottom"]
    inner_w = crop.width - left - right
    inner_h = crop.height - top - bottom
    if inner_w <= 0 or inner_h <= 0:
        raise ValueError(f"{asset_name}: insets consume the whole crop")
    if mode == "flatten":
        sample = entry.get("flattenSample")
        if sample is None:
            raise ValueError(f"{asset_name}: flatten requires flattenSample")
        fill = median_color(src_im, tuple(sample))
        if crop.mode == "RGBA" and len(fill) == 3:
            fill = fill + (255,)
        draw = ImageDraw.Draw(crop)
        draw.rectangle([left, top, left + inner_w - 1, top + inner_h - 1], fill=fill)
        return crop
    if mode == "transparent":
        crop = crop.convert("RGBA")
        transparent = Image.new("RGBA", (inner_w, inner_h), (0, 0, 0, 0))
        crop.paste(transparent, (left, top))
        return crop
    raise ValueError(f"{asset_name}: unknown center mode {mode!r}")


def load_manifest() -> dict:
    with open(MANIFEST_PATH) as f:
        return json.load(f)


def extract(manifest: dict, write_assets: bool) -> dict[str, Image.Image]:
    sources: dict[str, Image.Image] = {}
    for key, rel in manifest["sources"].items():
        path = REPO_ROOT / rel
        if not path.exists():
            raise FileNotFoundError(f"source {key}: {path}")
        sources[key] = Image.open(path).convert("RGB")

    results: dict[str, Image.Image] = {}
    for name, entry in manifest["assets"].items():
        src = sources[entry["source"]]
        x, y, w, h = entry["rect"]
        if x < 0 or y < 0 or x + w > src.width or y + h > src.height:
            raise ValueError(
                f"{name}: rect {entry['rect']} exceeds {entry['source']} "
                f"({src.width}x{src.height})"
            )
        sl = entry.get("slice")
        if sl and (sl["left"] + sl["right"] >= w or sl["top"] + sl["bottom"] >= h):
            raise ValueError(f"{name}: slice insets exceed rect size")
        crop = src.crop((x, y, x + w, y + h))
        apply_erase(name, entry, crop, src)
        crop = apply_center(name, entry, crop, src)
        results[name] = crop
        if write_assets:
            out_path = OUT_ROOT / entry["out"]
            out_path.parent.mkdir(parents=True, exist_ok=True)
            crop.save(out_path)
    return results


def write_ts_manifest(manifest: dict) -> None:
    """Generate manifest.ts: one import per asset plus slice/size metadata."""
    lines = [
        "// GENERATED by scripts/extract-arcade-kit.py -- do not edit by hand.",
        "// Source of truth: scripts/arcade-kit.manifest.json + the concept art.",
        "",
    ]
    var_names: dict[str, str] = {}
    for name, entry in manifest["assets"].items():
        var = "img_" + name.replace("-", "_")
        var_names[name] = var
        lines.append(f'import {var} from "./{entry["out"]}";')
    lines.append("")
    lines.append("export interface ArcadeAsset {")
    lines.append("  url: string;")
    lines.append("  width: number;")
    lines.append("  height: number;")
    lines.append("  /** 9-slice border-image insets in source pixels, if framed. */")
    lines.append("  slice?: { top: number; right: number; bottom: number; left: number };")
    lines.append("}")
    lines.append("")
    lines.append("export const arcadeAssets = {")
    for name, entry in manifest["assets"].items():
        _, _, w, h = entry["rect"]
        slice_part = ""
        if "slice" in entry:
            s = entry["slice"]
            slice_part = (
                f", slice: {{ top: {s['top']}, right: {s['right']},"
                f" bottom: {s['bottom']}, left: {s['left']} }}"
            )
        key = json.dumps(name)
        lines.append(
            f"  {key}: {{ url: {var_names[name]}, width: {w}, height: {h}{slice_part} }},"
        )
    lines.append("} as const satisfies Record<string, ArcadeAsset>;")
    lines.append("")
    lines.append("export type ArcadeAssetName = keyof typeof arcadeAssets;")
    lines.append("")
    TS_MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    TS_MANIFEST_PATH.write_text("\n".join(lines))


def checker_paste(sheet: Image.Image, thumb: Image.Image, pos: tuple[int, int]) -> None:
    """Paste an RGBA thumb over a checkerboard so punched alpha is visible."""
    if thumb.mode == "RGBA":
        board = Image.new("RGB", thumb.size, PREVIEW_CHECKER[0])
        d = ImageDraw.Draw(board)
        step = 12
        for by in range(0, thumb.height, step):
            for bx in range(0, thumb.width, step):
                if (bx // step + by // step) % 2:
                    d.rectangle([bx, by, bx + step - 1, by + step - 1], fill=PREVIEW_CHECKER[1])
        board.paste(thumb, (0, 0), thumb)
        sheet.paste(board, pos)
    else:
        sheet.paste(thumb, pos)


def build_preview(results: dict[str, Image.Image], out_path: Path) -> None:
    names = list(results)
    cell_w = PREVIEW_MAX_THUMB + PREVIEW_CELL_PAD * 2
    cell_h = PREVIEW_MAX_THUMB + PREVIEW_CELL_PAD * 2 + PREVIEW_LABEL_H
    rows = (len(names) + PREVIEW_COLS - 1) // PREVIEW_COLS
    sheet = Image.new("RGB", (cell_w * PREVIEW_COLS, cell_h * rows), PREVIEW_BG)
    draw = ImageDraw.Draw(sheet)
    for i, name in enumerate(names):
        im = results[name]
        scale = min(PREVIEW_MAX_THUMB / im.width, PREVIEW_MAX_THUMB / im.height, 1.0)
        thumb = im.resize(
            (max(1, int(im.width * scale)), max(1, int(im.height * scale))),
            Image.NEAREST,
        )
        cx = (i % PREVIEW_COLS) * cell_w
        cy = (i // PREVIEW_COLS) * cell_h
        px = cx + (cell_w - thumb.width) // 2
        py = cy + PREVIEW_CELL_PAD + (PREVIEW_MAX_THUMB - thumb.height) // 2
        checker_paste(sheet, thumb, (px, py))
        label = f"{name} {im.width}x{im.height}"
        draw.text((cx + PREVIEW_CELL_PAD, cy + cell_h - PREVIEW_LABEL_H), label, fill=(255, 220, 80))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview-only", action="store_true", help="build the contact sheet without writing assets or manifest.ts")
    parser.add_argument("--preview-out", type=Path, default=PREVIEW_PATH, help="contact sheet output path")
    args = parser.parse_args()

    manifest = load_manifest()
    results = extract(manifest, write_assets=not args.preview_only)
    if not args.preview_only:
        write_ts_manifest(manifest)
        print(f"wrote {len(results)} assets under {OUT_ROOT.relative_to(REPO_ROOT)}")
        print(f"wrote {TS_MANIFEST_PATH.relative_to(REPO_ROOT)}")
    build_preview(results, args.preview_out)
    print(f"wrote {args.preview_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
