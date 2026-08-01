#!/usr/bin/env python3
"""Meld Masters icon derivation (Phase 6, docs/meld-masters-visual-refresh-plan.md
§6.2). Deterministic mechanical processing only, applied to the approved
logo master -- never redraws, generates, or traces artwork, and never
modifies the master itself:

  1. Corner-to-transparency: the master has opaque black outside its rounded-
     square silhouette (no alpha channel). A flood fill from all 4 corners
     recovers that silhouette as real alpha, so it doesn't render as a black
     square on light backgrounds.
  2. Resize with LANCZOS resampling for every output size.
  3. Maskable variants: the whole alpha-corrected mark is inset to ~80% of
     the canvas (the standard maskable-icon safe zone) and composited onto a
     full-bleed, fully opaque navy background -- the mark's own neon border
     sits close to its bounding edge in the source, so without this inset a
     circular/squircle mask would clip it.
  4. Apple touch icon: the alpha-corrected mark, lightly inset (~92%, iOS
     applies its own corner mask so this isn't as aggressive as the
     maskable inset), composited onto the same full-bleed opaque navy.
  5. Favicons: the alpha-corrected mark at 16/32/48px for favicon.ico
     (PIL's native multi-size ICO writer), plus a 128px raster embedded in a
     self-contained SVG wrapper for favicon.svg.

Background color: `--bg-page` (apps/web/src/styles/global.css). Originally
#0a0e1a (the Phase 2-approved arcade navy -- see the Phase 6 summary for
why this was chosen over a color sampled from the logo's own slightly
different interior navy); changed to #020c16 to close a measured
saturation gap against the Meld Masters concept reference (see the
--bg-page comment in global.css for the measurement).

Source: docs/design-reference/meld-masters/meld-masters-concept-logo.png
Usage:  python3 scripts/derive-icons.py
Rerunning produces byte-identical output (no randomness, no network access).
"""

import base64
from pathlib import Path

from PIL import Image, ImageDraw

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC = REPO_ROOT / "docs/design-reference/meld-masters/meld-masters-concept-logo.png"
ICONS_DIR = REPO_ROOT / "apps/web/public/icons"
PUBLIC_DIR = REPO_ROOT / "apps/web/public"

NAVY_BG = (2, 12, 22)  # --bg-page, apps/web/src/styles/global.css
FLOOD_THRESHOLD = 40  # tuned against the master: background very quickly
# jumps by >30 per channel at the shape's true edge (see Phase 6 summary).


def load_master_with_alpha() -> Image.Image:
    """Recovers the rounded-square silhouette as real alpha via flood fill
    from all 4 corners, without touching a single interior pixel."""
    src = Image.open(SRC)
    assert src.mode == "RGB", f"expected RGB source, got {src.mode}"
    assert src.size == (1254, 1254), f"expected 1254x1254 source, got {src.size}"

    work = src.copy()
    w, h = work.size
    marker = (255, 0, 255)
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if work.getpixel(seed) != marker:
            ImageDraw.floodfill(work, seed, marker, thresh=FLOOD_THRESHOLD)

    mask_data = [255 if px == marker else 0 for px in work.getdata()]
    mask = Image.new("L", (w, h))
    mask.putdata([255 - v for v in mask_data])  # invert: marker -> 0 (transparent)

    out = src.convert("RGBA")
    out.putalpha(mask)
    return out


def resize(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.LANCZOS)


def on_navy_field(mark: Image.Image, canvas_size: int, inset_fraction: float) -> Image.Image:
    """Composites `mark` (RGBA, transparent corners) onto a full-bleed,
    fully opaque navy square, inset to `inset_fraction` of the canvas and
    centered. Returns an RGB (no alpha) image."""
    canvas = Image.new("RGB", (canvas_size, canvas_size), NAVY_BG)
    inset_size = round(canvas_size * inset_fraction)
    mark_resized = resize(mark, inset_size)
    offset = (canvas_size - inset_size) // 2
    canvas.paste(mark_resized, (offset, offset), mark_resized)
    return canvas


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, format="PNG", optimize=True)
    print(f"  {path.relative_to(REPO_ROOT)}  {path.stat().st_size:,} bytes  {im.size[0]}x{im.size[1]}  {im.mode}")


def main() -> None:
    print(f"Source: {SRC.relative_to(REPO_ROOT)}")
    master = load_master_with_alpha()
    print(f"Alpha-corrected master: {master.size}, mode={master.mode}")

    print("\nStandard icons (purpose: any, transparent corners):")
    save_png(resize(master, 192), ICONS_DIR / "icon-192.png")
    save_png(resize(master, 512), ICONS_DIR / "icon-512.png")

    print("\nMaskable icons (80% safe-zone inset, full-bleed opaque navy):")
    save_png(on_navy_field(master, 192, 0.80), ICONS_DIR / "icon-maskable-192.png")
    save_png(on_navy_field(master, 512, 0.80), ICONS_DIR / "icon-maskable-512.png")

    print("\nApple touch icon (92% inset, full-bleed opaque navy, no baked corner mask):")
    save_png(on_navy_field(master, 180, 0.92), ICONS_DIR / "apple-touch-icon.png")

    print("\nFavicon PNGs (transparent corners) + favicon.ico (16/32/48):")
    fav16 = resize(master, 16)
    fav32 = resize(master, 32)
    fav48 = resize(master, 48)
    ico_path = PUBLIC_DIR / "favicon.ico"
    fav48.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"  {ico_path.relative_to(REPO_ROOT)}  {ico_path.stat().st_size:,} bytes  sizes=16,32,48")

    print("\nSVG favicon (self-contained raster wrapper, 128px embedded PNG):")
    fav_svg_png = resize(master, 128)
    import io

    buf = io.BytesIO()
    fav_svg_png.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" '
        'width="128" height="128" role="img" aria-label="Meld Masters">'
        f'<image width="128" height="128" href="data:image/png;base64,{b64}"/>'
        "</svg>\n"
    )
    svg_path = ICONS_DIR / "favicon.svg"
    svg_path.write_text(svg)
    print(f"  {svg_path.relative_to(REPO_ROOT)}  {svg_path.stat().st_size:,} bytes  (128px raster embedded)")

    print(f"\nSource master unchanged: {SRC.stat().st_size:,} bytes (never opened for writing).")


if __name__ == "__main__":
    main()
