# Meld Masters visual refresh — Phase 2 summary

## 1. Date

2026-07-26 through 2026-07-27 (UTC).

## 2. Starting branch and commit

`main` @ `c48ddfc8c0d0e5ff2fa64fdacfac8cdb2e411e83` ("feat(brand): rename
public product to Meld Masters via centralized PRODUCT_NAME" — the Phase 1
checkpoint).

## 3. Starting upstream and worktree status

Verified before any edit: worktree clean, `main` tracking `origin/main`
with no ahead/behind divergence (fetched and confirmed). Matched the
expected starting point exactly.

## 4. Approved decisions implemented

- **D2 — dark-only arcade theme.** The `@media (prefers-color-scheme:
  dark)` override was removed entirely rather than kept as a no-op: `:root`
  now holds the arcade dark values directly, so both an OS light preference
  and an OS dark preference resolve to the identical palette (there is
  nothing left to switch). No theme toggle was added. The legacy
  `--color-*` token structure is preserved (remapped, not deleted), so a
  deliberate future light theme remains straightforward to add.
- **D5 — Silkscreen display font.** Self-hosted, `@font-face`'d with
  `font-display: swap`, applied only to the wordmark, headings/panel
  titles, and nav labels via `--font-display`. Body text, forms, chat, tile
  numbers, and recovery codes are untouched and remain on `--font-sans`.
- **Decorative header monogram.** Added beside the live-text wordmark,
  `alt=""`, explicit `width`/`height`, hidden below 480px. The link's
  accessible name is verified (by test) to remain exactly `Meld Masters`.

## 5. Final design-token inventory

```css
/* Fonts */
--font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
--font-display: "Silkscreen", var(--font-sans);

/* Page and surface layers */
--bg-page: #0a0e1a;
--bg-panel: #101828;
--bg-panel-raised: #16223a;
--bg-inset: #0c1322;

/* Primary arcade accents */
--neon-cyan: #3fe0ff;
--neon-cyan-dim: rgba(63, 224, 255, 0.28);
--neon-orange: #ff9f2e;
--neon-gold: #ffc94d;

/* Secondary arcade accents (restrained use only) */
--neon-purple: #b06aff;
--neon-green: #58e08a;
--neon-pink: #ff5fa8;
--grid-line: rgba(63, 224, 255, 0.1);

/* Text */
--text-primary: #edf2fb;
--text-muted: #9fb0c9;
--text-on-accent: #0a0e1a;

/* State colors */
--state-success: #58e08a;
--state-warning: #ffc94d;
--state-error: #ff6b5e;
--state-active: #3fe0ff;
--state-waiting: #9fb0c9;
--state-disabled-opacity: 0.5;

/* Legacy semantic tokens -- kept, remapped onto the arcade tokens above */
--color-bg: var(--bg-page);
--color-surface: var(--bg-panel);
--color-border: var(--neon-cyan-dim);
--color-text: var(--text-primary);
--color-text-muted: var(--text-muted);
--color-accent: var(--neon-cyan);
--color-danger: var(--state-error);
--color-success: var(--state-success);
--color-warning: var(--state-warning);

/* Framing */
--frame-width: 2px;
--corner-notch: 10px;
--glow-sm: 0 0 6px var(--neon-cyan-dim);
--glow-focus: 0 0 0 3px rgba(63, 224, 255, 0.85);

/* Motion */
--duration-fast: 120ms;
--duration-medium: 200ms;
--ease-arcade: cubic-bezier(0.2, 0.9, 0.3, 1);
```

`--radius-md`, `--radius-lg`, `--space-1..8`, and `--shadow-sm` are
unchanged from before this phase (`--shadow-sm`'s alpha was deepened
slightly, `0.08` → `0.35`, since a barely-visible shadow on a near-black
page reads as nothing at all — still a plain drop shadow, not a glow).

All values proposed in the task brief were used as given, verified
sufficient by the contrast table below, and none needed adjustment.

## 6. Final contrast-ratio table

Every pair below is the actual measured WCAG contrast ratio for the token
values above (`(L1+0.05)/(L2+0.05)` on relative luminance), not an
estimate. **Requirement: normal text ≥4.5:1, large/display text ≥3:1,
focus indicator ≥3:1.** All pass, several by a wide margin.

| Combination | Ratio |
| --- | --- |
| `--text-primary` on `--bg-page` | 17.14:1 |
| `--text-primary` on `--bg-panel` | 15.80:1 |
| `--text-primary` on `--bg-panel-raised` | 14.12:1 |
| `--text-muted` on `--bg-page` | 8.74:1 |
| `--text-muted` on `--bg-panel` | 8.05:1 |
| `--text-muted` on `--bg-panel-raised` | 7.20:1 |
| `--text-on-accent` on `--neon-orange` | 9.40:1 |
| `--text-on-accent` on `--neon-gold` | 12.57:1 |
| `--text-on-accent` on `--neon-cyan` | 12.21:1 |
| `--text-on-accent` on `--state-error` | 6.89:1 |
| ~~white on `--neon-cyan`~~ (old `button.primary` pattern — **fails**, fixed, see §10) | 1.58:1 |
| ~~white on `--state-error`~~ (old `button.danger` pattern — **fails**, fixed, see §10) | 2.79:1 |
| `--neon-cyan` focus ring on `--bg-page` | 12.21:1 |
| `--neon-cyan` focus ring on `--bg-panel` | 11.25:1 |
| `--neon-cyan` (nav link / wordmark fallback) on `--bg-panel` | 11.25:1 |
| `--neon-gold` (wordmark gradient end) on `--bg-panel` | 11.59:1 |
| `--state-success` on `--bg-panel` | 10.52:1 |
| `--state-warning` on `--bg-panel` | 11.59:1 |
| `--state-error` on `--bg-panel` | 6.35:1 |
| `--state-error` text on `.error-banner`'s mixed background (`color-mix(12%, --bg-page)` ≈ `#271922`) | 6.02:1 |
| `--state-warning` text on `.warning-banner`'s mixed background (≈ `#272420`) | 10.09:1 |

Two combinations in the proposed system **failed** and were corrected —
see §10 for the fix and reasoning; both were legacy hardcoded `#fff` text
on buttons that inherited the new, lighter accent colors, not a flaw in
the proposed token *values* themselves.

## 7. Silkscreen source and license information

- Source: the official Google Fonts repository,
  `https://github.com/google/fonts`, path `ofl/silkscreen/` — not a
  third-party mirror. Fetched directly via
  `raw.githubusercontent.com/google/fonts/main/ofl/silkscreen/...` on
  2026-07-26; downloaded byte sizes matched the GitHub API's reported
  sizes exactly (4394 / 30632 / 32220 bytes for `OFL.txt` /
  `Silkscreen-Bold.ttf` / `Silkscreen-Regular.ttf`).
- Designer: Jason Kottke. Upstream project:
  `https://github.com/googlefonts/silkscreen`.
- License: SIL Open Font License 1.1. Copyright 2001 The Silkscreen
  Project Authors. The exact, unmodified `OFL.txt` from the source repo is
  committed alongside the font files.
- The two `.ttf` files were converted to `.woff2` with `ttf2woff2` (a
  lossless container conversion of the same outlines, not a re-derivation
  of the font) and are not themselves kept in the repository — only the
  runtime `.woff2` files and the license are.

## 8. Font files added

`apps/web/src/assets/fonts/`:

| File | Size |
| --- | --- |
| `OFL.txt` | 4,394 B |
| `Silkscreen-Regular.woff2` | 9,172 B |
| `Silkscreen-Bold.woff2` | 8,292 B |
| `README.md` | source/license/provenance note (new, this phase) |

No runtime request is ever made to Google Fonts or any other external
host — both `@font-face` rules reference the local, relative,
self-hosted path only; verified by an automated test (§13).

## 9. Header-monogram derivative details

- **Source master:** `docs/design-reference/meld-masters/meld-masters-concept-logo.png`
  (1254×1254, RGB, no alpha channel). **Not modified** — `git status`
  confirms zero change to anything under `docs/design-reference/`.
- **Processing performed** (mechanical only, no artistic redrawing, no
  composition change, no added text):
  1. A linear alpha ramp keyed on per-pixel max-channel luminance
     (opaque above 14, transparent at/below 2, smoothly interpolated
     between) converts the master's pure-black outer corners to
     transparency — a chroma-key operation, not a redraw. This recovers
     the rounded-square panel's silhouette.
  2. Cropped to the resulting non-transparent bounding box (1216×1214),
     removing the now-transparent corner margin.
  3. Downscaled with high-quality (Lanczos) resampling to 96×96 for a
     small header emblem.
- **Output:** `apps/web/src/assets/brand/meld-masters-monogram-header.png`
- **Output dimensions:** 96×96 px (displayed at 32×32 CSS px via explicit
  `width`/`height` attributes — no layout shift).
- **File size:** 19,226 B (19.2 KB).
- **Confirmation that it is decorative:** rendered with `alt=""` in
  `RootLayout.tsx`; verified by an automated test that it does not appear
  via an accessible `role="img"` query and that the header's link
  accessible name stays exactly `"Meld Masters"` (§13).
- The twin-M-and-crown design and its neon-bordered rounded-square framing
  are unchanged — only corner transparency, cropping, and resizing were
  applied.

## 10. Global CSS changes

`apps/web/src/styles/global.css`:

- Full token block replaced per §5, including the legacy-token remap.
- `@media (prefers-color-scheme: dark)` override removed (D2 — see §4).
- Two `@font-face` rules added for Silkscreen (Regular 400, Bold 700).
- `body` background changed from a flat `var(--color-bg)` fill to the
  same flat color plus a static, faint cyan grid (two `repeating-linear-
  gradient` layers) with a soft top fade, purely via `background-image` —
  no new element, no image asset, `pointer-events` unaffected (background
  images are never interactive).
- **`button.primary`/`button.danger` text color changed from hardcoded
  `#fff` to `var(--text-on-accent)`.** This was *required*, not optional:
  the remapped `--color-accent` (now `--neon-cyan`) and `--color-danger`
  (now `--state-error`) are light colors, and white text on either
  measured 1.58:1 and 2.79:1 — both real WCAG failures the old dark
  blue/red never had. `--text-on-accent` measures 12.21:1 and 6.89:1
  against the same two backgrounds. No other property of these buttons
  changed.
- `:focus-visible` changed from a plain outline to an outline plus
  `--glow-focus` box-shadow, both keyed to `--neon-cyan`, for visibility
  against the new dark surfaces (11–12:1 measured, see §6). Static shadow,
  not an animation.
- New reusable foundation classes: `.arcade-panel` (+ `--raised`,
  `--accent-cyan/orange/gold`, `--notched` modifiers), `.app-header`,
  `.brand-wordmark`, `.brand-wordmark-text`, `.brand-monogram`, `.app-nav`.
  `.arcade-panel--notched` is defined but applied nowhere in this phase —
  it exists as an available tool for Phase 3/4's more detailed screen
  work, per the plan's explicit caution against clip-path notches on
  fully-bordered boxes everywhere.
- No existing rule for `.card`, `.tile`, `.drop-zone`, `.badge`,
  `.dashboard-*`, `.tabletop-*`, or any other screen-specific class was
  rewritten — they inherit the new dark palette automatically through the
  legacy-token remap, exactly as scoped.

## 11. Header and navigation changes

`apps/web/src/layout/RootLayout.tsx`:

- Replaced three inline `style={{...}}` objects (header row, wordmark
  link) with the new CSS classes above — a cleanup this phase's own
  "avoid scattered visual constants" instruction required, not scope
  creep.
- Added the decorative monogram `<img>` (imported via Vite asset import;
  a `vite-env.d.ts` triple-slash reference was added since `tsconfig.json`
  sets `types: []`, which otherwise excludes the ambient asset-import
  types Vite normally provides).
- Wrapped the wordmark text in a `<span className="brand-wordmark-text">`
  for the Silkscreen/gradient treatment; the `PRODUCT_NAME` value itself
  is untouched.
- Nav links, routes, and text: unchanged. No item added or removed. No
  hamburger menu, options screen, or other concept-only navigation
  element was introduced.
- `NotificationsControl` usage: unchanged.

## 12. Reduced-motion and performance protections

- No `@keyframes`, `animation`, or `animation-name` rule exists anywhere
  in `global.css` (grep-verified) — nothing in this phase introduced
  looping, pulsing, or ambient motion.
- The one new `transition` (`.app-nav a`'s `border-color` on hover) is a
  short, non-essential state transition using the new motion tokens, and
  is automatically clamped by the existing global `@media
  (prefers-reduced-motion: reduce)` wildcard rule (`*, *::before,
  *::after`) — no change to that rule was needed.
- The new focus glow (`--glow-focus`) is a static `box-shadow`, not an
  animation.
- The site-wide grid background is static CSS gradients only — no image
  asset, no `backdrop-filter`, no blur filter, no GPU-heavy continuous
  effect.

## 13. Tests added or updated

- **New: `apps/web/test/RootLayout.test.tsx`** (5 tests) — no RootLayout
  test existed before this phase. Verifies: exactly one link named
  `"Meld Masters"` exists; the monogram is present in the DOM with
  `alt=""` and explicit dimensions but does **not** appear via an
  accessible `role="img"` query (confirming it's actually invisible to
  assistive technology, not just visually hidden); every nav link's
  route is intact; the routed child still renders via `Outlet`; mounting
  the shell alongside `NotificationsControl` doesn't throw.
- **Updated: `apps/web/test/brandConsistency.test.ts`** (+3 tests, 12
  total) — new `describe` block asserts `global.css` declares Silkscreen
  via `@font-face` with a local relative path, uses `font-display: swap`,
  and contains no `fonts.googleapis.com`/`fonts.gstatic.com` reference and
  no `@font-face` rule pointing at an `http(s)://` URL.
- No pixel-perfect or exact-CSS-value tests were added, per the plan's
  explicit guidance against that kind of brittleness.

## 14. Commands run and exact results

Database safety: `TEST_DATABASE_URL`/`DATABASE_URL` confirmed (redacted)
pointed at `tilemeld_test` before any command touching a truncatable
database. E2E used a separately created, freshly migrated
`tilemeld_e2e_baseline`, with the server process and Playwright process
given the identical `DATABASE_URL`.

| Command | Result |
| --- | --- |
| `pnpm --filter @tile-meld/web run typecheck` | 1 real error found and fixed (`exact` is not a valid `ByRoleOptions` property in this Testing Library version — removed; `name: "Meld Masters"` already matches exactly) — pass after fix |
| `pnpm --filter @tile-meld/web exec vitest run test/RootLayout.test.tsx test/brandConsistency.test.ts` | pass — 17/17 |
| `pnpm --filter @tile-meld/web run test` | pass — 23 files, 174 tests |
| `pnpm run format:check` | pass |
| `pnpm run lint` | pass |
| `pnpm run typecheck` (6 workspace projects) | pass |
| `pnpm run test` | pass — exit 0; `apps/server` tail confirms 317/317 across 28 files |
| `pnpm run build` | pass — Vite correctly bundled and hashed both `.woff2` files and the monogram `.png` as separate assets; built `dist/index.html` and CSS spot-checked to reference the hashed font/monogram paths correctly |

## 15. Chromium and Mobile Chrome results

```
cd e2e && npx playwright test --project=chromium --project=mobile-chrome
```

**66/66 passed, 13.4 minutes.** Includes every existing `accessibility.spec.ts`
axe check (Home, Create Room, Join Room, Public Lobby, Recovery, Waiting
Room, Tabletop) and `tabletopMobile.spec.ts`'s 390px zero-horizontal-overflow
scan — all against the new arcade theme, all clean. No axe threshold was
lowered; none needed to be. The full 5-project matrix was not run, per the
task's explicit scope (chromium + mobile-chrome are the required Phase 2
projects; the previously-documented WebKit-family timeout behavior from
Phase 1 is unrelated infrastructure, not something this phase's changes
could plausibly affect, and re-litigating it wasn't requested for this
checkpoint).

## 16. Phase 2 screenshot inventory

- **Path:** `docs/design-reference/phase-2-review/`
- **Count:** 12 (3 screens × 4 viewports — meets the "at least 12" target
  exactly)
- **Screens:** `home-dashboard`, `public-lobby`, `tabletop-active`
- **Viewports:** 1440×900, 1280×720, 390×844, 844×390 — every screen at
  every viewport
- Captured with a new, focused sibling script,
  `e2e/scripts/capture-phase-2-review.ts` (kept outside `e2e/tests` so it
  never runs as part of the real suite or CI, same pattern as Phase 0's
  baseline script). One bug was caught and fixed during capture: the
  first attempt's "home-dashboard" state actually captured the Recovery
  page (where `claimUsername` leaves the browser) rather than Home; fixed
  by explicitly navigating back via the header link before capturing, and
  the full set was re-captured from a clean state.
- The Phase 0 baseline under `docs/design-reference/baseline/` was not
  touched (`git status` confirms zero change there).
- Visual confirmation from the captures themselves: dark arcade shell
  throughout; the site-wide grid background is visible but subtle and
  never competes with text; the header shows the monogram + gradient
  Silkscreen wordmark + arcade nav tabs; the "Play vs Computer" primary
  button renders with dark text on cyan (the contrast fix from §10) rather
  than illegible white-on-cyan; zero horizontal overflow at 390px on any
  of the three screens.

## 17. Confirmation: no Phase 3 screen-specific redesign occurred

Home dashboard cards, public-lobby rows, create/join-room form controls,
waiting-room player panels, and recovery panels received **no
component-level styling changes** — they render in the new palette purely
because the legacy tokens they already used were remapped. No new class
was added to any of those components' JSX.

## 18. Confirmation: no Phase 4 tabletop redesign occurred

No file under `apps/web/src/tabletop/`, `TabletopPage.tsx`'s styling, or
`.tabletop-*` CSS rules was changed. Tile dimensions, colors, and rendering
are byte-for-byte unchanged; `applyBrandingTokens.ts` was not touched;
drag-and-drop logic is untouched (confirmed by the clean
`drag-and-drop.spec.ts` result in §15).

## 19. Confirmation: no Phase 6 PWA/icon work occurred

`apps/web/public/manifest.json`, `apps/web/public/sw.js`'s icon paths,
`apps/web/public/*.png` (favicon/apple-touch-icon/PWA icons), and
`apps/web/index.html`'s icon `<link>` tags are byte-for-byte unchanged
(`git diff` confirms no touch to any of these paths). No maskable icon, no
social-preview image, and no new manifest icon entry was added.

## 20. Confirmation: no game behavior changed

No file under `packages/engine/src`, `packages/bot/src`, or
`apps/server/src` was touched. Room lifecycle, Quick Join, auto-start, and
turn logic are unaffected — confirmed both by the diff itself and by the
full unit/integration suite plus the chromium/mobile-chrome e2e run (§14–15)
passing, including the gameplay-exercising specs (`drag-and-drop`,
`invalid-commit-penalty`, `multi-player`, `turn-timeout`, `two-player-smoke`,
`vs-computer`, `full-lifecycle`).

## 21. Remaining blocker B3

Unchanged: production character-portrait assets have not been supplied.
Blocks only Phase 5.

## 22. Files changed

| File | Purpose |
| --- | --- |
| `apps/web/src/styles/global.css` | Full token system, dark-only collapse, Silkscreen `@font-face`, site-wide grid background, `.arcade-panel`/header/nav classes, button contrast fix, focus treatment |
| `apps/web/src/layout/RootLayout.tsx` | Header restructured to use the new classes; monogram image added; wordmark wrapped for Silkscreen/gradient styling |
| `apps/web/src/vite-env.d.ts` | New: ambient Vite asset-import types (needed because `tsconfig.json` sets `types: []`) |
| `apps/web/src/assets/fonts/OFL.txt` | New: SIL OFL 1.1 license, verbatim from the source repo |
| `apps/web/src/assets/fonts/Silkscreen-Regular.woff2` | New: runtime font file |
| `apps/web/src/assets/fonts/Silkscreen-Bold.woff2` | New: runtime font file |
| `apps/web/src/assets/fonts/README.md` | New: source/license/provenance |
| `apps/web/src/assets/brand/meld-masters-monogram-header.png` | New: decorative header monogram, derived from the approved logo master |
| `apps/web/test/RootLayout.test.tsx` | New: header/monogram/nav protection tests |
| `apps/web/test/brandConsistency.test.ts` | +3 tests: Silkscreen self-hosting / no external font URL |
| `e2e/scripts/capture-phase-2-review.ts` | New: focused Phase 2 screenshot capture script |
| `docs/design-reference/phase-2-review/*.png` (12 files) | New: Phase 2 manual-review screenshots |
| `docs/meld-masters-phase-2-summary.md` | This document |
| `docs/task.md` | Phase 2 checkpoint recorded, three decisions marked implemented, Phase 3 recorded as next-but-not-started |

## 23. Manual review instructions

- **This summary:** `docs/meld-masters-phase-2-summary.md`
- **The token system and its reasoning:** `apps/web/src/styles/global.css`
  (the file-level comment and inline comments explain the dark-only
  collapse, the button contrast fix, and the notch-utility scope
  decision).
- **The monogram derivation:** §9 above; compare
  `apps/web/src/assets/brand/meld-masters-monogram-header.png` against the
  untouched master at
  `docs/design-reference/meld-masters/meld-masters-concept-logo.png`.
- **Screenshots:** `docs/design-reference/phase-2-review/` — open any
  `home-dashboard--*`, `public-lobby--*`, or `tabletop-active--*` file
  directly, or run the app locally
  (`pnpm --filter @tile-meld/server run dev` +
  `pnpm --filter @tile-meld/web run dev`) and browse it live.
- **New tests:** `apps/web/test/RootLayout.test.tsx`,
  the new `describe("src/styles/global.css...")` block in
  `apps/web/test/brandConsistency.test.ts`.

## 24. Recommended next step

**Human review before Phase 3.** Phase 3 (dashboard, lobby, and room
presentation) begins the detailed, screen-by-screen redesign this phase
deliberately did not perform, and should not start until this checkpoint
is reviewed.
