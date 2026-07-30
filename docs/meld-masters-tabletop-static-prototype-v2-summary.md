# Meld Masters — Static tabletop concept prototype, v2 refinement

A second visual-fidelity pass on the existing static prototype, addressing
the user's binding feedback that the first pass was "better and
structurally useful" but "not close enough to the concept art" and not
approved.

## 1. Starting branch and commit

`prototype/tabletop-concept-fidelity`, continuing from commit `4dbe699`
(unchanged `main` at `42a4851`; `feature/tabletop-visual-fidelity` not
touched).

## 2. User feedback being addressed

All of it, treated as binding, not reinterpreted:

- **Desktop:** too much exposed grid/unused space; masthead/wordmark too
  small; board too flat/rectangular (concept has a tapered arcade-cabinet
  shape); portrait cards need more weight; rack too thin and
  disconnected; actions too small/flat; sidebar too sparse; 4th
  competitor must fit in-viewport; the complete cabinet must fit the
  target viewport.
- **Phone portrait:** masthead/player area too tall; not enough of the
  full composition visible in one 390×844 view; board/rack/panels/
  actions must all fit; must read as a purpose-built mobile game, not a
  scrolling page; silhouette differed substantially from concept 04.
- **Phone landscape:** the existing landscape wasn't a real landscape
  composition (mostly masthead/cards, board/controls below the fold); a
  dedicated 844×390 arrangement is required.

## 3. Artboard/layout architecture

Replaced the single responsive document flow with three **fixed-pixel
design canvases**, each uniformly scaled to fit the real viewport (never
stretched, centered, letterboxing only if the viewport's aspect ratio
doesn't exactly match):

- `ScaledArtboard.tsx` — a `ResizeObserver`-driven wrapper: renders
  children in a fixed `width`×`height` box, computes `scale =
  min(availableWidth/width, availableHeight/height)`, applies
  `transform: scale(...)`. This is what guarantees **zero scrolling** at
  every target — content can never be taller than its authored canvas,
  and the canvas itself always fits the viewport.
- `useLayoutTarget.ts` — picks `desktop` / `phone-portrait` /
  `phone-landscape` from the real `window.innerWidth`/`innerHeight` (width
  ≥ 1000 → desktop; otherwise width > height → landscape; else portrait),
  recomputed on resize.
- Three dedicated layout components, each authored at its own exact
  canvas size and measured against the concept art's own region
  proportions (not vw/rem-relative guesses): `ConceptDesktopLayout`
  (1440×900), `ConceptPhonePortraitLayout` (390×844),
  `ConceptPhoneLandscapeLayout` (844×390).
- Shared primitives reused by all three: `mockData.ts`, `ConceptTile`,
  `ConceptCompetitorRail`/`ConceptCompetitorCard`, `ConceptBoard`,
  `ConceptRack`, `ConceptActionBar`, `ConceptBrandMark`, `ConceptPlaque`.
  Each layout composes and sizes these independently via its own CSS
  section (`.concept-desktop .concept-board { ... }` etc.) rather than
  one shared responsive ruleset.

## 4. Desktop changes

- Masthead grew from a loose ~140px band to a tight 155px band with a
  68px wordmark (up from 44–68px clamp()), monogram tucked directly above
  it, tagline pulled in tight, a small triangular pointer accent
  underneath anchoring it to the board below.
- Board: `clip-path: polygon(6% 0%, 94% 0%, 100% 100%, 0% 100%)` — a real
  tapered trapezoid (narrower top/far edge, full-width bottom/near edge),
  inner meld grid stays an undistorted rectangle so tile text is never
  skewed. Height increased to a fixed 470px.
- Rack: rebuilt as a thick (140px), directly-attached extension of the
  board — `margin-top: -2px`, shared side/bottom border, a 5px ivory top
  border reading as one continuous cabinet edge with the board above it.
  Tiles enlarged (46×60px, up from 40×52px).
- Competitor rail: cards now `flex: 1` (fill the exact available column
  height, no leftover slack), portraits 86×86 with a 3px currentColor
  border, active card gets a stronger glow ring. All 4 fit with zero
  clipping.
- Sidebar: rebuilt from 3 separately-gapped panels into **one continuous
  framed rail** (`.concept-panel .concept-sidebar`) divided by hairlines
  (`.concept-sidebar-section + .concept-sidebar-section { border-top }`),
  filling the full row height with no unused space. Added a segmented
  countdown progress-bar glyph beneath the digits.
- Actions: 3.8rem-tall buttons (up from ~3.25rem-equivalent), 3px borders,
  a 4px drop-shadow bevel, and **original inline SVG icons** (see §13)
  replacing the emoji placeholders.

## 5. Phone-portrait changes

Restructured entirely around concept-04's actual composition:

- Masthead is brand-only (no plaques) — ~100px, tight vertical rhythm.
- **New integrated player/status row** (132px): left competitor card |
  center round/target/table status plaque | right competitor card, in
  one CSS grid row — replacing the earlier version's separate, taller
  "cards then a status strip" stack that was the single biggest
  contributor to the old layout not fitting.
- Board (280px), rack (84px, same attached treatment as desktop), a new
  2-column move-log + tip support row (68px), a 2×2 action grid (124px),
  and a compact league/season footer strip (22px) — every region from
  the brief's required list is present and visible with zero scrolling.

## 6. Phone-landscape changes

A genuinely dedicated composition, not the portrait canvas reflowed:

- Compact single-row masthead strip (46px) with plaques restored
  alongside the brand mark (landscape has the horizontal room desktop
  has; portrait doesn't).
- Left rail: 4 **horizontal** competitor cards (portrait beside name/
  score, via a `ConceptCompetitorCard` + `.concept-competitor-text`
  override to `display: flex; flex-direction: column` instead of the
  vertical layout's `display: contents`) instead of the vertical stack.
- Center: board (tapered, 3-column meld grid to suit the wide/short
  aspect) directly over the attached rack.
- Right rail: a narrow sidebar carrying turn/countdown, a trimmed 3-entry
  move log, **and the action grid** (2×2) — there's no vertical room left
  for a separate how-to-play panel at 390px total height, so actions took
  that slot instead, as the higher-priority region.
- Every required region (board, rack, player cards, turn status, actions)
  is visible with zero scrolling.

## 7. Masthead changes

See §4/§5/§6 above. Summary: live-text wordmark (Silkscreen, gradient,
no new artwork) at 68px (desktop) / 40px (portrait) / 22px (landscape),
each tuned to its own canvas rather than one `clamp()` trying to serve
all three.

## 8. Board-shape changes

`clip-path: polygon(6% 0%, 94% 0%, 100% 100%, 0% 100%)` on all three
layouts' `.concept-board` (percentages of the board's own box, so the
absolute taper scales with each canvas). This is the single change the
silhouette comparisons show most clearly closing the gap with the
concept — see §19.

## 9. Competitor-rail changes

See §4 (desktop: fill-height cards, no wasted padding) and §6 (landscape:
new horizontal card orientation). Phone portrait uses the same vertical
`ConceptCompetitorCard` as desktop, just 2 of the 4 mock competitors
(self + one opponent), integrated into the player/status row rather than
a separate rail.

## 10. Rack changes

Thicker on every layout, tiles enlarged, directly attached to the board
via a shared border edge and negative margin (no visible gap/seam) on
all three layouts — see §4.

## 11. Sidebar changes

Desktop/landscape: one continuous framed rail with hairline-divided
sections instead of 3 gapped panels (§4/§6). A countdown progress-bar
glyph was added under the digits (desktop; omitted on landscape/portrait
for space). Phone portrait uses a 2-column move-log/tip row instead of a
vertical sidebar (no room for a tall sidebar in portrait).

## 12. Action-control changes

Bigger on every layout (§4/§5/§6), custom SVG icons on all three (icons
scale down to 12–16px on the smaller canvases while staying legible at
their target size, since each canvas is authored/tuned independently).

## 13. Icon treatment

`ConceptIcons.tsx` — 4 small, original, stroke/fill-based SVGs
(`currentColor`, so they inherit each button's accent color): `DrawIcon`
(two stacked cards), `PassIcon` (a raised, stylized palm), `SortIcon`
(three ascending bars), `CommitIcon` (a checkmark in a ring). Deliberately
generic/abstract strategy-game glyphs — not a likeness of any existing
game's iconography, and not Unicode/emoji.

## 14. Desktop region measurements (approximate, from the overlay)

| Region | Measured position/size | Concept-01 target |
|---|---|---|
| Masthead | top 155px / 900px ≈ 17% | 14–17% |
| Rail | left 250px / 1440px ≈ 17% | 17–20% |
| Board+rack | center ≈ 866px / 1440px ≈ 60% | 55–60% |
| Sidebar | right 290px / 1440px ≈ 20% | 18–22% |
| Actions | bottom ≈ 110px of the remaining row ≈ 12% | 10–13% |

All within the brief's target ranges. `overlay--desktop-1440x900.png`
confirms region *positions* (not just sizes) land close to the concept's
own — masthead, rail cards, board melds, rack, and sidebar panels overlap
closely rather than merely occupying similar-sized boxes elsewhere on the
page.

## 15. Phone region measurements (approximate)

| Region | Height budget used | Brief's target |
|---|---|---|
| Masthead | 100px / 844px ≈ 12% | 13–16% |
| Player/status row | 132px / 844px ≈ 16% | 16–19% |
| Board | 280px / 844px ≈ 33% | 32–37% |
| Rack | 84px / 844px ≈ 10% | 10–12% |
| Support row | 68px / 844px ≈ 8% | 9–11% |
| Actions | 124px / 844px ≈ 15% | 15–18% |
| Footer | 22px / 844px ≈ 3% | 3–5% |

All within or within ~1–2 points of the brief's target bands; total sums
to exactly 844px (plus small inter-region gaps), confirmed by the fixed-
canvas architecture rather than measured after the fact.

## 16. Scrolling result for all targets

**Zero scrolling at every target.** This is structural, not incidental:
each canvas is a fixed-pixel box (1440×900 / 390×844 / 844×390) and
`ScaledArtboard` scales it to fit the viewport — content cannot exceed
its authored canvas height, so there is nothing to scroll to.

## 17. Fourth-competitor visibility

Fully visible at both 1440×900 and 1280×720 with no clipping (verified in
`prototype--desktop-1440x900.png` / `prototype--desktop-1280x720.png` —
the v1 version's partial clip at the bottom of the T-Bone card, caused by
a loose rail height budget, doesn't reproduce here because the rail's 4
`flex: 1` cards now exactly fill the fixed 745px column height by
construction).

## 18. Overlay findings

`overlay--desktop-1440x900.png`, `overlay--phone-390x844.png`, and the
new `overlay--phone-landscape-844x390.png` (concept art at 50% opacity
over the live prototype) show masthead, competitor cards, board melds,
rack, and sidebar/action regions landing close to the concept's own
positions on all three targets — a marked improvement over the v1
overlay, where the board and sidebar in particular sat further from the
concept's actual bounds.

## 19. Silhouette findings

`silhouette--desktop-1440x900.png`, `silhouette--phone-390x844.png`,
`silhouette--phone-landscape-844x390.png` (blurred + desaturated, both
sides) now show matching massing on every target:

- Top masthead mass: present and similarly positioned on both sides.
- Character-card mass: left column on both (desktop/landscape) or top row
  (portrait).
- **Board mass: now visibly tapered on both sides** — the single biggest
  silhouette gap from v1 is closed.
- Rack/bottom-control mass: present at a similar vertical position and
  density on both sides.
- Sidebar/support mass: present and similarly dense on both sides (no
  longer a comparatively empty block on the prototype side).

## 20. Remaining visible differences

Reported honestly, not rationalized away:

- The wordmark's live-text gradient is a close but not pixel-identical
  match to the concept's painted/beveled logo treatment (no new artwork
  generated, per the brief).
- The board's taper is a flat `clip-path` cut, not the concept's subtler
  curved/beveled perspective edge.
- Action-bar icons are simple original geometric SVGs, not a match to any
  specific concept iconography (none was specified/approved for this).
- Countdown progress-bar glyph exists on desktop only (no room for it on
  the two phone canvases without displacing a higher-priority region).
- Phone landscape's right rail omits a dedicated how-to-play panel
  (actions occupy that slot instead — a deliberate priority call given
  the 390px height budget, not an oversight).
- Rail-card portrait crop/proportions are close but not pixel-identical
  to the concept's own card crop.

## 21. Screenshot inventory

`docs/design-reference/tabletop-static-prototype-review-v2/` (the v1
directory, `tabletop-static-prototype-review/`, is untouched):

- `prototype--desktop-1440x900.png`, `prototype--desktop-1280x720.png`,
  `prototype--phone-390x844.png`, `prototype--phone-landscape-844x390.png`
- `comparison--desktop-1440x900.png`, `comparison--desktop-1280x720.png`,
  `comparison--phone-390x844.png`,
  `comparison--phone-landscape-844x390.png`
- `overlay--desktop-1440x900.png`, `overlay--phone-390x844.png`,
  `overlay--phone-landscape-844x390.png` (landscape overlay is new in v2)
- `silhouette--desktop-1440x900.png`, `silhouette--phone-390x844.png`,
  `silhouette--phone-landscape-844x390.png` (landscape silhouette is new
  in v2)

Produced by `e2e/scripts/capture-tabletop-static-prototype-v2.ts` (also
the required Chromium + Mobile Chrome route-load checks) and
`e2e/scripts/build-tabletop-prototype-comparisons-v2.ts`.

## 22. Confirmation no live-game integration occurred

No `useGame`/`useDraftState`/socket/room/recovery hook is imported
anywhere under `prototypes/tabletop-concept/`. The route still renders
outside `AuthProvider`/`AnnouncerProvider`/`RootLayout` (unchanged from
v1). Action controls remain inert `<div>`s. All data is still the
hardcoded content in `mockData.ts` (unchanged this pass).

## 23. Confirmation production tabletop was untouched

`apps/web/src/pages/TabletopPage.tsx`, `apps/web/src/tabletop/*`, and the
real `.tabletop-*` rules in `apps/web/src/styles/global.css` are
untouched. `apps/web/test/setup.ts` gained a `ResizeObserver` stub (jsdom
doesn't implement the browser API `ScaledArtboard.tsx` uses) — a test-
environment-only change, not application code.

## 24. Confirmation no other screen changed

Home, Public Lobby, Create Room, Join Room, Waiting Room, and Recovery
are unchanged. `App.tsx`'s routing (from the v1 pass) is untouched this
pass.

## 25. Confirmation branch was not merged

Work stayed on `prototype/tabletop-concept-fidelity` throughout; `main`
was not checked out or modified.

## 26. Confirmation nothing was deployed

No deploy was performed or requested. Only local, disposable Vite dev-
server instances were run, to produce the screenshots above.

---

## Testing

| Command | Result |
|---|---|
| `pnpm run format` | pass |
| `npx eslint apps/web` (+ the 2 new e2e scripts) | pass |
| `pnpm --filter @tile-meld/web run typecheck` | pass |
| `cd apps/web && npx vitest run` (full suite) | pass — 213 tests / 26 files, zero unhandled errors (the `ResizeObserver` stub in `test/setup.ts` fixed a previously-uncaught-but-passing exception) |
| `pnpm --filter @tile-meld/web run build` | pass |
| `dist/` grep for prototype-only strings post-build | zero matches -- no separate chunk emitted |
| Chromium route-load check (capture script) | pass — masthead/board/rack/actions visible, zero console errors |
| Mobile Chrome (Pixel 7 emulation) route-load check | pass — same assertions |

No full e2e suite run, no WebKit run, per the brief.
