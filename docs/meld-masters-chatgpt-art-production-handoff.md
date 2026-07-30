# Meld Masters — Tabletop art-production handoff for ChatGPT

This is a requirements document, not artwork. It determines exactly what
illustrated production assets the static tabletop concept prototype
(`apps/web/src/prototypes/tabletop-concept/`) needs to convincingly match
`meld-masters-concept-01.png` (desktop) and `meld-masters-concept-04.png`
(phone), and specifies each one precisely enough that ChatGPT can produce
it without making any layout, dimension, or naming decisions itself. No
artwork was created this checkpoint. See
`docs/meld-masters-tabletop-art-integration-plan.md` for what happens
after assets are approved.

The single source of truth for every number below is
`apps/web/src/prototypes/tabletop-concept/artRequirements.ts` — if this
document and that file ever disagree, the `.ts` file wins (it's what the
dev-only asset preview lab at `/prototype/tabletop-assets` actually reads).

## How the audit was done

For every visual region, ten questions were asked (see the project brief);
in short: *what exists → why does it still look different → can CSS and
already-approved assets close the gap → if not, what exact asset is
needed → how will Claude place/stretch/layer it → what must stay
transparent/live/interactive → does it need per-layout variants.*

The answer was **"CSS is already close enough"** for most simple bordered
panels (masthead plaques, sidebar sections, competitor card frames) — the
v2 prototype's `.concept-panel` notched-corner treatment, verified against
the concept via the overlay tool, already lands within a few percent of
the concept's own panel positions and general shape. Those are listed
below as **optional polish**, not blockers.

The answer was **"new art is required"** in exactly four places, where
flat CSS structurally cannot reproduce what the concept shows:

1. **The wordmark** — a fully painted, per-letter-beveled illustration
   (highlight/shadow gradients unique to each glyph, a drop shadow, and a
   background wing/speed-line motif) that a CSS `background-clip: text`
   gradient cannot replicate.
2. **The board frame** — the concept's tapered cabinet silhouette has a
   layered glass/bevel/glow richness (a highlighted inner edge line
   distinct from the outer glow, a soft diagonal light sweep across the
   surface) well beyond what a `clip-path` + `box-shadow` can achieve,
   and the taper itself doesn't have a nine-slice-safe straight-edge
   shape (see the board section below).
3. **The rack frame** — the concept's "thick shelf" divider bar reads as
   a physical, beveled object; the current 5px CSS border-top is a flat
   approximation.
4. **The action-button plates** — the concept's buttons have a real 3D
   cabinet-button bevel (raised highlight top edge, recessed shadow
   bottom edge); the current CSS box-shadow bevel is a reasonable but
   visibly flatter stand-in.

Everything else audited below either stays CSS-only, reuses an
already-approved asset (portraits, monogram), or is optional polish.

## Required assets

### 1. `wordmark-illustrated` — `wordmark-meld-masters.png`

- **Group / priority:** masthead / **required**
- **Layouts:** shared (desktop, phone-portrait, phone-landscape)
- **Visual purpose:** the large illustrated "MELD MASTERS" lockup —
  beveled cyan→white lettering on "MELD", gold→orange on "MASTERS", dark
  outline, drop shadow, background wing/speed-line accents.
- **Concept reference:** `meld-masters-concept-01.png` top-center (also
  present, smaller, in `meld-masters-concept-04.png`); style/palette
  cross-check against `meld-masters-concept-logo.png`'s crown-and-MM
  mark (do not reuse that mark itself — it's the app icon, not the
  wordmark).
- **Current deficiency:** `ConceptBrandMark.tsx` renders a live `<h1>`
  with a CSS linear-gradient `background-clip: text` — flat, no bevel,
  no per-letter highlight, no background wing motif.
- **Recommended source dimensions:** 2400×900px (master, high-res for
  clean downscaling to every use size).
- **Intended rendered size:** ≈980×118px (desktop), ≈300×70px (phone
  portrait), ≈260×46px (phone landscape).
- **Aspect ratio:** ≈2.67:1, fixed.
- **Format:** PNG. **Transparency:** required (transparent background,
  opaque/semi-opaque lettering only).
- **Empty/stretchable center:** none — this is a fixed illustration, not
  a frame. **Strategy: fixed-size transparent PNG**, one master, rendered
  via CSS `object-fit: contain` at each layout's box size (a logotype
  scales down cleanly; unlike a stretched frame, no distortion risk, so
  no per-layout variant is needed).
- **Safe content area:** the full canvas is the safe area — this asset
  IS the content, not a frame around other content.
- **Nine-slice/border-image insets:** not applicable (fixed strategy).
- **Required visual details:** "MELD" in the cyan/white/blue family,
  "MASTERS" in gold/orange, a dark (navy/black) outer stroke on every
  letter, a lighter inner bevel highlight along each letter's top edge, a
  soft drop shadow beneath the whole lockup, subtle diagonal light-wing
  strokes behind/through the text (as in concept-01). No "™" mark
  required (the real product doesn't carry one).
- **Layering order:** sits behind nothing, above the masthead's page
  background; live content never overlaps it.
- **Responsive behavior:** `object-fit: contain`, scales uniformly, never
  cropped, never stretched non-uniformly.
- **Live text:** the accessible name stays live (an `aria-label="Meld
  Masters"` or equivalent on the `<img>`/wrapper) — the wordmark image
  itself is `alt=""`, decorative from an AT perspective since the
  product name is announced elsewhere in the page (see the integration
  contract).
- **Portraits/tiles/controls:** none involved.
- **Decorative/accessibility treatment:** `alt=""`, `aria-hidden="true"`
  on the `<img>`; the real accessible name comes from a sibling live
  text element (same pattern the real app's header already uses for its
  monogram — see `RootLayout.tsx`).
- **Max file size:** 400 KB.
- **Consumer:** `ConceptBrandMark.tsx`.
- **Consumer selector:** replaces the `<h1 className="concept-wordmark">`
  element; new `<img className="concept-wordmark-art">`.
- **Target directory:** `apps/web/src/assets/tabletop-production/masthead/`.
- **Acceptance criteria:** legible at all three rendered sizes down to
  46px tall without the lettering turning to mush; transparent background
  confirmed (no white/black box around it); palette matches concept-01's
  cyan→white→gold→orange progression; no baked-in tagline, season, or
  round text.
- **Rejection criteria:** any baked-in "STRATEGY. COMBINE. CONQUER."
  tagline, any baked-in round/score/season text, opaque background,
  visible compression artifacts at the 46px landscape size, a font style
  that doesn't match the concept's chunky beveled block-letter style.
- **Must not improvise:** letter spacing/kerning beyond what's shown in
  concept-01; a different color assignment between "MELD" and "MASTERS."
- **Must not be baked in:** tagline text, season/round/target/table
  values, the "™" symbol.

### 2–4. Board frame family — `board-frame-{desktop,phone-portrait,phone-landscape}.png`

Treated as one family; each entry below is one file.

- **Group / priority:** board / **required**
- **Visual purpose:** the tapered arcade-cabinet playfield silhouette —
  narrower top ("far") edge, full-width bottom ("near") edge, glass-panel
  bevel with a bright inner highlight line distinct from the outer cyan
  glow, subtle diagonal light sweep across the surface, integrated
  "ON THE TABLE" title-bracket motif at the top, a thin divider above the
  tiles-left/possible-melds readout at the bottom.
- **Concept reference:** `meld-masters-concept-01.png` center (desktop);
  `meld-masters-concept-04.png` center (phone — same silhouette language,
  shorter proportions).
- **Current deficiency:** `.concept-board`'s CSS `clip-path: polygon(6%
  0%, 94% 0%, 100% 100%, 0% 100%)` gets the taper *silhouette* right but
  is a flat single-color fill with a uniform 2px border — no glass bevel,
  no highlight line, no title-bracket motif, no corner ornamentation.
- **Per-variant specs:**

  | Variant | ID | Layout | Source dims | Rendered size | Aspect |
  |---|---|---|---|---|---|
  | Desktop | `board-frame-desktop` | desktop | 1728×940 | 864×470 | 1.84:1 |
  | Phone portrait | `board-frame-phone-portrait` | phone-portrait | 748×560 | 374×280 | 1.34:1 |
  | Phone landscape | `board-frame-phone-landscape` | phone-landscape | 1068×546 | 534×273 | 1.96:1 |

  Source dimensions are 2× the rendered size (retina headroom). **Each
  variant is a dedicated illustration, not the desktop asset scaled** —
  the three aspect ratios differ enough (1.34:1 to 1.96:1) that stretching
  one master would visibly flatten or exaggerate the taper angle on at
  least two of the three targets.
- **Format:** PNG. **Transparency:** required (only the felt/interior and
  a soft ambient glow may be semi-opaque; everything outside the
  cabinet's outer silhouette is fully transparent).
- **Strategy: layered, fixed-size, non-uniform-stretch-tolerant flexible
  PNG.** Not nine-slice — nine-slice assumes straight, non-stretching
  corners and straight-stretching edges; this shape's left/right edges
  are diagonal for their entire length, which nine-slice can't represent.
  Applied via CSS `background-image` + `background-size: 100% 100%` on
  the fixed-pixel `.concept-board` box (the ScaledArtboard architecture
  guarantees that box is a known, fixed size per layout, so the
  non-uniform stretch this technique implies is a near-zero-distortion
  no-op in practice — the asset is authored at exactly the box's
  aspect ratio).
- **Safe content area (where live tiles/text render, must stay clear of
  dense decoration):** desktop 130,90 → 1468×780 (of the 1728×940
  source); phone-portrait 50,50 → 648×460 (of 748×560); phone-landscape
  70,50 → 928×446 (of 1068×546). Decoration may extend into this area
  only as a very subtle background wash — never anything that would
  reduce tile-number contrast.
- **Required visual details:** tapered outer silhouette matching the
  live `clip-path` angle (top edge inset ~6% of the box width on each
  side); a bright cyan inner highlight line just inside the outer glow;
  a soft radial highlight near the top-center suggesting an overhead
  light; an integrated bracket/chevron motif flanking where the live "ON
  THE TABLE" title text will render (leave that exact spot visually
  quieter, not textured, so the live text stays legible); a thin
  horizontal divider line near the bottom, above where the live
  "Tiles left" / "Possible melds" text will render.
- **Layering order:** bottom-most layer of `.concept-board`, behind the
  live title/meld-grid/stats content, above the page's own background.
- **Responsive behavior:** `background-size: 100% 100%` fills the exact
  fixed box; no repeat, no additional scaling.
- **Live text:** "ON THE TABLE" title, every meld's live tiles, "Tiles
  left"/"Possible melds" values — none of this may be baked into the
  image. Tile numbers must render perfectly undistorted (they're real
  DOM text on top of this background, not warped with it).
- **Portraits:** none involved. **Tiles:** must remain fully live DOM
  content, unaffected by this asset.
- **Decorative/accessibility treatment:** CSS `background-image`, which
  is inherently `pointer-events`-inert and invisible to the accessibility
  tree — no extra ARIA needed.
- **Max file size:** 500 KB (desktop), 350 KB (each phone variant).
- **Consumer:** `ConceptBoard.tsx`. **Consumer selector:** `.concept-board`
  background (desktop CSS already scoped under `.concept-desktop
  .concept-board`, etc. — the asset swap is a `background-image` add to
  each of those three existing rules).
- **Target directory:** `apps/web/src/assets/tabletop-production/board/`.
- **Acceptance criteria:** taper angle visually matches the live
  `clip-path` (compare against `silhouette--*.png` in the v2 review
  directory); safe content area stays legible when real meld tiles are
  laid over it; transparent outside the cabinet silhouette confirmed at
  each corner.
- **Rejection criteria:** any baked-in tile, meld group, caption, count,
  or game-state text; an opaque/rectangular background; a taper angle
  that doesn't match the CSS silhouette closely enough to look like a
  seam; a texture busy enough to reduce tile-number contrast in the safe
  area.
- **Must not improvise:** the taper angle (must track the existing CSS
  clip-path, not a freely-chosen new angle); a corner radius style that
  contradicts the sharp-cut concept aesthetic.
- **Must not be baked in:** tiles, melds, "ON THE TABLE" text, tiles-left/
  possible-melds values.

### 5. `rack-frame` — `rack-frame.png`

- **Group / priority:** rack / **required**
- **Layouts:** shared (desktop, phone-portrait, phone-landscape)
- **Visual purpose:** the rack tray shell — a thick beveled ivory/tan
  divider bar welding it to the board above, side rails, a beveled
  bottom edge, an integrated space for the live "Your Rack" title.
- **Concept reference:** `meld-masters-concept-01.png` "YOUR RACK" band
  directly under the board; same treatment, shorter, in concept-04.
- **Current deficiency:** `.concept-rack` uses a flat 5px
  `border-top: solid var(--tile-ivory-edge)` plus a plain 2px side/bottom
  border — no bevel, no physical "shelf" read.
- **Recommended source dimensions:** 480×96px (nine-slice master;
  proportioned so its widest use, desktop's 864×140, only stretches the
  flexible middle band, never the caps).
- **Intended rendered size:** 864×140 (desktop), 374×84 (phone portrait),
  534×56 (phone landscape).
- **Aspect ratio:** not fixed — this is why nine-slice, not a fixed
  image, is the right strategy.
- **Format:** PNG. **Transparency:** required (transparent outside the
  tray's own rounded-rect footprint; the tray interior itself is opaque/
  near-opaque, matching the concept's solid tray read).
- **Strategy: nine-slice PNG.** A plain rectangle (no taper), so
  nine-slice is the correct, simplest technique — safely handles the
  ~2.5× width range and ~2.5× height range across the three layouts.
- **Nine-slice insets (of the 480×96 source):** top 28px (the thick
  divider bar — non-stretching, contains the bevel highlight), right
  24px, bottom 14px, left 24px. Center region stretches both directions.
- **Safe content area:** x40,y30 → 400×50 (of 480×96) — where the live
  "Your Rack (N)" title and rack tiles render; keep this region visually
  quiet (a subtle flat tone, not a busy pattern).
- **Required visual details:** the top 28px band must read as a
  physically thicker, beveled divider (lighter highlight along its very
  top edge, subtle shadow just below it) distinct from the side/bottom
  edges, which are thinner and plainer.
- **Layering order:** behind the live "Your Rack" title and every rack
  tile.
- **Responsive behavior:** nine-slice — corners fixed, edges stretch
  along one axis, center stretches both axes.
- **Live text/tiles:** "Your Rack (N)" title and every rack tile stay
  live DOM content, unaffected.
- **Decorative/accessibility treatment:** CSS background, inert to
  pointer events and the accessibility tree.
- **Max file size:** 150 KB.
- **Consumer:** `ConceptRack.tsx`. **Consumer selector:** `.concept-rack`
  background (all three layouts' existing `.concept-rack` rules gain a
  `background-image` + `border-image-slice`/CSS nine-slice technique —
  see the integration contract for the exact CSS approach Claude will
  use once the asset exists).
- **Target directory:** `apps/web/src/assets/tabletop-production/rack/`.
- **Acceptance criteria:** reads as visually attached to the board (no
  gap/seam) once composited; nine-slice stretches cleanly at all three
  target sizes without visible corner distortion.
- **Rejection criteria:** any baked-in tile or "Your Rack (N)" text with
  a specific count; a design that only looks right at one specific
  aspect ratio (defeats the point of nine-slice).
- **Must not improvise:** a decorative motif that visually competes with
  the board frame's own bracket details.
- **Must not be baked in:** rack tiles, the "(N)" tile count, sort-mode
  state.

### 6–8. Action-button plate family — `action-plate-{cyan,purple,gold}.png`

- **Group / priority:** action / **required**
- **Layouts:** shared (desktop, phone-portrait, phone-landscape)
- **Visual purpose:** the chunky 3D cabinet-button plate behind Draw/Sort
  (cyan), Pass (purple), and Commit Turn (filled gold, the strongest
  action) — a raised highlight top edge, a recessed shadow bottom edge,
  rounded corners.
- **Concept reference:** `meld-masters-concept-01.png` bottom action row.
- **Current deficiency:** `.concept-action-button` uses a CSS
  `box-shadow` bevel (`0 4px 0 rgba(0,0,0,0.4)`) — a reasonable but
  visibly flatter approximation of the concept's richer highlight/shadow
  gradient.
- **Recommended source dimensions:** 480×220px per color (nine-slice
  master; 2× the largest rendered use, desktop's 206×85, minus rounding).
- **Intended rendered size:** 206×85 (desktop), 175×55 (phone portrait
  2×2 grid), 78×44 (phone landscape compact grid).
- **Aspect ratio:** not fixed — nine-slice, same reasoning as the rack.
- **Format:** PNG. **Transparency:** required outside the plate's own
  rounded-rect footprint.
- **Strategy: nine-slice PNG, one file per color** (cyan, purple, gold —
  not one file per button; Draw and Sort share the cyan plate).
- **Nine-slice insets (of the 480×220 source):** 32px on all four sides
  (rounded-corner radius plus bevel-highlight band). Center stretches
  both directions — safe for a smooth gradient fill.
- **Safe content area:** x60,y40 → 360×140 (of 480×220) — where the live
  icon + label + sublabel render.
- **Required visual details:** a bright highlight strip along the top
  ~15% of the plate, a darker shadow strip along the bottom ~15%, a
  rounded-rect corner radius matching the concept's chunky button style;
  the gold variant must read as visibly heavier/brighter than cyan/purple
  (it's the strongest action).
- **Layering order:** behind the live icon/label/sublabel and behind the
  real `<button>` element's own focus outline (see the integration
  contract for how focus stays visible above a background image).
- **Responsive behavior:** nine-slice at every button size across all
  three layouts.
- **Live text:** label ("Draw"/"Pass"/"Sort"/"Commit Turn") and sublabel
  ("Draw a tile", etc.) stay live HTML — never baked in.
- **Icons:** `ConceptIcons.tsx`'s existing original inline SVGs
  (`DrawIcon`/`PassIcon`/`SortIcon`/`CommitIcon`) render on top, unaffected
  by this asset. See the optional `action-icons-illustrated` entry below
  if a richer illustrated icon style is wanted later.
- **Controls:** the final integration must use real `<button>` (or
  equivalent native, focusable) elements with this asset only as a CSS
  background — never an `<img>` standing in for the interactive element.
- **Decorative/accessibility treatment:** CSS background only; the
  `<button>`'s own accessible name (from its live label text) is
  unaffected.
- **Max file size:** 70 KB each.
- **Consumer:** `ConceptActionBar.tsx`. **Consumer selector:**
  `.concept-action-button--cyan` / `--purple` / `--gold`.
- **Target directory:** `apps/web/src/assets/tabletop-production/actions/`.
- **Acceptance criteria:** visibly more three-dimensional than the
  current CSS bevel at every target size; gold plate reads as strongest
  at a glance; nine-slice stretches cleanly with no corner smearing.
- **Rejection criteria:** any baked-in label text or icon; a flat
  (non-beveled) fill that doesn't improve on the current CSS; a shape
  that doesn't support a visible focus outline sitting above it.
- **Must not improvise:** icon artwork (icons are a separate, optional
  asset — see below); label copy or button count (exactly 4: Draw, Pass,
  Sort, Commit Turn).
- **Must not be baked in:** button labels, sublabels, icons, disabled/
  hover state (see the optional `action-plate-states` entry).

---

## Optional polish assets

These improve finish but are not required for first visual approval —
current CSS is already a reasonably close match for all of them. Full
field-by-field specs live in `artRequirements.ts`; summarized here:

| ID | Filename | Group | Layouts | Why optional |
|---|---|---|---|---|
| `plaque-frame` | `plaque-frame.png` | masthead | desktop, landscape | Current `.concept-panel` notch treatment already close; upgrades the border to a richer beveled/metallic look. |
| `board-texture` | `board-surface-texture.png` | board | all | CSS repeating-gradient grid is a reasonably close felt/circuit stand-in already. |
| `competitor-card-frame` | `competitor-card-frame.png` | competitor | all | Current bordered-notch card is already close; this is a richer frame, colorized via CSS (one neutral asset, not 5 per-color files). |
| `competitor-active-overlay` | `competitor-active-overlay.png` | competitor | all | Current CSS glow ring is functionally adequate; text/icon state is the real accessibility signal either way. |
| `sidebar-panel-frame` | `sidebar-panel-frame.png` | sidebar | all | Current CSS panel is already close. |
| `countdown-screen-bezel` | `countdown-screen-bezel.png` | sidebar | desktop, landscape | Small polish detail; the segmented progress bar under it stays CSS. |
| `mascot-tip-icon` | `mascot-tip-icon.png` | sidebar | desktop | No approved mascot asset exists anywhere in the repo; lowest priority — the tip reads fine as text-only. |
| `action-plate-states` | `action-plate-states.png` | action | all | One shared overlay for hover/pressed/disabled, composited via CSS blend/opacity — not a required blocker; CSS opacity changes are an acceptable first pass. |
| `action-icons-illustrated` | `action-icons-illustrated.svg` | action | all | `ConceptIcons.tsx` already ships adequate original SVG icons; only pursue for a closer stylistic match to the concept's specific icon motifs. |
| `footer-chrome-icons` | `footer-chrome-icons.svg` | chrome | phone-portrait | Tiny decorative corner glyphs; simple enough to do as inline SVG without a ChatGPT round-trip if ever pursued. |

---

## Prioritized generation sequence

Small, approvable batches — never generate the whole kit at once.

### Batch 1 — Wordmark and masthead

**Generate:** `wordmark-illustrated`. (Masthead plaque frames are
optional — not in this batch.)

**Why first:** the wordmark is the single highest-impact, lowest-
technical-risk asset (one fixed image, no nine-slice math, no
composition-with-live-tiles concern) and anchors the whole page's visual
tone before the harder board/rack work.

**After integration, regenerate:** `prototype--desktop-1440x900.png`,
`prototype--desktop-1280x720.png`, `prototype--phone-390x844.png`,
`prototype--phone-landscape-844x390.png`, and their `comparison--*`/
`overlay--*` pairs.

**User approves before continuing:** does the wordmark read clearly at
all three sizes; does the palette match concept-01 closely enough; is
the transparency clean (no halo/fringe).

### Batch 2 — Board and rack

**Generate:** `board-frame-desktop`, `board-frame-phone-portrait`,
`board-frame-phone-landscape`, `rack-frame`.

**Why next:** the board is the single most visually dominant region on
every layout — closing this gap has the largest silhouette impact of
anything in the kit (confirmed by the v2 silhouette tests, where the
board's shape was already the most-improved region and this closes what
remains). The rack is grouped in because it's physically welded to the
board and should be evaluated together.

**After integration, regenerate:** all four raw screenshots + comparisons
+ overlays + **all three silhouette comparisons** (this is the batch most
likely to change the blurred massing test's result).

**User approves before continuing:** taper angle reads correctly at all
three sizes; live tile text stays fully undistorted and legible over the
new background; rack reads as attached to the board, not floating.

### Batch 3 — Competitor frames

**Generate (if pursued — this batch is entirely optional polish):**
`competitor-card-frame`, `competitor-active-overlay`.

**Why third:** competitor cards are already the closest-matching region
per the v2 overlay test; this batch is refinement, not a fidelity
blocker, so it's fine to skip or defer indefinitely.

**After integration, regenerate:** desktop + phone comparisons/overlays
(competitor rail region only needs checking, not a full silhouette
re-run).

**User approves before continuing:** the neutral frame colorizes
correctly via the existing per-seat CSS accent; active-state glow doesn't
obscure the portrait or text.

### Batch 4 — Sidebar

**Generate (optional polish):** `sidebar-panel-frame`,
`countdown-screen-bezel`, `mascot-tip-icon`.

**Why fourth:** same reasoning as Batch 3 — already a close match,
lowest urgency of the polish batches (mascot icon has no existing asset
to build on and the tip reads fine as text-only today).

**After integration, regenerate:** desktop + phone-landscape comparisons
(sidebar doesn't appear as a distinct rail on phone-portrait).

**User approves before continuing:** move-log and countdown text stay
fully legible over the new frame; mascot (if pursued) doesn't read as
derivative of any existing character IP.

### Batch 5 — Buttons and icons

**Generate:** `action-plate-cyan`, `action-plate-purple`,
`action-plate-gold` (required); `action-plate-states`,
`action-icons-illustrated` (optional, same batch if pursued).

**Why fifth:** buttons benefit from having the board/rack's visual
weight already settled above them, so their own weight can be judged in
context; icons are optional and cheapest to defer since the existing
inline SVGs are already adequate.

**After integration, regenerate:** all four comparisons; specifically
check the action row's visual weight against the rest of the now-more-
detailed cabinet.

**User approves before continuing:** Commit Turn reads as visibly
strongest; native `<button>` focus outlines remain visible over the new
background; nine-slice stretches cleanly at all three layouts'
differing button sizes.

### Batch 6 — Optional chrome

**Generate (only after the primary layout above is approved):**
`footer-chrome-icons`, and any Batch 1–5 optional items deferred earlier.

**Why last:** these are the lowest-impact items in the whole registry —
tiny decorative glyphs, not structural fidelity.

**After integration, regenerate:** phone-portrait comparison only.

**User approves before continuing:** nothing blocks on this batch —
it's the final polish pass.
