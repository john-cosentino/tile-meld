# `assets/tabletop/`

Reserved location for future tabletop artwork (Phase 9+, blocked on a
supplied reference — see `docs/tabletop-layout-contract.md` for the full
slot contract this directory's contents must fill). **No artwork lives
here yet.** This file exists so the directory survives in Git (which does
not track empty directories) and so a future contributor finds the rules
immediately, not just the contract document.

## Before adding anything here

Read `docs/tabletop-layout-contract.md` first — it defines every slot name,
owner component, safe area, and fallback requirement an asset must satisfy.
An asset that doesn't fit a defined slot doesn't have a home yet; extend
the contract deliberately rather than wedging an image in wherever it
visually fits.

## Non-negotiable asset rules

- **Decoration only.** No gameplay behavior, accessibility guarantee, or
  correctness property may ever depend on an image loading. Every region
  this directory's assets will eventually decorate already renders fully
  correctly with zero assets today — that must remain true forever, not
  just until the first asset is added.
- **Interactive controls stay HTML.** Buttons, drop zones, tiles, links,
  and form controls are never baked into an image. An asset may sit
  visually behind or around a control; it is never a substitute for one.
- **Text stays live HTML.** No text is ever baked into artwork (a screen
  reader can't read pixels, and neither can zoom/reflow/translation).
- **Images never capture pointer events unless deliberately interactive.**
  Default to `pointer-events: none` (or a CSS background-image, which never
  intercepts pointer events at all) for anything purely decorative — an
  artwork layer must never eat a tile drag, a click, or a drop.
- **Missing assets must leave a fully usable interface.** Every slot in the
  contract has a documented no-asset fallback (the current plain CSS
  treatment). An asset that 404s, is slow, or is simply never added must
  never degrade gameplay, layout, or accessibility below that fallback.
- **Respect safe content areas.** An asset must never cover a tile drop
  target, an action button, a status message, or any other interactive or
  informational element the contract marks as needing to stay uncovered.
- **Decorative images use empty alt text or a CSS background**
  (`alt=""` / `background-image`), never a meaningful `alt` a screen
  reader would read aloud for something with no informational content.
  **Meaningful images** (if one is ever genuinely informational, not
  decorative) require real, accurate `alt` text — but the tabletop has no
  planned meaningful-image slot today; every defined slot in the contract
  is decorative.
- **Reduced motion is respected.** Any future animated asset (a subtle
  ambient background loop, for example) must honor
  `prefers-reduced-motion: reduce` — see the existing global rule in
  `apps/web/src/styles/global.css`, which already suppresses animation/
  transition duration site-wide; a new asset must not need to reinvent
  this, only not fight it (e.g., no `!important` animations, no JS-driven
  motion that ignores the media query).

## Originality and copyright

- **No copyrighted Rummikub artwork, logos, tile faces, screenshots, or
  traced commercial layouts.** Tile Meld is not Rummikub and must not
  visually pass as it, or as a skin of it.
- **No NES, Konami, Nintendo, Game Boy, or other third-party console/
  publisher logos, branded assets, or copied UI chrome.** Any retro/
  pixel-art *inspiration* for a future visual theme (not yet started, and
  explicitly out of scope for Phase 8) must be original work, not traced,
  scraped, or lightly modified from someone else's copyrighted asset.
- **When in doubt, don't add it.** An asset with unclear provenance is a
  legal and reputational risk, not just a style question.

## What's actually in this directory right now

Nothing but this file. Phase 8 (docs/phase-08-tabletop-layout.md) reserves
the location and writes the contract; it deliberately does not add, draw,
generate, or otherwise supply any image, sprite, background, or icon here.
