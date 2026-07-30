# Meld Masters — Tabletop art integration contract

Describes how an **approved** art asset will later be wired into the
static tabletop concept prototype's real layout components. **No asset
is integrated by this checkpoint** — this document is the contract that
governs the future work in
`docs/meld-masters-tabletop-art-integration-plan.md`, not a record of
anything already done. Today, every asset slot resolves to "NOT SUPPLIED"
in the asset lab (`/prototype/tabletop-assets`), and every prototype
layout component renders its existing CSS-only treatment, unchanged.

## Per asset-family integration

### Wordmark (masthead)

- **Consumer:** `ConceptBrandMark.tsx`.
- **Import:** a standard Vite static asset import (`import wordmarkSrc
  from "../../assets/tabletop-production/masthead/wordmark-meld-masters.png"`),
  same pattern the existing monogram import already uses in the same
  file.
- **Layering:** replaces the `<h1 className="concept-wordmark">` text
  element with an `<img>`; no live content renders on top of it (it's not
  a frame, it's the content).
- **Resizing:** CSS `object-fit: contain`, sized per layout by the
  existing `.concept-wordmark` selector's `font-size`-equivalent width/
  height rules (converted to explicit `width`/`max-width` once the asset
  exists).
- **Variant selection:** none needed — one asset, `object-fit: contain`
  at each layout's box.
- **Missing-asset fallback:** if the import fails to resolve (file
  absent), the component falls back to today's live-text gradient `<h1>`
  — implemented as a build-time conditional import failure is not
  actually possible in Vite (a missing static import is a build error,
  not a runtime fallback), so in practice: **the code change that adds
  the `<img>` only lands in the same commit that adds the file** — there
  is never a commit where the component imports a file that doesn't
  exist. This is why integration only happens per-batch, after the asset
  is confirmed present (see the integration plan).
- **Focus/pointer:** not interactive, no change needed.
- **Accessibility:** `alt=""` on the `<img>`, `aria-hidden="true"`; the
  page's real accessible product name comes from a sibling live
  `<span>`/`visually-hidden` element (matching the pattern
  `RootLayout.tsx`'s header already uses for its own monogram +
  `PRODUCT_NAME` text).

### Board frame family

- **Consumer:** `ConceptBoard.tsx`.
- **Import:** three static imports, one per layout variant (Vite asset
  imports, resolved at build time).
- **Layering:** applied as `background-image` on the existing
  `.concept-board` element (already the lowest z-index layer in that
  component — the live title/meld-grid/stats content already renders as
  normal DOM children on top, no z-index changes needed).
- **Resizing:** `background-size: 100% 100%` — safe because
  `.concept-board`'s box is a fixed pixel size within each layout's
  `ScaledArtboard` canvas (verified: the box never varies at runtime in
  this static prototype, so non-uniform stretch is a no-op in practice).
- **Variant selection:** the same `useLayoutTarget()` hook that already
  selects `ConceptDesktopLayout`/`ConceptPhonePortraitLayout`/
  `ConceptPhoneLandscapeLayout` implicitly selects the board variant too,
  since each layout component only ever renders its own `ConceptBoard`
  usage with its own CSS scope (`.concept-desktop .concept-board`, etc.)
  — no new selection logic needed.
- **Missing-asset fallback:** same reasoning as the wordmark — the CSS
  `clip-path` taper treatment stays in place until the specific commit
  that adds both the file and the `background-image` rule for it.
- **Focus/pointer:** `background-image` is inherently
  `pointer-events`-inert; drag/keyboard tile interaction (in the real
  future game integration, not this static prototype) is never at risk.
- **Accessibility:** CSS backgrounds are invisible to the accessibility
  tree by construction — no ARIA needed.

### Rack frame

- **Consumer:** `ConceptRack.tsx`.
- **Import/layering/resizing:** same pattern as the board — one static
  import, `background-image` on `.concept-rack`, but via a **nine-slice**
  CSS technique instead of `background-size: 100% 100%` (the rack has no
  taper, so nine-slice's straight-edge assumption holds). Concretely:
  `border-image-source: url(...); border-image-slice: 28 24 14 24 fill;
  border-image-width: 28px 24px 14px 24px;` on `.concept-rack`, replacing
  the current flat `border-top`/`border`/`background` rules.
- **Variant selection:** one asset, reused unmodified across all three
  layouts' differing `.concept-rack` box sizes — nine-slice handles the
  size range natively.
- **Missing-asset fallback / focus / pointer / accessibility:** same
  reasoning as the board.

### Competitor card frame (optional)

- **Consumer:** `ConceptCompetitorRail.tsx` (`ConceptCompetitorCard`).
- **Import/layering:** `border-image` nine-slice on `.competitor-card`
  (renamed from today's `.concept-panel` clip-path treatment for this
  element specifically), **layered under** the existing per-seat
  `currentColor` accent, which continues to apply via the existing inline
  `style={{ color: ACCENT_VAR[c.accent] }}` — the neutral frame image
  itself carries no color; CSS `filter: hue-rotate`/a duotone technique,
  or simply an accent-colored `box-shadow`/border overlay on top of the
  neutral nine-slice frame, is how the per-seat color continues to apply
  (exact technique decided at integration time, once the real asset's
  linework is visible in the lab).
- **Active overlay:** a second `background-image` layer (or a sibling
  absolutely-positioned `::after`), shown only when
  `.competitor-card--active` is present — same conditional class logic
  already in place today.
- **Missing-asset fallback:** current `.concept-panel` notched-corner
  CSS treatment, unchanged, until this specific asset lands.
- **Portraits/text:** entirely unaffected — `<img>` portrait and name/
  score `<span>`s stay exactly where they are in the DOM, on top of the
  frame.

### Sidebar panel frame (optional)

- **Consumer:** `ConceptSidebar.tsx` (desktop/landscape) and
  `ConceptPhonePortraitLayout.tsx`'s support-row (portrait).
- **Import/layering/resizing:** nine-slice `border-image` on
  `.concept-sidebar-section`, reused for every section (turn/move-log/
  tip) and every layout — one asset, many call sites.
- **Countdown bezel (optional):** a second, separate nine-slice
  `border-image` scoped to `.concept-turn-countdown`'s wrapper only,
  layered behind the live digits.
- **Missing-asset fallback:** current bordered-panel CSS, unchanged.
- **Live text:** every value (turn status, countdown digits, move-log
  entries, tip text) stays live DOM content rendered on top; none of it
  moves or changes shape when a frame asset is added.

### Action-button plates

- **Consumer:** `ConceptActionBar.tsx`.
- **Import/layering:** nine-slice `border-image` on
  `.concept-action-button--cyan`/`--purple`/`--gold`, replacing today's
  flat `box-shadow` bevel rules for each variant.
- **Native controls:** the button elements are already plain `<div
  className="concept-action-button">` in the static prototype (matching
  the brief's "static prototype controls only" requirement for this
  checkpoint) — **when this prototype's controls are ever wired to real
  actions** (out of scope for both this checkpoint and the art-asset
  work), those `<div>`s become real `<button>` elements at that time, not
  as part of adding the background art. The art asset itself works
  identically either way, since it's a CSS background regardless of the
  element type.
- **Focus visibility:** once real `<button>` elements exist, the
  browser's native `:focus-visible` outline renders in the normal
  document paint order — **above** a `background-image`/`border-image`,
  which is always the element's own background layer, never able to
  paint over the browser's UA-level focus ring. No special CSS is needed
  to "let focus through"; this is default browser behavior, and the
  asset lab's `/prototype/tabletop-assets` Commit-Turn preview button is
  a real `<button>` today specifically so this can be verified visually
  (press Tab to it) before any real integration happens.
- **State overlays (optional):** `action-plate-states.png` layered via a
  second `background-image` (CSS `background-blend-mode` or a stacked
  `::before`) toggled by `:hover`/`:active`/`:disabled` selectors — exact
  technique decided once the asset exists; CSS-only opacity/filter
  changes remain an acceptable permanent substitute if this optional
  asset is never pursued.
- **Icons:** `ConceptIcons.tsx`'s existing inline SVGs continue to render
  as live children, positioned identically whether the background is a
  flat CSS bevel or the illustrated plate.
- **Missing-asset fallback:** current CSS bevel treatment, unchanged.

## Cross-cutting rules (every asset family)

- **How desktop/phone-portrait/phone-landscape variants are selected:**
  either (a) the asset is genuinely shared (rack, sidebar, buttons,
  competitor cards, wordmark) and one file serves all three layouts'
  differently-sized boxes via `object-fit`/nine-slice, or (b) the asset
  is layout-specific (the three board-frame variants) and is imported
  only inside the one layout component that needs it — `useLayoutTarget`
  already ensures only one of the three layout components ever mounts at
  a time, so there's no runtime branching needed beyond what already
  exists.
- **How missing assets fall back during development:** every consumer
  component's current CSS-only treatment is the permanent fallback,
  never removed until the specific commit that both adds the asset file
  and switches the CSS rule to reference it — those two changes land
  together, never separately, so there is never a broken intermediate
  state.
- **How the production build includes only approved assets:** the
  prototype route itself (`/prototype/tabletop-concept`) is already
  excluded from `vite build`'s output entirely (verified: zero matches
  for any prototype string across `apps/web/dist` after a build — see
  `docs/meld-masters-tabletop-static-prototype-v2-summary.md` §4). Any
  asset imported only from inside that route's component tree is
  therefore *also* excluded from the production bundle by the same
  mechanism — Vite's static analysis never even reaches the `import
  wordmarkSrc from "..."` statement if the module that contains it is
  never itself included. No separate "asset approval gate" in the build
  config is needed; the route exclusion is the gate.
- **How concept reference images remain development-only:** the concept
  PNGs under `docs/design-reference/meld-masters/` are never imported by
  any component — the dev-only overlay tool
  (`ConceptOverlay.tsx`/`devConceptArtPlugin` in `vite.config.ts`) serves
  them via a `configureServer`-only Vite middleware hook, which Vite
  never invokes during `vite build`. This is unchanged by any future art
  integration work.
- **How nine-slice scaling is implemented:** CSS `border-image-source` /
  `border-image-slice` / `border-image-width`, using each asset's
  `nineSliceInsets` from `artRequirements.ts` directly as the
  `border-image-slice` values (source-pixel insets, matching
  `border-image-slice`'s own unit convention when `sourceDimensions`
  informs the accompanying `background-size` if a background-image
  fallback layer is also used underneath for older-engine safety — a
  decision made per-asset at integration time, not prescribed further
  here).
- **How file size is tested:** manual review against each asset's
  `maxBytes` (visible in `artRequirements.ts` and the asset lab) before
  committing; no automated CI budget check exists yet — a reasonable
  future addition, out of scope here.
- **How broken assets fall back:** an asset that fails to load at
  runtime (a bad file, a typo'd path) is, by construction, never possible
  post-integration — Vite's static `import` resolves at build time, so a
  missing/misnamed file is a **build failure**, not a silent runtime
  gap. This is stricter (and safer) than a runtime `<img onerror>`
  fallback would be.
- **How each integration batch is visually reviewed and approved:** see
  `docs/meld-masters-tabletop-art-integration-plan.md` — every batch ends
  with regenerated screenshots/comparisons/overlays (and, for the board
  batch, silhouettes) and an explicit stop for user approval before the
  next batch begins.

## What this checkpoint explicitly did NOT do

No asset was integrated. No consumer component (`ConceptBoard.tsx`,
`ConceptRack.tsx`, `ConceptActionBar.tsx`, `ConceptCompetitorRail.tsx`,
`ConceptSidebar.tsx`, `ConceptBrandMark.tsx`) was modified this
checkpoint. Every one of them renders its existing, unchanged CSS-only
treatment today, exactly as in the v2 prototype.
