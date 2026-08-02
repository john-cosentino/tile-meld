# Arcade visual kit — how the concept-fidelity UI works

Written 2026-08-01, at the end of the concept-fidelity rebuild
(feature/arcade-pixel-kit). This supersedes the visual approach of
`docs/meld-masters-visual-refresh-plan.md` (CSS-only theming) and the
generated-art pipeline behind `docs/meld-masters-visual-baseline-v1.md` —
see that file's superseded banner.

## The one governing idea

**The concept art is both the spec and the asset source.** User decision,
2026-08-01 (see `docs/decisions.md`):

- Chrome (panel frames, plates, cards, tiles, LCD, mastheads) is cropped /
  9-sliced directly out of the concept PNGs. No AI image generation.
- Compositions are traced from the concepts as measured region maps.
- Nothing visual is self-certified: checkpoint evidence is concept-vs-app
  comparison sheets, judged by the user.

Binding targets:

| Screen | Spec |
|---|---|
| Home desktop | `docs/design-reference/v2/new_layout1.png` |
| Home phone | `docs/design-reference/mainscreen.jpg` (designer phone comp, 2026-08-02) |
| Tabletop desktop | `docs/design-reference/meld-masters/meld-masters-concept-01.png` |
| Tabletop phone portrait | `docs/design-reference/mobile.jpeg` + `gameplay.jpg` (designer phone comps, 2026-08-02; supersede `.../meld-masters-concept-03.png`) |
| Utility screens | derived from the kit language (no 1:1 concept) |

Phone-specific chrome (the `*-phone-*` assets) is extracted from the phone
comps and rendered as a whole-art background stretch on phone — the
desktop frames' braces and slants don't 9-slice cleanly at phone
aspect ratios (see the round-4 notes in `arcade-kit.css`).

## Asset pipeline

- `scripts/arcade-kit.manifest.json` — one entry per asset: source image,
  crop rect, 9-slice insets, center treatment, erase list, output path.
- `python3 scripts/extract-arcade-kit.py` — regenerates
  `apps/web/src/assets/arcade/**` and the typed
  `apps/web/src/assets/arcade/manifest.ts`, plus the review contact sheet
  `docs/design-reference/arcade-kit-preview.png`. **Never hand-edit the
  extracted PNGs** — change the manifest and re-run.
- Center treatments keep "text is never baked into artwork" true:
  `flatten` fills a frame's interior with a sampled color (live HTML text
  sits on it), `transparent` punches the interior for frames over live
  content, `erase` rectangles remove baked text that sits inside kept
  slice bands (e.g. hump titles).
- `python3 scripts/pixelate-portraits.py` — deterministic pixel-art
  conversion of the portrait pack (LANCZOS downscale → median-cut
  quantize → NEAREST upscale). Sources in docs/ are never modified.
- `apps/web/test/arcadeManifest.test.ts` guards rect bounds, slice sanity,
  extracted dimensions, and manifest coverage.

## Component kit

`apps/web/src/arcade/`: `ArcadePanel` (framed panel, live title, optional
`scrollable`), `ArcadePlate`/`ArcadePlateLink` (button/link plates),
`ArcadeTileFace`, `ArcadeLCD`, `ArcadeMeter`, `PortraitCard`,
`ArcadeIcon`, and `frameStyle()`/`coverStyle()` helpers that read 9-slice
metadata from the generated manifest. Styling lives in
`apps/web/src/styles/arcade-kit.css`; `--font-arcade` is VT323
(user-selected 2026-08-01; see `apps/web/src/assets/fonts/README.md`).

Dev-only review surfaces (literal `import.meta.env.DEV` gates, verified
absent from production builds):

- `/prototype/arcade-kit` — component gallery with stress content.
- `?concept-overlay=<home|tabletop-desktop|tabletop-portrait>` on any
  route — the concept art over the live app at adjustable opacity
  (`[`/`]` keys, `o` toggles) for overlay-first building.

## Composition contract (region maps)

`docs/design-reference/region-maps/*.json` hold each concept composition
as source-pixel rects (desktop) or a top-to-bottom flow order (phone).
They are consumed by BOTH the CSS (percent-positioned `.home-region--*` /
`.tt-region--*` rules) and `e2e/tests/arcade-regions.spec.ts`
(`pnpm run test:arcade`, chromium-only), which asserts every
`data-region` element lands within tolerance (3%) of the concept.
**Change the map and the CSS together, never one side.**

## Review loop

1. `e2e/scripts/arcade/capture-arcade-screens.ts [screen...]` — raw
   captures at the contract viewports (dev servers must be running).
2. `python3 scripts/build-arcade-comparisons.py [screen...]` — triptych
   (concept | app | 50% blend) and blurred-silhouette sheets into
   `docs/design-reference/arcade-review/<screen>/`.
3. The user judges the sheets at each checkpoint. The agent never
   declares visual success.

## Accessibility rules the rebuild established

Ported from the deleted global.css sections and the Phase 5/6 e2e runs;
these are load-bearing, tested behaviors:

- **Scrollable regions are keyboard-focusable** (`tabIndex=0` — the
  `scrollable` prop on ArcadePanel, the tabletop competitors row, the
  how-to region). Axe rule: scrollable-region-focusable.
- **Plate sublabels are `aria-hidden`** so a control's accessible name is
  exactly its visible label (tests and SC 2.5.3 both depend on this).
- **Decorative mastheads are `pointer-events: none`** so art can never
  intercept a click during a layout transition.
- **Visual all-caps comes from `text-transform` only** — accessible names
  keep natural casing.
- **On home the menu rail IS the "Main navigation" landmark** (real links
  for navigation, a real button for Play vs Computer); the header nav is
  hidden on home and tabletop but its links stay in the DOM. Utility
  screens keep the visible slim header.
- **Tile geometry is untouched** (2.75rem x 3.5rem) — dnd-kit collision
  tuning and the drag e2e matrix were built against it; only the tile
  surface art changed.
- Tile color tokens (`--tile-color-C1..C4`) still come from
  `packages/shared` via `applyBrandingTokens.ts`; contrast rationale for
  the tile-scoped tokens remains in `global.css`'s `:root` comments.
- `--bg-page`/THEME_COLOR must stay in lockstep across branding.ts,
  index.html, manifest.json, and global.css — `manifestIcons.test.ts`
  enforces it.

## Verification commands

```
pnpm --filter @tile-meld/web run test        # unit (469)
cd e2e && pnpm run test:arcade               # region contracts (3)
cd e2e && pnpm exec playwright test --project=chromium   # full suite (46)
```

Chromium-only locally; the full browser matrix is CI-only (recorded
machine-freeze incident — see docs/current-state.md).
