# Meld Masters — Tabletop visual-fidelity checkpoint

A layout rebuild of the active Tabletop screen against the approved Meld
Masters concept art. This corrects the earlier visual refresh
(`docs/meld-masters-visual-refresh-plan.md`, Phases 0–8), which applied the
arcade color/token/typography system but never touched composition —
`docs/tabletop-layout-contract.md` explicitly scoped that work to "named
regions only... no artwork" and deferred an actual concept-art layout pass
to "Phase 9+, blocked on a supplied reference." That reference now exists
under `docs/design-reference/meld-masters/`; this checkpoint delivers that
deferred layout pass, scoped to the tabletop screen only.

## 1. Starting commit and branch

- Branch: `feature/tabletop-visual-fidelity`
- Branched from `main` at `42a4851` (clean working tree, in sync with
  `origin/main`)

## 2. Reference images used

- `meld-masters-concept-01.png` — binding desktop composition
- `meld-masters-concept-03.png` — binding phone composition (confirmed
  identical structure to concept-04; not separately compared)
- `meld-masters-concept-04.png` — binding phone composition and portrait
  direction; used for both required mobile comparisons (390×844 and the
  844×390 landscape crop)
- `meld-masters-concept-roster.png` / `meld-masters-concept-logo.png` —
  inspected for context only; no new portrait or logo artwork was
  introduced (out of scope — see §14)

## 3. Desktop layout map (from the concept art)

| Region | ~% of viewport | Concept content | What now occupies it |
|---|---|---|---|
| Top strip | ~12% height | League/season box, logo, round/target box | Existing global header only (unchanged); the round/target box has no real equivalent and its visual weight moved into the sidebar's turn/deadline card instead |
| Left rail | ~18% width, full height | "YOU" + 3 opponent cards, portrait, name, score | Self card + opponent cards: portrait, name, **tile count**, active/resigned/computer state, color-coded frame |
| Center board | ~45% width, dominant | Framed felt, sets in a 2-column grid, pool/melds stats | `Table`'s sets in a responsive wrap grid inside an enlarged framed board; **pool count only** (no "possible melds" — doesn't exist) |
| Center rack | ~10% height, under board | "YOUR RACK" tray | `Rack`'s tiles + sort controls, attached tray directly under the board |
| Right sidebar | ~20% width, full height | Turn/deadline card, move-log card, mascot card | Turn/deadline card (real); move-log slot → connection status/meld progress/validation messages; mascot slot → chat |
| Bottom action bar | ~9% height | Draw/Pass/Sort/Commit, 4 large buttons | All 6 real actions (Undo/Reset/Draw/Pass/Commit/Resign) as large buttons, Commit strongest |

## 4. Mobile layout map (concept-03/04)

Stacked order: compact header (existing, unchanged) → self+opponent cards
side by side → turn/status card → board → rack → feedback+chat → large
action-button grid. This is also this build's literal DOM order (see §5).

## 5. Components restructured

- `apps/web/src/layout/RootLayout.tsx` — a `useMatch("/games/:gameId")`
  check adds `page--tabletop` to `<main>` only on the tabletop route, which
  lifts the site-wide `.page` `max-width: 960px` constraint for that route
  only. No other route's markup changed.
- `apps/web/src/tabletop/OpponentStrip.tsx` — extended with a `self` prop;
  now renders a large self card alongside the existing opponents `<ul
  aria-label="Opponents">`, both inside a `.tabletop-competitors` rail.
  Portraits went from 36×36 badges to 88×88 (desktop) / 64×64 (mobile)
  cards.
- `apps/web/src/pages/TabletopPage.tsx` — JSX reordered into the DOM
  sequence in §4 above; every hook/handler (`useGame`, `useDraftState`,
  `onDragEnd`, `handleCommit`/`Draw`/`Pass`/`Resign`, sensors) is
  byte-for-byte unchanged, this is a presentational reshuffle only.
- `apps/web/src/tabletop/Table.tsx` — table sets now render inside a
  `.table-sets-grid` wrapper (CSS `repeat(auto-fit, minmax(220px, 1fr))`)
  instead of a vertical stack. No prop or logic change.
- `apps/web/src/styles/global.css` — the `.tabletop-*` block rewritten:
  a 3-column desktop grid (`grid-template-areas`, rail/board/status/
  rack/feedback/actions/chat) that flattens to a plain flex column under
  `max-width: 860px` (no CSS-driven visual reordering on mobile — DOM order
  *is* mobile order); new `.competitor-card`/`.tabletop-competitors` rail
  styling; enlarged `.tabletop-board`; tray-style `.tabletop-rack`;
  cabinet-style `.tabletop-actions` buttons; card-style
  `.tabletop-status`/`.tabletop-feedback`/`.tabletop-chat` sidebar
  regions.
- `apps/web/test/TabletopLayout.test.tsx` — 3 assertions updated to use the
  file's own pre-existing `textAcrossElements` helper (the same fix already
  applied there for emoji-split text), because the opponent name and tile
  count now render in separate sibling `<span>`s instead of one — a direct,
  expected consequence of the DOM restructure, not a weakened assertion.

No other page, component, or test file was touched.

## 6. Behavior preserved

Confirmed via the full test/e2e gate (§16), unchanged in code: mouse and
touch drag-and-drop, keyboard tile selection/placement, `aria-pressed`,
tile accessible names, set validity, set reordering, rack sorting, undo,
reset turn, draw, pass, commit turn, resign confirmation, chat (including
collapse/expand state survival), connection status, turn deadline,
computer turns, multiplayer turns, completed game, rematch, reconnect,
purged/unavailable-game state, live announcements, reduced-motion,
portrait accessibility (`alt=""`, decorative only), and every dnd-kit
droppable id (`rack`, `new-set`, `set:*`).

## 7. Desktop composition changes

Single centered `.page` column (max 960px) with everything in one
vertical `.stack` (status → opponents → board → rack → feedback → actions
→ chat) replaced with a full-viewport 3-region grid: a competitor rail,
a dominant center column (board → rack → actions), and a status/feedback/
chat sidebar — see the side-by-side comparisons in §18.

## 8. Mobile composition changes

Previously the same single-column stack, just narrower. Now: self and
opponent cards render side by side (`display: contents` flattens the
`<ul>` so its `<li>`s share a flex row with the self card — verified this
doesn't affect list semantics via the passing axe scan and
`getByRole("list", ...)` queries), the action bar becomes a 2-column grid
with Commit spanning both columns, and portraits are 64×64 instead of the
previous 36×36.

## 9. Portrait size before and after

36×36 badge → 88×88 (desktop) / 64×64 (mobile) card, both well above a
"tiny avatar" scale.

## 10. Board proportion before and after

Before: `min-height: 18rem`, full width of the single 960px-max page
column. After: `min-height: 20rem` (a real increase, deliberately not
larger — see the inline CSS comment on `.tabletop-board` for why),
dominant width of the new center column, framed, with sets in a wrap grid
instead of one-per-row.

## 11. Rack proportion before and after

Absolute width is similar (the center column is comparable to the old
960px page column at typical desktop widths), but it's now a tray directly
attached under the board rather than one more item stacked in a page-long
single column that also included chat/actions below it.

## 12. Action-control changes

Plain `flex-wrap` button row → large (`min-height: 3.25rem`, display-font)
cabinet buttons in a responsive grid; Commit Turn carries extra glow/size
as the strongest action; Resign sits below a divider as a separated danger
group. Mobile: explicit 2-column grid, Commit spanning both columns.

## 13. Status/chat placement

Status (turn/connection/deadline) moved from a full-width bar above
everything to the top card of the right sidebar (desktop) / third stacked
section (mobile). Chat moved from a bottom-of-page disclosure to the
bottom card of the same sidebar (desktop) / second-to-last stacked section
(mobile) — same toggle/expand-collapse behavior and mount-once state,
unchanged.

## 14. Deliberate differences from the concepts

- No score, round counter, target score, move log, "possible melds"
  count, or mascot character — none of these are real features of this
  game (see §15).
- Header/top strip: the existing global header is unchanged (out of
  scope per the brief); it does not carry the concept's stylized
  season/round boxes.
- Tile artwork, portrait artwork, and color palette are unchanged
  (a visual-theme concern, explicitly out of scope for this layout-only
  pass — see `docs/tabletop-layout-contract.md`).
- The action bar has 6 real buttons (Undo/Reset/Draw/Pass/Commit/Resign)
  vs. the concept's 4 (Draw/Pass/Sort/Commit) — Sort exists as the rack's
  own existing 3-way control, not a dedicated action-bar button.

## 15. Features omitted because the application does not have them

Score, round/season counters, target score, move log, "possible melds"
count, the mascot tip character, and the settings-gear/hamburger-menu/
lightning-bolt/stats-icon decorative chrome (the app's real nav and
connection status already cover the functional need those implied).

## 16. Tests run

| Command | Result |
|---|---|
| `pnpm run format` | pass |
| `pnpm run lint` (repo-wide) | 2 pre-existing errors in `e2e/scripts/verify-production.mjs` — an untracked, unrelated file present before this branch existed; not touched by this task |
| `npx eslint apps/web` and the 2 new `e2e/scripts/*.ts` files | pass |
| `pnpm run typecheck` | pass, 6 workspace projects |
| `pnpm run test` (full workspace) | pass — 724 tests / 70 files (`packages/shared` 45, `packages/engine` 115, `packages/bot` 36, `apps/web` 211, `apps/server` 317) |
| `pnpm run build` | pass, web + server (a CSS-comment bug this task introduced and then fixed — see the `.tabletop-shell` comment history — was caught here first, via an esbuild minifier warning) |
| `npx playwright test --project=chromium` (full suite) | 42/42 pass |
| `npx playwright test --project=mobile-chrome` (full suite) | 42/42 pass |
| `npx playwright test tabletopMobile/accessibility/drag-and-drop/mobileOverflow/two-player-smoke --project=chromium --project=mobile-chrome` (re-run after later CSS tuning) | 40/40 pass |

No webkit or mobile-webkit run, per `CLAUDE.md`'s documented local
resource-leak warning.

## 17. Screenshot inventory

`docs/design-reference/tabletop-fidelity-review/`:

- `tabletop--1440x900.png`, `tabletop--1280x720.png`,
  `tabletop--390x844.png`, `tabletop--844x390.png` — raw, viewport-only
  (not full-page) captures of a live 2-player game
- `comparison--desktop-1440x900.png`, `comparison--desktop-1280x720.png`,
  `comparison--mobile-390x844.png`,
  `comparison--mobile-844x390-landscape.png` — side-by-side sheets

Produced by two new scripts, `e2e/scripts/capture-tabletop-fidelity.ts`
and `e2e/scripts/build-tabletop-comparisons.ts` (same pattern as the
existing `capture-phase-N-review.ts` scripts).

## 18. Exact paths to the side-by-side comparisons

- `docs/design-reference/tabletop-fidelity-review/comparison--desktop-1440x900.png`
- `docs/design-reference/tabletop-fidelity-review/comparison--desktop-1280x720.png`
- `docs/design-reference/tabletop-fidelity-review/comparison--mobile-390x844.png`
- `docs/design-reference/tabletop-fidelity-review/comparison--mobile-844x390-landscape.png`

## 19. Remaining visible differences

- No score/round/move-log/mascot content (§14/§15, by design).
- Header not restyled to the concept's stylized top bar (out of scope).
- Tile and portrait artwork/palette unchanged (out of scope, visual theme).
- 6 action buttons instead of 4 (real feature set).
- At 1280×720, with chat open by default (its existing default state) and
  a full/wrapped rack, the very bottom of the action bar or the chat
  input can require a small amount of scroll to reach — chat is the
  documented lowest-priority region (`docs/tabletop-layout-contract.md`:
  "explicitly the LEAST important region"), so this was accepted rather
  than shrinking the board further to force a zero-scroll fit.
- Competitor cards show tile counts, never scores (real data only).

## 20. Confirmation no other screen was redesigned

Only `RootLayout.tsx` (a 3-line, route-scoped class conditional),
`TabletopPage.tsx`, `OpponentStrip.tsx`, `Table.tsx`, one test file, and
the tabletop-scoped rules in `global.css` were modified (`git diff --stat
main`, 6 files). Home, Public Lobby, Create Room, Join Room, Waiting Room,
and Recovery are unchanged.

## 21. Confirmation the branch was not merged or deployed

Work stayed on `feature/tabletop-visual-fidelity` throughout. `main` was
never checked out or modified during this task. No build was deployed;
the only server/Vite processes run were local, disposable dev instances
used to produce the screenshots above.
