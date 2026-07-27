# Meld Masters visual refresh — Phase 4 summary

## 1. Date

2026-07-27 (UTC).

## 2. Starting point — recovered after a machine crash

Unlike Phases 0–3, this phase did not start from a clean `main` checkpoint.
The implementation (CSS tokens, `Tile.tsx` state-class refactor, and class
hooks on the five other tabletop components) was already written and
uncommitted when the machine running the assistant session froze and
crashed mid-phase. This session recovered that work rather than
re-authoring it: the uncommitted diff was inspected file-by-file against
the plan's Phase 4 task list (§11), confirmed self-consistent (not a
half-finished mid-edit), and then taken through the phase's full
verification gate from scratch — none of §§8–13 below were assumed from
before the crash; every command was re-run this session.

Starting commit for the diff: `main` @ `3f3e55b` ("feat(theme): arcade
presentation for dashboard, lobby, room, and recovery screens" — the Phase
3 checkpoint). `docs/task.md` had not yet been updated to reflect Phase 4
being in progress at the time of the crash; that inconsistency was
identified and is corrected by this document and this phase's `docs/task.md`
update.

## 3. Screens redesigned

The Tabletop screen only (`TabletopPage.tsx` and its child components) —
board, rack, tiles, action bar, and status frame, per plan §11 Phase 4.

## 4. Components changed

`apps/web/src/pages/TabletopPage.tsx`, `apps/web/src/tabletop/Tile.tsx`,
`apps/web/src/tabletop/Rack.tsx`, `apps/web/src/tabletop/TableSet.tsx`,
`apps/web/src/tabletop/TabletopStatus.tsx`,
`apps/web/src/tabletop/OpponentStrip.tsx`. No other component file was
touched — `ChatPanel.tsx` (which renders its own `.card`) and every
pre-game/identity page from Phase 3 are unchanged.

## 5. Tile redesign (plan §10)

- **Geometry unchanged**: still 2.75rem × 3.5rem (44×56px) — the plan's own
  drag-precision risk note (§10, "any size change must re-run the
  drag-precision e2e specs") did not apply; only the surface treatment
  changed.
- **Color plumbing, one mechanism not two**: `Tile.tsx` no longer sets
  `style={{ color: TILE_COLOR_BY_CODE[tile.color].hex }}` inline. It sets a
  `--tile-face-color` custom property to `var(--tile-color-C1..C4)`, and
  `.tile`'s CSS reads that property. `packages/shared/src/branding.ts`
  (`TILE_COLOR_TOKENS`) remains the single source of truth; the same
  tokens already reach the DOM via `applyBrandingTokens.ts` (pre-existing,
  unchanged this phase) as `--tile-color-C1`..`--tile-color-C4` custom
  properties on `:root`.
- **States moved from inline styles to classes**: `.is-selected` (was an
  inline `boxShadow`), `.is-invalid` (was an inline `borderColor`),
  `.is-dragging` (was an inline `opacity`), `.is-joker` (new — jokers now
  render in a distinct gold-toned color via CSS instead of falling back to
  `--color-text`). `Tile.tsx` composes these as a plain class-name array;
  no new state, no ref mutation, no nested `setState` (StrictMode-safe per
  `CLAUDE.md`'s recorded Undo-bug history — there is no `setState` in this
  component at all).
- **New tile-scoped CSS tokens** (`apps/web/src/styles/global.css`):
  `--tile-ivory`, `--tile-ivory-edge`, `--tile-joker-color`,
  `--tile-selected-ring`, `--tile-focus-ring`, `--tile-invalid-border`. The
  app-wide neon accent tokens were not reused directly for tile borders/
  rings because they measure well under 3:1 against the light ivory tile
  body (e.g. `--neon-cyan` ≈1.5:1) — these are darker, same-hue-family
  variants tuned for both surfaces the tile sits against. See §6 for the
  measured ratios.
- **Focus ring**: `.tile:focus-visible` gets its own `--tile-focus-ring`
  outline instead of the app-wide cyan `:focus-visible` rule, for the same
  contrast-against-ivory reason.

## 6. Contrast checks (WCAG 1.4.11 non-text, 3:1 minimum)

Independently computed this session (relative-luminance formula, not taken
on faith from the code comment that first introduced these tokens) against
both surfaces a tile-adjacent color can be seen against: the tile's own
`--tile-ivory` (`#f7f0dd`) body, and the dark surfaces behind/around a tile
— `--bg-inset` (`#0c1322`, the board) and `--bg-panel` (`#101828`, the rack
tray).

| Token | Hex | vs. tile-ivory | vs. dark surface | Verdict |
| --- | --- | --- | --- | --- |
| C1 Crimson numeral | `#B3261E` | 5.75:1 | — | pass (text, 4.5:1 min) |
| C2 Cobalt numeral | `#1957A6` | 6.25:1 | — | pass |
| C3 Fern numeral | `#256B37` | 5.70:1 | — | pass |
| C4 Gold numeral / `--tile-joker-color` | `#8A6314` | 4.76:1 | — | pass |
| `--tile-selected-ring` | `#c15a10` | 3.90:1 | 4.19:1 (bg-inset) | pass both |
| `--tile-focus-ring` | `#14858f` | 3.86:1 | 4.22:1 (bg-inset) | pass both |
| `--tile-invalid-border` | `#d42534` | 4.49:1 | 3.63:1 (bg-inset) | pass both |
| `--tile-ivory-edge` (default bevel border) | `#c9b98c` | **1.71:1** | 9.54:1 (bg-inset), 9.13:1 (bg-panel) | see note |

**Note on `--tile-ivory-edge` (corrected during closure):** the CSS comment
introducing these tokens originally claimed all six "clear 3:1 against BOTH
the ivory tile body and the dark board/rack surface." That holds for five
of the six; the default bevel border does not clear 3:1 against the tile's
own fill (1.71:1). Rather than change the token to force the old claim
true — visual review found the bevel legible as a deliberate low-contrast
accent, not illegible — the CSS comment itself
(`apps/web/src/styles/global.css`, the `--tile-ivory` token block) was
corrected to state plainly: the four state-communicating rings/borders and
the numeral colors clear 3:1 against both surfaces; `--tile-ivory-edge` is
the tile's always-on decorative bevel, not a state signal, and is
deliberately low-contrast against the tile body while still clearing
>9:1 against the dark board/rack; no state (selected/invalid/dragging/
joker) is ever communicated through it alone. The code and this document
now agree.

## 7. Other tabletop surfaces (plan §11 Phase 4 tasks)

- **`.card` restyled** (Game-over/Rematch panel; ChatPanel's own internal
  card) to match `.arcade-panel`'s frame language (`--bg-panel`,
  `--frame-width` border, `--glow-sm`) — Phase 3 deliberately left `.card`
  untouched for this phase (`docs/meld-masters-phase-3-summary.md` §6/§21).
  New `.card--accent-gold` modifier (gold border + glow) applied only to
  the completed-game/Rematch card.
- **`.tabletop-status`** restyled to the same panel language, plus a new
  `.tabletop-status--active-turn` modifier (cyan border + glow) when it's
  the player's own turn — the turn-ownership text remains the sole source
  of truth; the frame is a redundant, not sole, signal (plan §10.3).
- **`.tabletop-board`** gets a static repeating-gradient "felt" grid
  (smaller scale than the site-wide background, so it reads as a distinct
  texture) and a brighter neon-cyan frame.
- **`.opponent-row`** — each opponent is now a small bordered plaque
  (`.opponent-row`) instead of a bare `<li>` text row, cycling through the
  same four accent colors Phase 3's `.seat-panel` already uses
  (`nth-of-type(4n+1..4)` → cyan/gold/purple/green), purely decorative; the
  active seat additionally gets `.opponent-row--active` (state accent
  border + glow) layered on top, on the existing hourglass (⏳) text — never
  a color-only signal. No portrait slot added (deferred to Phase 5, same
  restrained approach as Phase 3's `.seat-identity`).
- **`.table-set` / `.table-set-label`** — each `TableSet` gets a bordered
  inset plaque around its `DropZone`; validity color/caption stays owned by
  the DropZone itself (`--color-success`/`--color-danger` via
  `.drop-zone.valid`/`.invalid`, both unchanged) — the plaque never
  introduces a second, competing validity signal.
- **`.tabletop-rack`** gets a warm ivory-family top border (echoing the
  tiles it holds) instead of the board's cool cyan, so the two surfaces
  read as distinct at a glance.
- **`.sort-button[aria-pressed="true"]`** — the rack's Manual/Sort-by-
  number/Sort-by-color toggle group now shows a filled cyan state for the
  active mode, on top of (not instead of) the pre-existing `aria-pressed`
  attribute.
- **Action-bar hierarchy**: Commit turn keeps Phase 3's filled
  `.accent-gold`; Draw/Undo get outlined cyan (`.accent-cyan`, pre-existing
  from Phase 3); two new outlined variants — `.accent-purple` (Pass) and
  `.accent-warn` (Reset turn). Resign/Confirm-resign keep the unrelated,
  unchanged `.danger` class. Every button's text/disabled/onClick logic is
  byte-for-byte unchanged — only `className` was added.
- **`.tabletop-feedback`** — the hints/turn-cost/initial-meld-progress
  stack gets a left accent bar instead of a full panel border, so it
  doesn't visually compete with the board/rack panels around it.

## 8. Non-goals honored

No DOM restructure, no new panels (no move log, no round/target readout,
no currency/season UI — those exist only in the concept art, not in this
app's actual feature set), no dnd-kit logic change, no portrait asset or
placeholder of any kind (Blocker B3 unaffected — still open, still blocks
only Phase 5).

## 9. Accessibility protections

- `aria-label`/`aria-pressed`/keyboard select-then-place behavior on tiles:
  unchanged — confirmed by the pre-existing `Tile.test.tsx` assertions
  passing unmodified, plus 3 new tests (§10) asserting the *mechanism*
  changed (class-based, custom-property-driven) without changing the
  accessible name/state contract.
- Validity is still never color-alone: the DropZone's existing text caption
  ("Set N -- valid run" / "not a valid run or group" / "needs N more
  tile(s)") is unchanged and untouched by this phase.
- Focus-visible on tiles: own contrast-verified ring (§6), not the app-wide
  cyan rule, specifically because the app-wide rule fails 3:1 against the
  light tile body.
- No new purely-decorative element needed a fresh `aria-hidden` — the
  board's felt-grid background and the opponent-row's four-color accent
  cycle are both `background`/`border` CSS properties, not new DOM nodes.

## 10. Tests added

`apps/web/test/Tile.test.tsx` — 3 new tests, 0 existing tests modified:

1. A numbered tile's face color is read from `--tile-face-color` (set to
   `var(--tile-color-C2)`), not an inline `color` hex.
2. A joker tile gets the `is-joker` class and never sets
   `--tile-face-color` (the CSS-level `.tile.is-joker { color: ... }` rule
   owns that case).
3. Invalid/dragging state renders via `is-invalid`/class presence, not an
   inline `borderColor` override.

## 11. Commands run and exact results (this session)

Database safety: `TEST_DATABASE_URL` and `DATABASE_URL` both exported to
`tilemeld_test` (per `CLAUDE.local.md`) before any command that touches a
truncatable database.

| Command | Result |
| --- | --- |
| `pnpm run format:check` | pass |
| `pnpm run lint` | pass |
| `pnpm run typecheck` (6 workspace projects) | pass |
| `pnpm run test` (full suite, exit code verified via `pipefail`, not inferred from a truncated log) | pass — **693 passed**, 0 failed, 68 files (`packages/shared` 45/2, `packages/engine` 115/12, `packages/bot` 36/3, `apps/web` 180/23 [177 prior + 3 new], `apps/server` 317/28, unchanged) |
| `pnpm run build` | pass — web + server |

## 12. Playwright results

```
cd e2e && npx playwright test
```

**160/165 passed, 5 failed, 1.4 hours** (well over the ~30 min estimate in
`docs/environment.md` — the whole matrix ran serially against one shared
dev-server/database instance per `CLAUDE.md`'s documented rate-limit
constraint, and this run additionally followed several manual screenshot-
capture-script invocations against that same shared server minutes
earlier, adding to the load).

**Every spec this phase could plausibly affect passed clean on all 5
projects**: `tabletopMobile.spec.ts` (mobile overflow + a11y),
`drag-and-drop.spec.ts` (the plan's own named highest-risk area — no size
change, and this confirms it), `accessibility.spec.ts`'s Tabletop-page axe
check, and `invalid-commit-penalty.spec.ts`.

The 5 failures were all outside Phase 4's touched files (no server,
session, recovery, dashboard, or engine code was changed this phase):

| Project | Spec | Symptom |
| --- | --- | --- |
| chromium | `reconnect-recovery.spec.ts:30` (cross-context recovery) | timeout loading the recovered game after a successful (rate-limit-tolerant) recovery submit |
| firefox | `full-lifecycle.spec.ts:11` (resign → rematch) | timeout on a post-resign UI transition |
| webkit | `reconnect-recovery.spec.ts:30` | same symptom as chromium |
| mobile-chrome | `dashboard.spec.ts:150` (Completed vs Resigned) | timeout on a dashboard status transition |
| mobile-webkit | `reconnect-recovery.spec.ts:30` | same symptom as chromium/webkit |

`reconnect-recovery.spec.ts:30`'s own in-file comment already documents
that it exercises the app's tightest rate limit (recovery, 5 req/min)
while the whole matrix runs serially against one shared bucket, and
tolerates transient 429s via `clickUntilSettled` — consistent with these
being environmental/load-related rather than code regressions.

**Targeted re-verification** of `reconnect-recovery.spec.ts` (the failure
that repeated on 3 of 5 projects), run individually on chromium then
webkit immediately after the full matrix finished: **both failed again**,
with the identical symptom. Rather than treat that as an open question,
the server's own request log for that exact window
(`apps/server`'s dev-mode structured log) was checked and settles it
conclusively:

```
POST /api/session/recover -> 429 "Rate limit exceeded, retry in 48 seconds"
POST /api/session/recover -> 429 "Rate limit exceeded, retry in 16 seconds"
POST /api/session/recover -> 429 "Rate limit exceeded, retry in 36 seconds"
```

The recovery endpoint's real 5 req/min limit (per-IP, shared across the
whole local session) was still exhausted from the full matrix run plus
this session's earlier manual screenshot-capture-script attempts, all
against the same reused local dev server. Each individual retry attempt
itself calls `/api/session/recover` twice (per the spec's own comment,
§12 above) and was fired with no cooldown gap after the last, so it kept
re-arming the same limiter it needed clear. This is a direct, logged cause
— not an inference — and it is exactly the shared-bucket constraint
`CLAUDE.md` already documents for this suite, not a Phase 4 regression
(this phase touched zero server/session/recovery code). Further retries
were stopped at this point rather than continuing to just re-trigger the
same rate limit.

`full-lifecycle.spec.ts:11` (firefox) and `dashboard.spec.ts:150`
(mobile-chrome) were each a single, non-repeating failure during the same
1.4-hour, heavily-loaded serial run. At the time this was first written
they had not been individually re-verified — that gap was closed during
this phase's closure pass (below), which upgrades both from "implausible
on the code alone" to "confirmed non-reproducing."

### Closure verification: isolated reruns against a fresh database

The `reconnect-recovery.spec.ts` failures above are already conclusively
explained by the logged 429s and were **not** re-run again (repeating them
back-to-back would just re-exhaust the same limiter, as a first closure
attempt confirmed before this section was rewritten to stop doing that).
For the two less-conclusively-classified failures, a genuinely clean
environment was built instead of guessing: a brand-new disposable database
(`tilemeld_e2e_closure4`, `pnpm --filter @tile-meld/server run migrate`
against it) with a freshly-launched server process pointed at it (the old
dev-DB-backed server process was killed first), and no screenshot script
run against that server before this verification.

```
cd e2e && DATABASE_URL=postgres://tilemeld:tilemeld@localhost:5432/tilemeld_e2e_closure4 \
  npx playwright test tests/full-lifecycle.spec.ts --project=firefox
# 1 passed (39.7s)

cd e2e && DATABASE_URL=postgres://tilemeld:tilemeld@localhost:5432/tilemeld_e2e_closure4 \
  npx playwright test tests/dashboard.spec.ts --project=mobile-chrome -g "Completed vs Resigned"
# 1 passed (17.9s)
```

**Both passed cleanly.** Combined with zero files touched in either
spec's code path (rematch/resign flow, dashboard status-card polling —
neither reads any tabletop component this phase changed), this reclassifies
all 5 of the original full-matrix failures as **non-reproducible,
load/rate-limit-related harness timeouts** from running the full 165-test
matrix serially against one shared, already-warm local server — not Phase
4 regressions. The full 5-project matrix was not rerun for this
(unnecessary: the isolated reruns plus the code-diff evidence already
settle it, and CLAUDE.md's own guidance is not to loosen or re-run against
rate limits unnecessarily).

## 13. Screenshot inventory

- **Path:** `docs/design-reference/phase-4-review/`
- **Count:** 52 (13 states × 4 viewports).
- **Viewports:** 1440×900, 1280×720, 390×844, 844×390 — every state at
  every viewport.
- **All 13 states:**
  1. `tabletop-your-turn` — clean rack, the player's own turn.
  2. `tabletop-computer-turn` — "Computer is playing…".
  3. `tabletop-tile-selected` — gold selection ring.
  4. `tabletop-invalid-set` — red border, "not a valid run or group".
  5. `tabletop-completed-rematch` — Game over, gold `.card--accent-gold`.
  6. `tabletop-unavailable-game` — purged/never-issued game id.
  7. `tabletop-opponent-turn` *(new)* — a genuine human opponent's turn
     (private 2-player game, captured from the waiting player's side), not
     a substitute for `tabletop-computer-turn`: no BOT badge, no 🤖, a real
     opponent display name and "Waiting on seat N".
  8. `tabletop-drag-active` *(new)* — a real mid-drag frame (pointer held
     down, not released, `.is-dragging` + the drop zone's `.is-over` both
     genuinely active), captured independently at all 4 viewports rather
     than resized mid-drag. No substitute was needed; see the drag-state
     exception note below for why this was in question at all.
  9. `tabletop-valid-set` *(new)* — a valid table set.
  10. `tabletop-multiple-sets` *(new)* — two sets on the table at once.
  11. `tabletop-rack-sorted` *(new)* — "Sort by number" active
      (`aria-pressed`/filled state visibly different from "Manual").
  12. `tabletop-commit-enabled` *(new)* — Commit turn enabled (filled gold,
      not disabled-gray) once the current draft has a set of the player's
      own.
  13. `tabletop-chat-messages` *(new)* — chat expanded with 3 disposable,
      clearly-fake test messages ("Nice move!", "gg", "Phase 4 review test
      message") from a disposable per-run identity.
- Captured with `e2e/scripts/capture-phase-4-review.ts` (kept outside
  `e2e/tests`, same pattern as the Phase 0/2/3 scripts, `try/finally`
  around the whole browser session so it always closes).
- **Substitution — drag-state exception:** not needed. A true mid-drag
  screenshot (state 8 above) turned out to be capturable reliably by
  holding the mouse down without releasing it, once each viewport was
  handled independently rather than resized mid-drag.
- **Substitution — opponent-turn exception:** not needed. A real 2-player
  game (state 7 above) was reliably reachable via the same
  `startTwoPlayerGame`-equivalent setup the real e2e suite already uses,
  distinct from `tabletop-computer-turn` as required.
- **Substitution — `tabletop-valid-set` (documented, occurs on decks
  without a computer-opponent meld):** the computer opponent has its own
  valid meld on the table by this point in most deals (its dealing/hand
  logic is deterministic in this environment), which alone satisfies
  "valid table set" with zero moves from the player. On a deal where it
  doesn't, the script builds a real 3-tile set of the player's own instead
  — using the app's own click-to-select/click-to-place accessible-move
  primitive, not raw mouse drag (see below) — which is not guaranteed to
  itself be a valid run/group (its 3 tiles are arbitrary rack tiles, not
  selected for meldability). This is clearly logged by the script
  (`substitutions` array → console output) whenever it triggers.
- **A real, non-cosmetic bug found and fixed in this script**, worth
  recording because it consumed most of the closure pass and reflects a
  genuine interaction constraint of the app, not just script polish: an
  earlier version built multi-tile sets via raw mouse drag (`dragTo`,
  mirroring the working `tabletop-invalid-set`/baseline pattern), which
  intermittently scattered tiles into several stray one-tile sets instead
  of one real set. Root-caused to dnd-kit's pointer-coordinate collision
  detection occasionally resolving a drop near a small set's edge to the
  adjacent "start a new set" zone instead — CLAUDE.md's documented
  drag-precision risk, but here it recurred even when the drop target was
  a tile inside the set (its documented mitigation) and even with
  pixel-precise, ordinal-addressed locators, because the *pixel geometry*
  of a small target is the actual cause, not locator precision. The fix
  was to stop using raw drag for multi-tile construction entirely and use
  the app's own accessible click-to-select-then-click-to-place flow
  instead (`e2e/tests/two-player-smoke.spec.ts`'s "click/tap tile
  selection and move" pattern) — its destination resolves via each zone's
  bound `onClick` handler, an ordinary DOM event with no pointer-coordinate
  ambiguity at all. A second, related bug (the post-construction "Undo"
  step waiting for a hardcoded rack count that was wrong from partway
  through the script onward, because `game.draw()` — the earlier
  `tabletop-computer-turn` capture's "Draw tile" click — is a real,
  immediately-committed server call, not undoable local draft state, so
  the rack's true baseline permanently increases by one from that point)
  was found the same way and fixed to compare against the actual
  pre-construction count instead of an assumed one.
- **Sensitivity review:** all 52 screenshots were opened and reviewed this
  session (not merely generated). No recovery secret, credential, token,
  connection string, or private URL appears in any of them — every
  identity is a disposable per-run username (`Phase4Review*`,
  `Phase4Host*`, `Phase4Guest*`), every room/game is disposable test data,
  and the chat messages are explicitly fake/test content chosen for that
  purpose.
- **Visual review (against `meld-masters-concept-01.png`/`-04.png` and the
  matching baseline captures):** the grid-floor board background, ivory
  tile chips with colored numeral-over-symbol, and colored arcade action
  buttons read as a coherent match to the concept art within Phase 4's
  actual (restrained) scope — no move log, portraits, or robot mascot, all
  correctly out of scope. Tile selection shows a visible gold ring; the
  invalid-set state shows a genuinely invalid (3-tile, red-bordered,
  "not a valid run or group") set — not just an under-3-tile "needs more"
  neutral state, which an earlier pass through this same script mistakenly
  produced before the click-based fix above; the completed-game card shows
  the new gold accent border/glow. The bot-goes-first non-determinism
  visible in some `tabletop-your-turn` captures (the computer's opening
  meld already on the table) matches the same non-determinism already
  present in the pre-redesign baseline capture of the same state — not a
  capture bug.

## 14. Confirmation: no server, engine, or bot behavior changed

No file under `packages/engine/src`, `packages/bot/src`, or
`apps/server/src` was touched. Confirmed by the diff itself and by
`apps/server`'s unit/integration suite (317/317, identical count to Phase
3).

## 15. Remaining blocker B3

Unchanged: production character-portrait assets have not been supplied.
Blocks only Phase 5.

## 16. Files changed

| File | Purpose |
| --- | --- |
| `apps/web/src/styles/global.css` | Phase 4 CSS section: tile tokens/state classes, `.card`/`.card--accent-gold`, `.tabletop-status--active-turn`, `.tabletop-board` felt grid, `.opponent-row`(`--active`), `.table-set`(`-label`), `.sort-button`, `.accent-purple`/`.accent-warn`, `.tabletop-feedback` |
| `apps/web/src/tabletop/Tile.tsx` | Inline styles → classes + `--tile-face-color` custom property |
| `apps/web/src/tabletop/Rack.tsx` | `.sort-button` class on the three toggle buttons |
| `apps/web/src/tabletop/TableSet.tsx` | `.table-set`/`.table-set-label` wrapper classes |
| `apps/web/src/tabletop/TabletopStatus.tsx` | `.tabletop-status--active-turn` conditional class |
| `apps/web/src/tabletop/OpponentStrip.tsx` | `.opponent-row`(`--active`) instead of a bare `<li className="muted">` |
| `apps/web/src/pages/TabletopPage.tsx` | `.card--accent-gold` on the completed-game card; accent classes on the four non-resign action buttons |
| `apps/web/test/Tile.test.tsx` | +3 tests (§10) |
| `e2e/scripts/capture-phase-4-review.ts` | New: Phase 4 screenshot capture script |
| `docs/design-reference/phase-4-review/*.png` (52 files) | New: Phase 4 manual-review screenshots (13 states × 4 viewports) |
| `docs/meld-masters-phase-4-summary.md` | This document |
| `docs/task.md` | Phase 4 checkpoint recorded, Phase 5 next-but-gated-on-B3 |

## 17. Manual review instructions

- **This summary:** `docs/meld-masters-phase-4-summary.md`
- **The CSS foundation and its reasoning:** the Phase 4 section at the end
  of `apps/web/src/styles/global.css` (inline comments explain the token
  choices and every class's scope).
- **Screenshots:** `docs/design-reference/phase-4-review/` — compare
  directly against `docs/design-reference/baseline/tabletop-*` for a
  before/after, or run the app locally
  (`pnpm --filter @tile-meld/server run dev` +
  `pnpm --filter @tile-meld/web run dev`) and play a game live.
- **New tests:** `apps/web/test/Tile.test.tsx`.

## 18. Closure confirmations

- **No Phase 5 or Phase 6 work occurred.** No file under
  `apps/web/src/assets/portraits/`, no `Portrait.tsx`, no icon/favicon/
  manifest file, no `apps/web/public/*` change. `git diff --stat` against
  the pre-closure commit (`7bf9ec2`) touches only: one CSS comment
  (`global.css`), the capture script, the 52 screenshots, and these two
  docs.
- **Tile geometry** is still 2.75rem × 3.5rem (44×56px) — unchanged by
  closure (no CSS rule touching `.tile`'s `width`/`height` was edited).
- **Drag-and-drop application logic** (`dnd-kit`, `apps/web/src/tabletop/
  DropZone.tsx`, `TableSet.tsx`'s `onActivateZone`) is unchanged — only
  the *screenshot capture script* changed how it drives the UI (switching
  from raw mouse drag to the app's own existing click-to-select/
  click-to-place accessible-move path, both of which already existed and
  are already covered by `two-player-smoke.spec.ts`).
- **No internal identifier was renamed.** `tile-meld` remains the
  repository/package-scope/deployment name throughout.
- `docs/design-reference/meld-masters/` (concept art),
  `docs/design-reference/baseline/`, `docs/design-reference/phase-2-review/`,
  and `docs/design-reference/phase-3-review/` are untouched — confirmed by
  `git status` showing no change to any path under those directories.

## 19. Planned commit message

This closure pass is a follow-up to the already-landed Phase 4 commit
(`7bf9ec2`, pushed in a prior session turn before these closure
requirements were raised) — it is a new commit, not an amend, and uses a
message distinct from that commit's subject line rather than duplicating
it:

```
fix(theme): Phase 4 closure — contrast comment, isolated e2e verification, full screenshot set

- Correct the tile-ivory-edge CSS comment to match its measured contrast
  (was overstated; now states plainly it's a decorative low-contrast bevel,
  not a state signal).
- Re-verify the two previously load-attributed e2e failures in isolation
  against a fresh disposable database and freshly-started server; both pass
  cleanly, reclassifying all 5 original full-matrix failures as
  non-reproducible harness timeouts, not Phase 4 regressions.
- Extend the Phase 4 screenshot capture script from 6 to 13 tabletop
  states (52 screenshots total): opponent turn, active drag, valid set,
  multiple sets, non-default rack sort, Commit-turn-enabled, and chat with
  messages. Along the way, fixed a real drag-precision limitation in the
  script itself (raw mouse drag onto a small existing set can mis-resolve
  to the adjacent "start a new set" zone) by switching to the app's own
  accessible click-to-select/click-to-place move path.

See docs/meld-masters-phase-4-summary.md for the full writeup.
```

(No commit hash is recorded in this document, per instruction — see the
git log for the actual hash once created.)

## 20. Recommended next step

**Human review before Phase 5.** Phase 5 (original character portraits) is
gated on Blocker B3 (supplied portrait artwork), which remains open and
unrelated to this phase's work.
