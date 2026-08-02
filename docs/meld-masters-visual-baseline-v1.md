# Meld Masters — Visual Baseline v1

> **SUPERSEDED 2026-08-01.** The glossy-asset composition this document
> locks was replaced wholesale by the concept-art fidelity rebuild
> (`feature/arcade-pixel-kit`) — see `docs/arcade-visual-kit.md` and the
> 2026-08-01 entry in `docs/decisions.md`. Kept as the historical record
> of the approach it describes; its "deferred concept-fidelity work" list
> is what the rebuild delivered.

**Status (historical): approved and locked.** This document records the tabletop's
visual composition as of commit `962c666` (branch
`feature/tabletop-arcade-integration`) as the stable foundation for the
production/stabilization phase that follows it. It is a snapshot of
decisions already made, not a design proposal — see [Deferred
concept-fidelity work](#deferred-concept-fidelity-work) for what is
intentionally still open.

Do not casually change anything in [Locked
decisions](#locked-decisions) below. If a change to one of them is
genuinely required to fix a defect, say so explicitly and record the
change here afterward.

## Layout at each breakpoint

### Desktop (≥861px)

Three-region CSS Grid (`grid-template-areas`, `.tabletop-arcade` in
`apps/web/src/styles/global.css`):

- **Left rail** (`.tabletop-competitors`, 240–300px) — vertical
  competitor cards: self first, then each opponent. Horizontal card
  layout (portrait left, name/tile-count right), name truncates with an
  ellipsis before it can overflow the frame.
- **Center column** (`.tabletop-primary`) — turn status welded to the
  board welded to the rack (no gap), the dominant visual element.
- **Right rail** (`.tabletop-rail` → `.tabletop-info-rail`, 240–300px)
  — meld progress / hint / mascot tip, then the collapsed-by-default
  chat toggle.
- **Full-width action bar** below all three columns: a muted utility
  cluster (Undo / Reset Turn / Resign) and the dominant primary cluster
  (Draw / Pass / Commit Turn), grouped together at the trailing edge.
  Commit Turn is visibly larger with a gold glow.

### Phone portrait (≤860px, portrait)

Single column, reordered via `grid-template-areas` (not DOM order):
competitor strip → board+rack → action bar → info rail (feedback then
chat). Actions sit directly under the rack — reaching Draw/Pass/Commit
never requires scrolling past chat. Header nav is a 3-column/2-row grid,
every label fully visible (wraps within its cell rather than clipping).

### Phone landscape (≤860px, landscape)

True 2-column composition: gameplay column (board/rack/actions) beside
a compact rail column (competitors + info, tightly stacked via a
`.tabletop-rail` wrapper that's `display:contents` on every other
breakpoint). Header nav collapses to one row (5 columns) since landscape
is wide even though short. Masthead wordmark and top padding are
reduced so the board appears early in the viewport.

## Approved production assets in use

All under `apps/web/src/assets/tabletop-production/`, sourced from
`docs/design-reference/chatgpt/` (the approved ChatGPT-generated
production batch):

| Asset | Role |
|---|---|
| `masthead/wordmark-meld-masters.png` | Page wordmark |
| `board/board-frame-{desktop,phone-portrait,phone-landscape}.png` | Board frame, one per breakpoint |
| `rack/rack-frame.png` | Rack border (nine-slice) |
| `competitors/competitor-card-frame.png` | Competitor card frame, tinted per seat via `mix-blend-mode: color` |
| `competitors/competitor-active-overlay.png` | Active-turn glow overlay |
| `sidebar/sidebar-panel-frame.png` | Status/feedback panel background |
| `sidebar/countdown-screen-bezel.png` | Deadline countdown bezel |
| `sidebar/mascot-tip-icon.png` | Feedback-area mascot icon |
| `actions/action-plate-{cyan,purple,gold}.png` | Draw/Pass/Commit button plates (nine-slice) |
| `actions/action-plate-states.png` | Pressed-state overlay |
| `actions/action-icons-illustrated.svg` | Draw/Pass/Sort/Commit icon sprite |
| `chrome/footer-chrome-icons.svg` | Footer lightning/stats icons |

## Latest approved screenshots

`docs/design-reference/tabletop-arcade-integration-review/`:

- `tabletop-arcade--desktop-1440x900.png`
- `tabletop-arcade--phone-portrait-390x844.png`
- `tabletop-arcade--phone-landscape-844x390.png`
- `tabletop-actions-closeup--desktop.png` (disabled action states)
- `tabletop-actions-enabled--desktop.png` (Draw+Commit enabled via a real valid meld)
- `tabletop-commit-hover--desktop.png` / `tabletop-commit-focus--desktop.png`

## Locked decisions

Do not casually change these. They were arrived at across several
review passes, most recently the visual-polish pass at commit
`962c666`.

- The 3-region desktop grid, the reordered single-column portrait flow,
  and the 2-column landscape flow — all via CSS `grid-template-areas`
  swaps on the same markup, no JS, no duplicated components.
- Chat starts collapsed on every breakpoint and lives in the compact
  info rail, never the primary column.
- Commit Turn is the single most visually dominant control (larger,
  gold, glowing) — Draw/Pass are secondary; Undo/Reset/Resign are
  muted utility controls grouped together, never equal-weight with
  Commit.
- Competitor names truncate with CSS ellipsis (never clip the frame);
  the meta line (tile count/status) never truncates.
- The mobile header nav is a deterministic grid (never a
  horizontally-scrolling row with no affordance) so no label is ever
  partially clipped.
- All production art is used as background/border-image layers only —
  every piece of live game data (names, scores, tile counts, timers,
  chat, move state) is real DOM text, never baked into an image.
- 44px minimum touch target on every interactive control, including the
  muted utility buttons.

## Approved production baseline vs. future concept-fidelity work

**This document governs the production baseline** — correctness,
responsiveness, identity, and use of the approved assets. It is the
floor, not the ceiling: the interface does not yet match the original
concept art's density, lighting, and polish, and isn't expected to at
this stage.

A **later, dedicated concept-fidelity phase** is where that gap gets
closed deliberately, against direct visual comparison with the concept
art — not opportunistically during unrelated stabilization work.

## Deferred concept-fidelity work

Recorded so it isn't forgotten, not scheduled:

- Tighter panel-to-panel integration (the cabinet reads as assembled
  regions today, not yet as one seamless machined console).
- Richer competitor-card presentation (the concept's per-player color
  identity, deeper card treatment beyond the current tint overlay).
- Improved live board and meld styling (meld/set presentation is
  functional plaques today, not yet the concept's more tactile felt/
  chip look).
- Stronger typography consistency across panel labels.
- Denser, more substantial information rails (the current info rail is
  intentionally lean; the concept's rails carry more chrome).
- More cohesive action-bar presentation (icon/plate proportions could
  still move closer to the concept's exact cabinet-button look).
- Refined lighting, depth, shadows, highlights, and any motion design.
- A direct, side-by-side screenshot comparison pass against the
  original concept art (`docs/design-reference/meld-masters/`), which
  has not been done rigorously — comparisons so far have been against
  the composition's own internal consistency, not pixel/region-level
  concept fidelity.

## Known visual limitations, intentionally deferred

- Plate buttons (Draw/Pass/Commit) have no dedicated hover treatment
  beyond the cursor change — only `:active` (pressed) and
  `:focus-visible` have distinct styling. Pre-existing, unchanged by
  the last two passes.
- The board's `background-size: 100% 100%` strategy can visibly
  elongate the frame's taper on an unusually tall board (many stacked
  sets) — an accepted trade-off documented since the original asset
  integration; drop-target geometry is unaffected.
