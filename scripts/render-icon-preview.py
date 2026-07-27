#!/usr/bin/env python3
"""Meld Masters Phase 6 icon preview sheet -- documentation only, never a
production asset (docs/meld-masters-visual-refresh-plan.md §6, closure
review-materials requirement). Composites the already-derived icon outputs
(run scripts/derive-icons.py first) onto light and dark sample backgrounds,
with representative circular and rounded-square crop guides over the
maskable variant, plus favicon previews at 48/32/16px.

Usage: python3 scripts/render-icon-preview.py
Output: docs/design-reference/phase-6-review/icon-preview-sheet.png
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parent.parent
ICONS = REPO_ROOT / "apps/web/public/icons"
FAVICON_ICO = REPO_ROOT / "apps/web/public/favicon.ico"
OUT_DIR = REPO_ROOT / "docs/design-reference/phase-6-review"

LIGHT_BG = (240, 240, 245)
DARK_BG = (18, 20, 28)
CELL = 200
PAD = 24
LABEL_H = 30


def load_favicon_frame(size: int) -> Image.Image:
    im = Image.open(FAVICON_ICO)
    im.seek(0)
    # PIL's ICO reader exposes .ico.sizes(); re-open sized via the size arg.
    return Image.open(FAVICON_ICO).convert("RGBA").resize((size, size), Image.LANCZOS) if im.size != (
        size,
        size,
    ) else im.convert("RGBA")


def try_font(size: int) -> ImageFont.ImageFont:
    for candidate in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def cell(bg_color, icon: Image.Image, label: str, font) -> Image.Image:
    canvas = Image.new("RGB", (CELL, CELL + LABEL_H), bg_color)
    icon_disp = icon.convert("RGBA")
    scale = min((CELL - PAD) / icon_disp.width, (CELL - PAD) / icon_disp.height)
    new_size = (max(1, round(icon_disp.width * scale)), max(1, round(icon_disp.height * scale)))
    icon_disp = icon_disp.resize(new_size, Image.LANCZOS)
    offset = ((CELL - new_size[0]) // 2, (CELL - new_size[1]) // 2)
    canvas.paste(icon_disp, offset, icon_disp)
    draw = ImageDraw.Draw(canvas)
    text_color = (20, 20, 20) if sum(bg_color) > 400 else (230, 230, 230)
    draw.text((8, CELL + 6), label, fill=text_color, font=font)
    return canvas


def crop_guide_cell(bg_color, icon: Image.Image, label: str, font, shape: str) -> Image.Image:
    """Overlays a translucent mask showing what a circular or rounded-square
    OS mask would crop away from the maskable icon."""
    canvas = Image.new("RGB", (CELL, CELL + LABEL_H), bg_color)
    icon_disp = icon.convert("RGBA").resize((CELL - PAD, CELL - PAD), Image.LANCZOS)
    offset = (PAD // 2, PAD // 2)
    canvas.paste(icon_disp, offset, icon_disp)

    overlay = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    full = [0, 0, CELL, CELL]
    if shape == "circle":
        odraw.ellipse(full, fill=(0, 0, 0, 0))
        mask = Image.new("L", (CELL, CELL), 255)
        mdraw = ImageDraw.Draw(mask)
        mdraw.ellipse(full, fill=0)
    else:  # rounded-square, ~22% corner radius (Android's default)
        radius = round(CELL * 0.22)
        mask = Image.new("L", (CELL, CELL), 255)
        mdraw = ImageDraw.Draw(mask)
        mdraw.rounded_rectangle(full, radius=radius, fill=0)
    darken = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 140))
    canvas_rgba = canvas.convert("RGBA")
    canvas_rgba.paste(darken, (0, 0), mask)
    canvas = canvas_rgba.convert("RGB")

    draw = ImageDraw.Draw(canvas)
    text_color = (20, 20, 20) if sum(bg_color) > 400 else (230, 230, 230)
    draw.text((8, CELL + 6), label, fill=text_color, font=font)
    return canvas


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    font = try_font(14)
    title_font = try_font(20)

    icon192 = Image.open(ICONS / "icon-192.png")
    icon512 = Image.open(ICONS / "icon-512.png")
    maskable512 = Image.open(ICONS / "icon-maskable-512.png")
    apple = Image.open(ICONS / "apple-touch-icon.png")
    fav48 = load_favicon_frame(48)
    fav32 = load_favicon_frame(32)
    fav16 = load_favicon_frame(16)

    rows = []
    for bg_name, bg in [("Light background", LIGHT_BG), ("Dark background", DARK_BG)]:
        cells = [
            cell(bg, icon192, "icon-192.png (any)", font),
            cell(bg, icon512, "icon-512.png (any)", font),
            crop_guide_cell(bg, maskable512, "maskable, circle guide", font, "circle"),
            crop_guide_cell(bg, maskable512, "maskable, rounded-sq guide", font, "square"),
            cell(bg, apple, "apple-touch-icon (180)", font),
            cell(bg, fav48, "favicon 48px", font),
            cell(bg, fav32, "favicon 32px", font),
            cell(bg, fav16, "favicon 16px", font),
        ]
        row_width = CELL * len(cells)
        row_canvas = Image.new("RGB", (row_width, CELL + LABEL_H + 40), bg)
        rd = ImageDraw.Draw(row_canvas)
        text_color = (20, 20, 20) if sum(bg) > 400 else (230, 230, 230)
        rd.text((8, 8), bg_name, fill=text_color, font=title_font)
        for i, c in enumerate(cells):
            row_canvas.paste(c, (i * CELL, 40))
        rows.append(row_canvas)

    sheet = Image.new("RGB", (rows[0].width, sum(r.height for r in rows) + 20), (30, 30, 34))
    y = 10
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height
    out_path = OUT_DIR / "icon-preview-sheet.png"
    sheet.save(out_path, format="PNG", optimize=True)
    print(f"{out_path.relative_to(REPO_ROOT)}  {out_path.stat().st_size:,} bytes  {sheet.size}")


if __name__ == "__main__":
    main()
