# Meld Masters — Static tabletop concept prototype

A from-scratch, disconnected, static visual prototype of the Meld Masters
tabletop concept art. This supersedes the earlier `feature/tabletop-visual-
fidelity` attempt, which restructured the *real* tabletop's layout but was
rejected — it still read as a conventional web app with Meld Masters
styling, not a reproduction of the concept art's actual silhouette (huge
masthead, dense sidebar, dominant board, chunky cabinet controls). This
checkpoint takes the opposite approach: an isolated, dev-only route with
hardcoded mock data, free to diverge completely from the live tabletop's
DOM/CSS, whose only job is visual fidelity.

## 1. Branch and starting commit

`prototype/tabletop-concept-fidelity`, branched from clean `main` at
`42a4851`.

## 2. Rejected prior branch

`feature/tabletop-visual-fidelity` (commit `e1c18d7`). Not continued, not
merged, not referenced by any code in this branch.

## 3. Prototype route

`/prototype/tabletop-concept` — `apps/web/src/prototypes/tabletop-concept/`.

## 4. Confirmation route is development-only

Two independent, redundant guards, both verified concretely (not just
asserted):

- **Runtime guard:** `PROTOTYPE_ROUTE_ENABLED` (`devOnly.ts`, `=
  import.meta.env.DEV`) gates whether `App.tsx` renders the `<Route>` at
  all. Covered by `apps/web/test/prototypeRouteGuard.test.tsx` (mocks the
  flag to `false`, confirms nothing renders and no other route matches the
  path).
- **Build guard:** the dynamic `import()` for the prototype's component
  sits behind a *literal* `import.meta.env.DEV` ternary written directly
  in `App.tsx` (not read indirectly through a re-exported constant),
  which is what lets Vite's dead-code elimination strip the import call
  --- and with it, the whole chunk --- out of `vite build`'s output
  entirely, not merely leave it unreferenced. Verified directly: after a
  clean production build, `apps/web/dist` contains **zero** files named
  `TabletopConceptPrototype-*` and **zero** matches anywhere in `dist/`
  for `T-BONE`, `Arcade League`, `concept-prototype`,
  `TabletopConceptPrototype`, or `ConceptMasthead` (`grep -rl` over the
  whole directory, not just the main JS bundle).

(An earlier version of the App.tsx gating — reading only the re-exported
`PROTOTYPE_ROUTE_ENABLED` constant at the `lazy()` call site — passed
every runtime check but still left a separate, unreferenced
`TabletopConceptPrototype-*.{js,css}` chunk physically present in `dist/`.
That's the version replaced by the literal-`import.meta.env.DEV` pattern
above once the discrepancy was caught during this checkpoint's own build
verification step.)

Also dev-only by construction: the concept-art overlay's image server
(`apps/web/vite.config.ts`'s `devConceptArtPlugin`) is wired only through
Vite's `configureServer` hook, which Vite never invokes during `vite
build` — no separate guard needed, no code path for it to be included in
a production bundle at all.

## 5. Reference files

- `meld-masters-concept-01.png` — binding desktop target
- `meld-masters-concept-04.png` — binding phone target
- `meld-masters-concept-roster.png` — inspected for portrait direction;
  no new artwork generated, the existing approved `PORTRAIT_ROSTER` (8
  rival portraits + fallback, already in `apps/web/src/branding/
  portraits.ts`) is reused as-is
- `meld-masters-concept-logo.png` — inspected for the wordmark's
  gradient/palette direction; realized as a live-text treatment (existing
  Silkscreen font + CSS gradient), not a new image asset

## 6. Desktop region map (built toward concept-01)

| Region | Component | Notes |
|---|---|---|
| Masthead (full width, ~14% height) | `ConceptMasthead` | Left plaque (league/season), large gradient wordmark + monogram + tagline, right plaque (round/target/table) |
| Left rail | `ConceptCompetitorRail` | 4 stacked cards, 96px portraits, name, mock score, active-card glow, per-seat accent color |
| Center: board | `ConceptBoard` | Dominant framed panel, 6 mock melds in a 2-column grid, tiles-left/possible-melds readout |
| Center: rack | `ConceptRack` | Directly attached under the board (negative margin, shared frame language) |
| Center: actions | `ConceptActionBar` | 4 large cabinet controls (Draw/Pass/Sort/Commit Turn), icon + label + sublabel |
| Right sidebar | `ConceptSidebar` | 3 stacked cards: turn/countdown, move log, how-to-play + tip |

## 7. Phone region map (built toward concept-04)

Stacked order, matching the brief's required sequence: compact masthead →
two prominent player cards (self + one opponent — a deliberate, CSS-only
`nth-child` restriction from the desktop rail's four, matching concept-04
exactly rather than wrapping all four) → round/target strip (inside the
masthead) → board → rack → move log/tip → 2×2 action grid → arcade footer
strip (league/season, inside the masthead on mobile). Same component tree
and mock data as desktop; only CSS changes at the `860px` breakpoint — no
duplicated desktop/mobile component tree.

## 8. Components created

All under `apps/web/src/prototypes/tabletop-concept/`: `devOnly.ts`,
`mockData.ts`, `TabletopConceptPrototype.tsx`, `ConceptMasthead.tsx`,
`ConceptCompetitorRail.tsx`, `ConceptBoard.tsx`, `ConceptRack.tsx`,
`ConceptTile.tsx` (shared board/rack tile renderer), `ConceptSidebar.tsx`,
`ConceptActionBar.tsx`, `ConceptOverlay.tsx`, `tabletop-concept.css`.
Plus `apps/web/src/App.tsx` (route wiring, `AppProviders` extraction) and
`apps/web/vite.config.ts` (dev-only concept-art plugin).

No production tabletop file was touched.

## 9. Mock data used

4 competitors (You/Rico/Pixie/T-Bone) with names, scores (325/270/215/180
— matching the concept's own example numbers), and tile counts; round 6
of 10, target score 500, table name "Neon Grid"; a "01:12" turn
countdown; 6 table melds and an 11-tile rack (10 numbered tiles + 1
joker) built from the real engine's actual color/symbol/value-range
vocabulary (`packages/shared/src/branding.ts`'s `TILE_COLOR_TOKENS`,
values 1–13) so the board reads as a plausible Meld Masters state, not an
unrelated game's; a 5-entry move log; 4 how-to-play bullets + a tip line.
All of this is visual mock data only — explicitly permitted for this
prototype, explicitly not to be added as real features to the live game.

## 10. Overlay implementation

`ConceptOverlay.tsx`: a fixed, `pointer-events: none` `<img>` sourced from
`/__dev-concept-art/<file>`, with a small control panel (checkbox to
show/hide, a 0–100 opacity range input, and a radio switch between
concept-01/concept-04). The image itself is served by
`devConceptArtPlugin` in `vite.config.ts` — a `configureServer`-only Vite
plugin that streams the two allow-listed PNGs directly from
`docs/design-reference/meld-masters/` on disk, never copying them into
`apps/web`'s own assets. Used actively during layout construction (not
just for the final screenshots) — see §19 for what it caught.

## 11. Desktop similarity assessment

At a quick glance, `comparison--desktop-1440x900.png` and
`comparison--desktop-1280x720.png` read as two versions of the same
interface: full-viewport arcade composition, large gradient masthead
flanked by plaques, a tall competitor rail with prominent portraits, a
dominant framed board with melds arranged in the same 2-column pattern,
an attached rack tray, a dense 3-panel sidebar, and a 4-button cabinet
action row. `overlay--desktop-1440x900.png` (concept at ~50% opacity over
the live prototype) confirms this at the region level, not just
impressionistically — masthead, rail cards, board melds, rack, and
sidebar panels all land within a small margin of the concept's actual
pixel positions.

## 12. Phone similarity assessment

`comparison--phone-390x844.png` and the overlay confirm the same result
at the phone target: compact masthead, two prominent player cards, board,
rack, move log/tip, and action controls in concept-04's exact stacked
order and relative proportions.

## 13. Region alignment notes

From the overlay screenshots: masthead height/position, rail card
vertical rhythm, board's top edge and internal meld grid, rack position,
and sidebar panel boundaries all align closely. The clearest visible
offset is the board's *shape*, not its position — see §19.

## 14. Portrait scale comparison

96×96 (desktop) / 64×64 (mobile) cards — large, "major character"
presentation, not avatar badges. Comparable in scale to the concept's own
portraits within their respective card sizes.

## 15. Board scale comparison

Concept-01: a wide, framed, internally-textured panel occupying the full
center column, roughly half the total interface height. Prototype:
matches this — dominant framed panel (`min-height: 26rem` desktop, `16rem`
mobile), full center-column width, melds arranged in the same 2-column
pattern the concept uses.

## 16. Rack scale comparison

Concept-01: a wide tray directly under the board, sharing its frame
language. Prototype: matches via a negative-margin attachment to the
board above and the same panel/clip-path treatment, full center-column
width.

## 17. Sidebar density comparison

Concept-01: 2–3 stacked info panels plus a small mascot/tip callout.
Prototype: 3 stacked panels (turn/countdown, move log, how-to-play+tip) —
comparable density, no large empty areas.

## 18. Action-control comparison

Concept-01: 4 large, icon-led cabinet buttons with a primary/secondary
label each, Commit Turn visually strongest (filled gold). Prototype:
matches directly — 4 buttons, icon + label + sublabel, Commit Turn filled
gold with extra glow. Static (`<div>`, not `<button>`), per the brief.

## 19. Remaining visible differences

- **Board shape:** the concept's playfield reads as a tapered/angled
  trapezoid (a perspective cue); the prototype's board is a rectangular
  panel with notched (not tapered) corners. A deliberate choice — a
  literal CSS 3D transform (`rotateX`) on the board would distort the
  tile numbers' legibility — but the blurred silhouette comparisons
  (`silhouette--*.png`) make this specific shape difference visible, not
  just the position/size match. This is the one place the two
  silhouettes don't fully agree.
- The masthead's live-text wordmark gradient (cyan→white→gold→orange) is
  a close but not pixel-identical match to the concept's painted logo
  treatment (no new artwork was generated, per the brief).
- The countdown card omits the concept's small horizontal progress-bar
  glyph beneath the digits.
- Rail card proportions (portrait-to-text ratio) are close but not
  pixel-identical to the concept's own card crop.
- At 1440×900 with a full rack, the 4th rail card (T-Bone) is partially
  below the fold in the raw screenshot (visible in `overlay--desktop-
  1440x900.png` and `comparison--desktop-1440x900.png`) — the concept's
  own mockup has more vertical headroom for 4 cards than a real 900px
  viewport leaves once the masthead's actual rendered height is
  accounted for.
- Action-bar icon glyphs are Unicode/emoji approximations (no new
  artwork), not the concept's custom iconography.

None of the above is a color/typography-only difference being mistaken
for layout fidelity — every item above is a genuine, small spatial or
shape discrepancy, reported as such.

## 20. Screenshot inventory

`docs/design-reference/tabletop-static-prototype-review/`:

- `prototype--desktop-1440x900.png`, `prototype--desktop-1280x720.png`,
  `prototype--phone-390x844.png`, `prototype--phone-landscape-844x390.png`
- `comparison--desktop-1440x900.png`, `comparison--desktop-1280x720.png`,
  `comparison--phone-390x844.png`,
  `comparison--phone-landscape-844x390.png`
- `overlay--desktop-1440x900.png`, `overlay--phone-390x844.png`
- `silhouette--desktop-1440x900.png`, `silhouette--phone-390x844.png`

Produced by `e2e/scripts/capture-tabletop-static-prototype.ts` (also the
required Chromium + Mobile Chrome route-load checks) and
`e2e/scripts/build-tabletop-prototype-comparisons.ts`.

## 21. Overlay screenshot paths

- `docs/design-reference/tabletop-static-prototype-review/overlay--desktop-1440x900.png`
- `docs/design-reference/tabletop-static-prototype-review/overlay--phone-390x844.png`

## 22. Silhouette comparison paths

- `docs/design-reference/tabletop-static-prototype-review/silhouette--desktop-1440x900.png`
- `docs/design-reference/tabletop-static-prototype-review/silhouette--phone-390x844.png`

## 23. Confirmation no live behavior was integrated

No `useGame`, `useDraftState`, socket, room, or recovery hook is imported
anywhere under `prototypes/tabletop-concept/`. The route renders outside
`AuthProvider`/`AnnouncerProvider`/`RootLayout` entirely (see `App.tsx`'s
`AppProviders` extraction, §4), so it makes no `POST /api/identity` call
and no other API request. All data is the hardcoded content in
`mockData.ts`. Action controls are inert `<div>`s with no handlers.

## 24. Confirmation no production tabletop was changed

`apps/web/src/pages/TabletopPage.tsx`, `apps/web/src/tabletop/*`, and
`apps/web/src/styles/global.css` are untouched on this branch (`git diff
main --stat` shows only `App.tsx`, `vite.config.ts`, the new
`prototypes/tabletop-concept/` tree, and the new test/summary/script
files).

## 25. Confirmation no other screen was changed

Home, Public Lobby, Create Room, Join Room, Waiting Room, and Recovery
are unchanged; `AppProviders`'s extraction in `App.tsx` is behavior-
identical for every existing route (same providers, same values, one
extra pathless layout-route nesting level) — confirmed by the full
existing web test suite (211 pre-existing tests) passing unmodified.

## 26. Confirmation branch was not merged

Work stayed on `prototype/tabletop-concept-fidelity` throughout; `main`
was checked out only to branch from and was never modified.

## 27. Confirmation nothing was deployed

No deploy was performed or requested. Only local, disposable Vite dev-
server instances were run, to produce the screenshots above.

---

## Testing

| Command | Result |
|---|---|
| `pnpm run format` | pass |
| `npx eslint apps/web` | pass |
| `pnpm --filter @tile-meld/web run typecheck` | pass |
| `cd apps/web && npx vitest run` (full suite, including the new route-guard test) | pass — 213 tests / 26 files |
| `pnpm run build` (web + server) | pass |
| `dist/` grep for prototype-only strings post-build | zero matches (§4) |
| Chromium route-load check (via the capture script) | pass — masthead/board/rack/actions visible, zero console errors |
| Mobile Chrome (Pixel 7 emulation) route-load check | pass — same assertions |

No full e2e suite run, no WebKit run, per the brief.
