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

**Note on `--tile-ivory-edge`:** the CSS comment introducing these tokens
claims all six "clear 3:1 against BOTH the ivory tile body and the dark
board/rack surface." That holds for five of the six; the default bevel
border does not clear 3:1 against the tile's own fill (1.71:1) — it reads
as a deliberate low-contrast bevel accent (matching the "physical chip"
styling goal), not a state-communicating boundary. This does not leave the
tile's boundary imperceptible: the tile as a whole (ivory fill against the
dark board/rack) measures 9.1–9.5:1, so the interactive element's boundary
is unambiguous regardless of the bevel's own contrast. Flagging this as a
minor, non-blocking discrepancy between the code comment's blanket claim
and the actual measured value, per this project's evidence-discipline
standard, rather than silently repeating the claim.

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
1.4-hour, heavily-loaded serial run; they were not individually
re-verified in isolation. Both are far outside this phase's changed files
(rematch/resign flow and dashboard status-card polling — neither reads
any tabletop component), so a Phase 4 regression is implausible on the
code alone, but that inference is weaker than the recovery finding above
since it isn't backed by an isolated rerun or a matching server-log root
cause. Flagging this distinction rather than presenting both at the same
confidence level.

## 13. Screenshot inventory

- **Path:** `docs/design-reference/phase-4-review/`
- **Count:** 24 (6 states × 4 viewports)
- **States:** `tabletop-your-turn`, `tabletop-computer-turn`,
  `tabletop-tile-selected`, `tabletop-invalid-set`,
  `tabletop-completed-rematch`, `tabletop-unavailable-game` — the same six
  tabletop states `docs/design-reference/baseline/` captured pre-redesign,
  so each has a direct before/after pair.
- **Viewports:** 1440×900, 1280×720, 390×844, 844×390.
- Captured with `e2e/scripts/capture-phase-4-review.ts` (kept outside
  `e2e/tests`, same pattern as the Phase 0/2/3 scripts). The script's
  first run crashed on an uncaught `TimeoutError` (missing the
  "click the Meld Masters home link before looking for Play vs Computer"
  step every prior capture script has) and, because the crash happened
  before `browser.close()`, orphaned a headless Chromium that kept the
  Node process alive indefinitely rather than exiting — fixed by adding
  the missing navigation step and wrapping the whole run in `try/finally`
  so `browser.close()` always executes, even on a setup failure.
- **Visual review (this session, against `meld-masters-concept-01.png` and
  `-04.png`, and against the matching baseline captures):** the grid-floor
  board background, ivory tile chips with colored numeral-over-symbol, and
  colored arcade action buttons read as a coherent match to the concept
  art within Phase 4's actual (restrained) scope — no move log, portraits,
  or robot mascot, all correctly out of scope. Tile selection shows a
  visible gold ring; the invalid-set state shows the existing red-dashed
  DropZone border plus its unchanged text caption; the completed-game card
  shows the new gold accent border/glow. The bot-goes-first non-determinism
  visible in `tabletop-your-turn` (the computer's opening meld already on
  the table) matches the same non-determinism already present in the
  pre-redesign baseline capture of the same state — not a capture bug.

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
| `docs/design-reference/phase-4-review/*.png` (24 files) | New: Phase 4 manual-review screenshots |
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

## 18. Recommended next step

**Human review before Phase 5.** Phase 5 (original character portraits) is
gated on Blocker B3 (supplied portrait artwork), which remains open and
unrelated to this phase's work.
