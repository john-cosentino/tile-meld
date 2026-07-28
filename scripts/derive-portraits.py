#!/usr/bin/env python3
"""Meld Masters portrait production-asset derivation (Phase 5,
docs/meld-masters-visual-refresh-plan.md §9.3). Mechanical processing only
-- resize + PNG re-compression, never a composition/content change -- and
only ever applied to the PRODUCTION COPY under apps/web/src/assets/
portraits/. The approved originals under docs/design-reference/
meld-masters/ are opened read-only and never touched.

Why this is needed: the delivered source files are 1024x1536 (2:3), 2.2-3.0
MB each -- 9 files, ~22.5 MB total. The plan's own asset contract (§9.3)
sets a combined portrait payload budget of <=150 KB, and every planned
display size (waiting-room seat panel, opponent-strip plaque) is well
under 100px. Shipping the raw multi-megabyte originals to the browser
would be wasteful by roughly two orders of magnitude for no visual
benefit at those sizes.

Target: 128px wide (192px tall, preserving the source 2:3 ratio) -- well
over 2x the largest planned display size (a ~56px portrait frame, see
apps/web/src/branding/portraits.ts), so it stays crisp on high-DPI screens
with real headroom, while landing close to the plan's combined-payload
budget.

Usage: python3 scripts/derive-portraits.py
Rerunning reproduces byte-identical output (deterministic LANCZOS resize +
Pillow's optimize=True, no randomness).
"""

from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = REPO_ROOT / "docs/design-reference/meld-masters"
DST_DIR = REPO_ROOT / "apps/web/src/assets/portraits"

FILES = [
    "portrait-rival-01.png",
    "portrait-rival-02.png",
    "portrait-rival-03.png",
    "portrait-rival-04.png",
    "portrait-rival-05.png",
    "portrait-rival-06.png",
    "portrait-rival-07.png",
    "portrait-rival-08.png",
    "portrait-fallback.png",
]

TARGET_WIDTH = 128


def main() -> None:
    DST_DIR.mkdir(parents=True, exist_ok=True)
    total_before = 0
    total_after = 0
    for name in FILES:
        src = SRC_DIR / name
        dst = DST_DIR / name
        im = Image.open(src)
        assert im.mode == "RGBA", f"expected RGBA source, got {im.mode} for {name}"
        w, h = im.size
        target_height = round(h * (TARGET_WIDTH / w))
        resized = im.resize((TARGET_WIDTH, target_height), Image.LANCZOS)
        resized.save(dst, format="PNG", optimize=True)
        before = src.stat().st_size
        after = dst.stat().st_size
        total_before += before
        total_after += after
        print(f"{name}: {w}x{h} ({before:,} bytes) -> {TARGET_WIDTH}x{target_height} ({after:,} bytes)")
    print(f"\nTotal: {total_before:,} bytes -> {total_after:,} bytes ({total_after / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
