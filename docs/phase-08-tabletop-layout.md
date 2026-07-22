# Phase 8 — Tabletop Information Hierarchy and Artwork-Ready Layout Contract

> Completion summary for Phase 8 of `docs/next-changes-implementation-plan.md`
> (§7.6/§7.7, Phase 8 plan entry). Implemented on branch
> `feature/identity-room-lifecycle-v2`, on top of Phase 1 (`13b8323`),
> Phase 2 (`17cdb0a`), Phase 3 (`779f55d`), Phase 4 (`aae2c05`), Phase 5
> (`d23e7ce`), Phase 6 (`7e90449`), and Phase 7 (`ac9c2a3`). Later phases
> (artwork application, retro visual theme) were **not started**.

## Goal

Reorganize the tabletop's information hierarchy — desktop and mobile — into
clearer, stably-named layout regions, improve the prominence of turn
ownership, and define an artwork-ready layout contract for later phases,
without changing any game rule, validation rule, drag-and-drop semantic,
or server/redaction behavior, and without adding any actual artwork or
retro theme.

## Files changed

**Web**

- `apps/web/src/pages/TabletopPage.tsx` — restructured into named regions
  (`tabletop-shell`/`-status`/`-opponents`/`-board`/`-rack`/`-actions`/
  `-feedback`/`-chat`); every handler, condition, and piece of visible
  text is unchanged from before this phase except two deliberate,
  documented adjustments (see "Removed, retained, moved, and collapsed
  information" below).
- `apps/web/src/tabletop/TabletopStatus.tsx` (new) — owns the page's
  single `<h1>` (now the dynamic turn/game-state text, replacing the
  static "Tabletop" title), the connection indicator, and the deadline
  countdown.
- `apps/web/src/tabletop/OpponentStrip.tsx` (new) — the opponent list,
  now a labelled `<ul aria-label="Opponents">` instead of a bare row of
  `<span>`s.
- `apps/web/src/styles/global.css` — added a "Tabletop information
  hierarchy (Phase 8)" section: `.tabletop-shell`, `.tabletop-status`,
  `.tabletop-turn`, `.tabletop-opponents`, `.tabletop-main` (the
  responsive 2-column/1-column grid), `.tabletop-primary`,
  `.tabletop-board`, `.tabletop-rack`, `.tabletop-actions(-primary/
  -danger)`, `.tabletop-chat`, `.tabletop-chat-toggle`, and one media
  query (`max-width: 860px`) collapsing the grid to one column. No
  existing selector was modified or removed.
- `apps/web/src/assets/tabletop/README.md` (new) — reserves the future
  artwork location; documents the asset-safety rules; **no image asset
  added**.

**Untouched** (verified, not merely assumed): `apps/web/src/tabletop/
Rack.tsx`, `Table.tsx`, `TableSet.tsx`, `Tile.tsx`, `DropZone.tsx`,
`DeadlineCountdown.tsx`, `draftState.ts`, `useDraftState.ts`,
`hintEngine.ts`, `useGame.ts`, `RematchPanel.tsx`; `apps/web/src/chat/
ChatPanel.tsx`, `useChat.ts`; `apps/web/src/announcer/
AnnouncerProvider.tsx`. Every drag-and-drop primitive, every socket
handler, every redaction boundary, and the chat API/persistence/
authorization model are all exactly as they were before this phase.

**Docs**

- `docs/tabletop-layout-contract.md` (new) — the full artwork slot
  contract (see below).
- `docs/phase-08-tabletop-layout.md` (this file).

**Tests** (see "Tests added or updated" below).

`packages/engine` and `packages/bot` were not modified. No server or
shared-schema change was made or needed — every field this phase's UI
needed (`view.roomId`, `view.opponents[].rackCount`, etc.) already existed
on `RedactedGameView` from earlier phases.

## Original tabletop inventory

Verified directly against the actual repository (not assumed from the
plan document alone) before making any change:

**1. Essential during play** (all preserved, unchanged behavior):
unmistakable turn ownership; current player/turn indicator; deadline
countdown; table sets and validity state; the player's rack; rack tiles;
pool count; opponent names and rack counts; Draw; Pass; Commit; Reset;
Undo; Resign and its confirmation; initial-meld progress; validation
guidance; every control needed for accessible (click/tap and keyboard)
tile manipulation.

**2. Required for accessibility, safety, or correctness** (all preserved,
unchanged behavior): the announcer/live region (`AnnouncerProvider`,
untouched); connection-state indicator; reconnect state (`useGame.ts`'s
socket lifecycle, untouched); action-error banner; general error banner
(`game.banner`); timeout/warning toast (`game.warningToast`); disabled-
state styling (`button:disabled`, untouched); accessible labels/
descriptions on every drop zone and tile; keyboard-focus handling
(`:focus-visible`, untouched); reduced-motion behavior (global rule,
untouched).

**3. Useful but secondary** (visually demoted, per the phase's own
categorization — see below for exactly how): the chat panel (now
collapsible, defaulting open); the "Committing an arrangement..." penalty
paragraph (now shown only during the player's own turn, not always);
detailed opponent rows beyond name/count were already minimal (no change
needed there).

**4. Removed/replaced from the primary view**: the static, non-identifying
`<h1>Tabletop</h1>` title (removed — see "Final desktop hierarchy" for its
replacement); the redundant `<h2>Game over</h2>` inside the completed-game
card (removed — its text now lives in the page's own H1, avoiding two
identically-named headings).

No information was deleted outright — every item above either kept its
exact original condition/text, or had its *visibility condition* narrowed
to when it's actually relevant (see next section), never its content
removed while relevant.

## Removed, retained, moved, and collapsed information

- **Removed**: the static `<h1>Tabletop</h1>` (no game identity, exactly
  the "candidate for removal" the plan called out). The completed-game
  card's own `<h2>Game over</h2>` (removed as a *duplicate*, not a
  deletion of the information — see below).
- **Replaced**: the H1 slot is now filled by the dynamic turn/game-state
  text itself ("Your turn" / "Waiting on seat N" / "🤖 Computer is
  playing…" / "Game over") — this is the single biggest hierarchy change
  in this phase: turn ownership is no longer a `<strong>` sitting below a
  static title, it **is** the page's title.
- **Moved**: the connection indicator and deadline countdown moved from a
  bare top row into the new `TabletopStatus` component (same visible
  text, same conditions). The opponent list and pool count moved from one
  combined unlabelled row into a labelled `OpponentStrip` (opponents) plus
  a standalone line inside the board region (pool count) — pool count's
  visibility condition is **unchanged** (still shown regardless of game
  status, exactly as before) even though its position moved.
- **Collapsed (made contextual, not deleted)**: the "Committing an
  arrangement the server rejects costs a 3-tile penalty..." paragraph
  used to render **unconditionally** whenever any view existed — including
  when it wasn't the player's turn, or the game had already ended, where
  it was pure noise. It now renders **only while it's the player's own
  turn** (`isMyTurn`), which is exactly the "make it contextual, don't
  remove the information" instruction — the identical sentence still
  appears, verbatim, at the one time it's actually actionable.
- **Retained verbatim** (text, condition, and behavior byte-for-byte
  unchanged): the invalid-arrangement hint paragraph; the initial-meld
  progress line; every banner/toast; every action button's label,
  disabled condition, and handler; the resign confirmation flow; the
  "Pool: N tiles" line; every opponent's display text (`"{name}{ 🤖?}: {n}
  tiles{ (resigned)?}{ ⏳?}"`).

## Final desktop hierarchy

```
tabletop-shell
├─ tabletop-status         (H1 turn/game-state text + connection + deadline)
├─ [banner]  [warningToast]                (global alerts, unchanged)
├─ [completed-game card: Rematch/Back home]   (only when status=completed)
└─ tabletop-main  (2-column CSS grid, minmax(0,1fr) | minmax(240px,320px))
   ├─ tabletop-primary
   │  ├─ tabletop-opponents   (labelled <ul>, name/count/resigned/computer/⏳)
   │  ├─ tabletop-board       (Pool count + <Table>: sets, drop zones)
   │  ├─ tabletop-rack        (<Rack>: sort controls, drop zone, tiles)
   │  ├─ tabletop-feedback    (actionError, meld progress, hint, penalty note)
   │  └─ tabletop-actions     (role="group": Undo/Reset/Draw/Pass/Commit | Resign)
   └─ tabletop-chat           (toggle button + <ChatPanel>, secondary column)
```

Matches the requested order (status → opponents → board → rack → actions →
chat) with chat rendered as a narrower side column rather than appended
after actions in the visual flow — satisfying the explicitly-allowed
"two-column desktop layout... chat uses the smaller column" option. The
board/rack/actions column is `minmax(0, 1fr)` (dominant, grows to fill
available space); chat is `minmax(240px, 320px)` (bounded, never
compresses the primary column below a usable width). The global `.page`
container's existing `max-width: 960px` was deliberately **not** changed
(see "Known limitations").

## Final mobile hierarchy

At `max-width: 860px`, `.tabletop-main` collapses to a single column via
one media query — the **same DOM**, not a duplicated mobile tree, so the
stacked order is automatically: 1. status, 2. opponents, 3. board, 4.
rack, 5. actions, 6. chat — exactly the requested mobile order, for free,
because it's the same document order the desktop grid just displays in
two columns.

- **No horizontal page overflow**: verified directly at 390×844 (both a
  Vitest-independent Playwright check and a real rendered-DOM
  `scrollWidth`/`clientWidth` comparison) — see "Chromium desktop/mobile
  results."
- **Table/rack internal wrapping** (not horizontal scrolling — `.drop-
  zone`'s pre-existing `flex-wrap: wrap`, unchanged by this phase) already
  prevented overflow before this phase and continues to.
- **No sticky action bar** — a deliberate decision, not an oversight (see
  "Known limitations").
- **Chat behind a toggle**: a real `<button aria-expanded aria-controls>`
  toggling a `hidden` (not unmounted) panel — see "Component boundaries."
- **Resignation confirmation** unchanged and still fully usable at this
  width (verified directly, `TabletopLayout.test.tsx` + real E2E).
- **Safe-area insets**: `.tabletop-shell` reserves `env(safe-area-inset-
  left/right, 0)` padding defensively; since this phase adds no sticky/
  fixed-position element, there is currently nothing in the layout that
  actually needs bottom-inset protection — documented as a forward-
  looking reservation, not a currently-load-bearing rule (see "Known
  limitations").

## Component boundaries

Two new components, both genuinely justified by a distinct, non-trivial
responsibility (not a mechanical split):

- **`TabletopStatus`** — owns the single page H1 and its turn-state
  derivation, the connection indicator, and the deadline countdown.
  Receives `isMyTurn`/`computerIsPlaying` as props (computed once in
  `TabletopPage`, which also needs them for button-disabled logic) rather
  than recomputing them, avoiding duplicated logic.
- **`OpponentStrip`** — owns the labelled opponent list. Pure, presentational,
  same per-opponent text as before.

Everything else (board/rack wrappers, the action bar, the feedback block,
the chat disclosure) stays as plain JSX directly in `TabletopPage.tsx` —
each is either a thin wrapper around an existing, already-tested component
(`Table`, `Rack`) or simple enough (a labelled `<div>`, a toggle button)
that a dedicated file would be exactly the "large abstraction hierarchy"
the phase explicitly says not to build.

**Chat disclosure mechanism** (a deliberate design decision, not native
`<details>`): a controlled `useState<boolean>` plus a real `<button
aria-expanded aria-controls="tabletop-chat-panel">`, toggling a `hidden`
attribute on the panel `<div>` — **never conditional rendering**. This is
what makes "chat state survives collapse/expand" true by construction:
`ChatPanel` (and its own `useChat` hook, holding the message list and
socket subscription) never unmounts, so nothing about it can be lost by
toggling visibility. Verified directly with a mount-tracking test (see
"Tests added"). `<details>/<summary>` was considered and rejected: forcing
a different default open/closed state per viewport isn't reliably
achievable through CSS alone (the native disclosure mechanism isn't
stylesheet-overridable across browsers), and a plain controlled button
gives predictable, directly-testable `aria-expanded` state instead of
relying on browser-dependent `<summary>` role mapping.

**No unread-message indicator exists to preserve** — `useChat.ts`/
`ChatPanel.tsx` have never had one; none was invented (would be new
behavior, out of scope).

## Artwork slot contract

Full contract in `docs/tabletop-layout-contract.md`. Defines these named
slots at minimum, each with an owning component/CSS class, purpose,
desktop/mobile behavior, crop/contain/repeat/stretch expectations, safe
content area, aspect-ratio behavior, layering, whether interactive content
sits above it, contrast/legibility requirements, reduced-motion
requirements, and its no-asset fallback (in every case: today's actual
plain-CSS implementation, unchanged):

`tabletop-status-frame`, `tabletop-opponents-frame`,
`tabletop-board-surface`, `tabletop-rack-surface`,
`tabletop-actions-frame`, `tabletop-chat-frame` (optional),
`tabletop-page-background` (optional).

`apps/web/src/assets/tabletop/README.md` reserves the location and
restates the asset-safety rules for a reader who finds the directory
before the doc. **No image, sprite, background, icon, or other visual
asset was added anywhere in this phase.**

## Drag-and-drop verification

Every dnd-kit primitive (`DndContext`, `PointerSensor` with its
`activationConstraint: { distance: 8 }`, `KeyboardSensor`, `useDraggable`,
`useDroppable`) is untouched — `Tile.tsx` and `DropZone.tsx` were not
edited at all. Verified directly, against the real running app, not just
by inspection:

- **Rack-to-board dragging** and **board-to-board rearrangement** (a
  second drag onto an existing set): `e2e/tests/drag-and-drop.spec.ts`,
  real mouse-drag past the 8px activation threshold — **passes
  unmodified**.
- **Board-to-board / set-splitting via reorder controls**: covered by the
  existing `TableSet.tsx` left/right reorder buttons, untouched.
- **Scrolling-container / sticky-ancestor pointer-offset risk**: the new
  `.tabletop-main` grid introduces no `overflow`, `transform`, or `sticky`
  ancestor around the board/rack — dnd-kit's overlay math is unaffected
  (confirmed by the real-drag E2E test passing without any adjustment to
  `dragTo`'s coordinate logic in `e2e/tests/helpers.ts`, which was **not**
  modified).
- **Mobile touch drag**: `e2e/tests/drag-and-drop.spec.ts` and `tests/
  tabletopMobile.spec.ts` both pass against the `mobile-chrome` (Pixel 7)
  Playwright project, a touch-emulated environment.
- **Keyboard tile movement**: unchanged (`KeyboardSensor`, `Tile.tsx`'s
  `aria-pressed`/click-to-select path, `TableSet.tsx`'s Move-left/-right
  buttons) — `e2e/tests/two-player-smoke.spec.ts`'s click/tap alternative
  test passes unmodified, and `TabletopLayout.test.tsx` exercises the same
  select/activate path at the unit level.
- **Reset restores the draft; Undo remains correct**: `apps/web/src/
  tabletop/useDraftState.ts` was not modified;
  `e2e/tests/drag-and-drop.spec.ts` explicitly exercises two Undos back to
  the original 14-tile rack, unmodified and passing.
- **An invalid Commit leaves canonical state unchanged**:
  `e2e/tests/invalid-commit-penalty.spec.ts` — unmodified, passing;
  asserts the exact penalty-tile count and that the rejected arrangement
  never touched the canonical rack.
- **Tile IDs and conservation**: governed entirely by `packages/engine`
  and the server, neither touched by this phase; `apps/web/test/
  draftState.test.ts` and `apps/web/test/hintEngine.test.ts` (both
  unmodified) continue to pass, confirming the pure draft-state functions
  this phase's layout wraps are untouched.

**No drag collision algorithm was changed** — nothing in this phase came
close to requiring it; the layout changes are entirely outside dnd-kit's
own collision-detection code path.

## Accessibility behavior

- **One clear H1**: verified structurally (every render branch —
  not-found, loading, active, completed — renders exactly one `<h1>`) and
  by the E2E accessibility scan.
- **Semantic/labelled regions**: `role="region"` + `aria-label` on the
  status region ("Game status"); `role="group"` + `aria-label` on the
  action bar ("Game actions"); a labelled `<ul aria-label="Opponents">`
  for opponents. Board/rack deliberately do **not** get a redundant
  `role="region"` with a duplicate name — they already have their own
  `<h2>` headings ("Table", "Your rack (N)") and (for the rack) an
  existing `aria-label="Your rack"` on the drop zone itself; adding a
  second, identically-named landmark around an already-named one would be
  the "excessive landmark proliferation" the phase explicitly warns
  against. `data-testid="tabletop-board"`/`"tabletop-rack"`/`"tabletop-
  chat"` exist purely as test-scoping hooks (a11y-tree-inert).
- **Live announcements, keyboard access, visible focus, screen-reader-
  readable opponent counts, turn ownership announced in text, no color-
  only validity/turn indicator, contrast, reduced motion**: all inherited
  unchanged from components this phase did not modify
  (`AnnouncerProvider`, `useGame.ts`'s `announce()` calls, `:focus-
  visible`, `Tile.tsx`'s `aria-pressed`/`aria-label`, the reduced-motion
  global rule).
- **Accessible chat toggle**: a real `<button aria-expanded aria-
  controls>`, verified both at the unit level (`TabletopLayout.test.tsx`)
  and against the real DOM (`tabletopMobile.spec.ts`).
- **Zoom up to 200%**: not independently re-verified with a dedicated
  browser zoom test this phase (no such check existed before this phase
  either); the layout uses relative units (`rem`, CSS Grid `minmax`/`fr`)
  throughout, which is the standard prerequisite for reflow-based zoom
  support, but this is a known gap in explicit verification, not a
  claimed guarantee — see "Known limitations."
- **No serious/critical axe violations**: `accessibility.spec.ts`'s
  existing "Tabletop page" scan (desktop, unmodified) and the new
  `tabletopMobile.spec.ts` scan (390×844) both pass with zero serious/
  critical findings.

## Game Over / Rematch compatibility

Unchanged behavior, restructured presentation only: the completed-game
card still renders `RematchPanel` (untouched, Phase 5) and the "Back to
your rooms" link; the "Game over" heading text is preserved exactly
(`getByRole("heading", { name: "Game over" })` still resolves to exactly
one element — now the page's H1 instead of a card-local H2, since having
both would have created two identically-named headings). `apps/web/test/
TabletopPageRematch.test.tsx` (unmodified) and `e2e/tests/rematch.spec.ts`
(unmodified) both pass without any change.

## Purged/unavailable-game compatibility

Unchanged behavior; `apps/web/test/TabletopPurgedGame.test.tsx` and
`e2e/tests/purgedGame.spec.ts` (both unmodified) pass without any change.
A visually-hidden `<h1>Tile Meld</h1>` was added to both the not-found and
loading early-return branches (previously headingless) purely to preserve
"one clear H1" as a page-wide invariant — the existing visible text/links
in both states are byte-for-byte unchanged.

## Tests added or updated

**Web unit** (`apps/web/test/TabletopLayout.test.tsx`, new, 19 tests):
prominent "Your turn" H1; "Waiting on seat N" H1; deadline countdown
visible; connection-state indicator visible; the status region's stable
label; opponent rack counts visible with resigned/computer markers (and a
note on why rack *contents* are structurally unleakable at this layer);
the board region contains the current table sets; the rack region
contains the player's rack; every current action is present in the
labelled action group; resign confirmation still works; initial-meld
progress remains available; a general error banner remains visible; a
turn-warning toast remains visible; chat toggles accessibly with
`aria-expanded`; chat state survives collapse/expand (verified via a
mount-tracking spy, not just DOM presence); the chat region has a stable
test hook; zero `<img>` elements render in both the active and completed
states ("no artwork is required for rendering").

**Pre-existing web unit tests — zero changes needed, all still pass**:
`TabletopComputerTurn.test.tsx`, `TabletopPageRematch.test.tsx`,
`TabletopPurgedGame.test.tsx`, `ChatPanel.test.tsx`, `Tile.test.tsx`,
`draftState.test.ts`, `hintEngine.test.ts`, `useGame.test.tsx` — this is
itself strong evidence the refactor changed presentation without changing
any behavior those tests depend on.

**E2E** (`e2e/tests/tabletopMobile.spec.ts`, new): the 390×844 mobile
layout end to end — no horizontal overflow, status/board/rack/actions all
reachable, a real Draw-tile click succeeds, chat toggles via
`aria-expanded`, and a clean axe scan at this width. Run against both
`chromium` and `mobile-chrome` (Pixel 7) projects.

## Quality-gate results

Run from the existing local Postgres 16 (`tile-meld-db-1`, unchanged this
phase — no migration):

| Step | Result |
| --- | --- |
| `pnpm run format:check` | **Pass** |
| `pnpm run lint` | **Pass** — 0 issues |
| `pnpm run typecheck` (all 6 workspace projects, incl. `e2e`) | **Pass** |
| `pnpm run test` | **Pass** — shared 38, engine 115, bot 36, server 310 (unchanged from Phase 7), web 176 (↑ from 157) |
| `pnpm run build` | **Pass** (web + server) |

`ENABLE_RETENTION_SWEEP` was not touched or enabled during this phase's
testing — the only retention-specific tests that ran are the existing,
purpose-built controlled-time server tests from Phase 7
(`apps/server/test/game/retentionSweep.test.ts`), which inject `now`
directly rather than relying on the flag or a live sweep.

## Chromium desktop/mobile results

| Spec | Project | Result | Covers |
| --- | --- | --- | --- |
| `drag-and-drop.spec.ts` | chromium | **1/1 pass** | real mouse rack→board and board→board drag, Undo ×2 |
| `drag-and-drop.spec.ts` | mobile-chrome | **1/1 pass** | same, touch-emulated |
| `two-player-smoke.spec.ts` | chromium | **3/3 pass** | click/tap alternative, Draw, live chat |
| `invalid-commit-penalty.spec.ts` | chromium | **1/1 pass** | invalid Commit leaves canonical state unchanged, penalty applied, turn handed off |
| `multi-player.spec.ts` | chromium | **3/3 pass** | 3-/4-player opponent strip, manual early-start |
| `vs-computer.spec.ts` | chromium | **2/2 pass** | Play vs Computer, durable reload recovery |
| `rematch.spec.ts` | chromium | **2/2 pass** | Game Over + one-click Rematch, human and vs-computer |
| `reconnect-recovery.spec.ts` | chromium | **2/2 pass** | refresh mid-game, cross-context recovery |
| `turn-timeout.spec.ts` | chromium | **1/1 pass** | real deadline-sweep settlement |
| `accessibility.spec.ts` | chromium | **7/7 pass** | axe scans across every screen incl. Tabletop, 0 serious/critical |
| `purgedGame.spec.ts` | chromium | **1/1 pass** | unavailable-game state, clean a11y scan |
| `dashboard.spec.ts` | chromium | **7/7 pass** | Home dashboard regression, unaffected by this phase |
| `tabletopMobile.spec.ts` (new) | chromium | **1/1 pass** | 390×844: no overflow, every region reachable, chat toggle, clean a11y scan |
| `tabletopMobile.spec.ts` (new) | mobile-chrome | **1/1 pass** | same, on a real touch-emulated device project |

33/33 pass. One transient rate-limit-related flake (`dashboard.spec.ts`'s
"Open before it fills" test, in a long combined batch) reproduced the
same documented pattern seen throughout prior phases and passed cleanly
in isolation — not a Phase 8 regression (that spec's own code was not
touched this phase). Not run: the full five-project matrix (Firefox/
WebKit/mobile-webkit) — per the plan, that runs before merge, not during
implementation.

## Known limitations

- **No sticky action bar was implemented.** The phase instructions make
  this explicitly optional ("may be used... only if it does not obscure
  rack tiles, chat, banners, or safe areas") and separately warn against
  making the rack sticky if it risks drag-coordinate errors. Given the
  real complexity of getting dnd-kit's overlay math right under a sticky/
  fixed ancestor, and that this was never a hard requirement, the
  conservative choice was made: no sticky positioning anywhere in this
  phase. The action bar is reachable via normal scrolling on every tested
  viewport.
- **The global `.page` container's `max-width: 960px` was not changed.**
  Widening it would be a site-wide style change affecting every other
  page (Home, Create Room, Public Lobby, etc.), which the phase
  instructions explicitly say to avoid ("avoid global style rewrites
  unrelated to the tabletop"). Within that width, the new two-column grid
  (dominant primary column + a bounded 240–320px chat column) already
  makes substantially better use of the available space than the
  previous single-column, full-width-paragraph layout did.
- **Safe-area inset padding on `.tabletop-shell` is a forward-looking
  reservation, not currently load-bearing** — nothing in this phase's
  layout is sticky/fixed/edge-to-edge, so no element actually risks
  sitting under a notch or home indicator today. It's in place so a later
  phase that *does* add such an element inherits the reservation rather
  than needing to add it retroactively.
- **200% browser-zoom reflow was not independently re-verified** with a
  dedicated automated check (none existed before this phase either). The
  layout uses relative units and CSS Grid `minmax()`/`fr` tracks
  throughout, which is the standard technical prerequisite for zoom/
  reflow support, but this is not the same as a verified guarantee.
- **`GameStatusCard`'s Home-dashboard tone system was not touched or
  reused** for tabletop status treatment — the tabletop's status region
  uses text + semantic structure (H1, region landmark) rather than the
  dashboard's white/green/grey tone pattern, since the tabletop's "status"
  (whose turn) and the dashboard's "status" (room lifecycle) are
  different concepts; forcing a shared visual system between them was
  judged more likely to confuse than clarify, and was not requested.

## Confirmation: no artwork or retro theme was added

No image, sprite, icon, background, or other visual asset was added
anywhere in this phase. `apps/web/src/assets/tabletop/` contains only a
`README.md`. No retro Mahjong/Nintendo/Konami/pixel-art styling, no new
fonts, no tile-face redesign, and no animation overhaul were implemented —
every visual change in this phase uses the pre-existing design tokens in
`apps/web/src/styles/global.css` (colors, spacing, radii, shadow) exactly
as they were defined before this phase.

## Confirmation: retention remains OFF

`ENABLE_RETENTION_SWEEP` was not modified in this phase — still `false`
in `.env.example` and explicitly `"false"` in `render.yaml` (Phase 7's
shipping state, untouched). No retention-related source file was touched.

## Confirmation: Phase 9 and later phases not started

No work was done on applying supplied artwork (blocked on a reference that
still does not exist), the retro visual-theme system, tile-face redesign,
sound effects/music, an animation overhaul, drag-algorithm changes beyond
what this phase's own verification required (none), server architecture
changes, database migrations, new API endpoints, notification redesign,
Ready/Start changes, rematch business-rule changes, retention changes,
login accounts, or room search/autocomplete. `packages/engine` and
`packages/bot` were not modified.
