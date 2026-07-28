# Current task — Meld Masters visual refresh

**Active initiative:** Meld Masters visual refresh (rename Tile Meld →
Meld Masters, retro-arcade visual redesign, new smartphone/PWA icon
pipeline). Authoritative plan: `docs/meld-masters-visual-refresh-plan.md`.

**Current checkpoint: Phase 5 — original character portrait system —
completed, pending human review.** Public product name: **Meld Masters**.
`tile-meld` remains the internal repository name, package scope, and
deployment identifier.

**Implementation state:** the approved portrait pack (8 rival portraits +
1 fallback, found already placed under `docs/design-reference/
meld-masters/` at the start of this phase) is integrated into the Waiting
Room seat panels and the Tabletop opponent strip via a new deterministic
registry (`apps/web/src/branding/portraits.ts`) — `portraitForSeat(seatIndex,
isComputer)` is a pure function (roster-by-modulo for human seats, fallback
for computer seats and any out-of-range index), so a seat's portrait never
changes mid-game and nothing is stored or persisted. Production copies were
mechanically resized from the ~22.5 MB delivered originals down to ~285.5
KB total (`scripts/derive-portraits.py`); the `docs/` originals were never
modified (checksums verified unchanged). Both portraits are `alt=""`
(decorative; correctly gets an implicit ARIA role of `presentation`, not
`img`) — every game-state fact (name, ready state, BOT badge, tile count,
turn) stays in text exactly as before. Full gate green (724 tests, 10
new); targeted Playwright (accessibility + vs-computer + full-lifecycle +
tabletopMobile, chromium + mobile-webkit) 22/22, including both the
Waiting Room and Tabletop axe checks passing clean on both engines with
the new images present. See `docs/meld-masters-phase-5-summary.md` for the
full writeup, including two documented deviations from the original asset
contract (delivered portraits are 1024×1536/2:3, not 512×512/1:1; no
dedicated bot portrait was supplied, so computer seats use the fallback).

No Phase 7 (responsive/accessibility) or Phase 8 work occurred. **Next
unblocked phase after Phase 5 is approved: Phase 7** (responsive
refinement and accessibility — plan §11). Not started. Phase 6's manual
Android/iOS/desktop-installed-PWA device checklists (`docs/
meld-masters-phase-6-summary.md` §30-33) remain open wherever the user
has not yet performed them — unaffected by, and independent of, Phase 5.

## Open blocker

None. Blocker B3 (production portrait assets) is **resolved** — the
approved pack was supplied and is now integrated (Phase 5, above).

(Blockers B1 — logo master — and B2 — portrait-correction reference
identity — were resolved 2026-07-26; see
`docs/meld-masters-visual-refresh-plan.md` §2.)

## Phase history

- **Phase 0** (baseline and reference audit) — committed `cc307c2`
  (2026-07-26), with one known, pre-existing e2e gate gap documented and
  explicitly authorized by the user. See `docs/meld-masters-phase-0-summary.md`.
- **Phase 1, Checkpoint A** (e2e test-isolation fix) — committed `15bc370`
  (2026-07-26). Root cause of the `public-lobby.spec.ts` gap from Phase 0
  was investigated further and found to differ from the original Phase 0
  hypothesis: it is not about an earlier spec leaving a room behind, but
  about this spec's OWN prior successful runs leaving a room with exactly
  one free seat, which a later run's Quick Join can legitimately complete
  to capacity — correctly triggering the app's real, shared
  auto-start-on-capacity behavior. Fixed by widening the test's accepted
  outcome to both real states production can produce, not by changing any
  application code. Verified via `--repeat-each=10` (including against an
  already-polluted database) and the full chromium project, both 100%
  clean. See `docs/meld-masters-phase-1-summary.md`.
- **Phase 1, Checkpoint B** (public rename) — committed `c48ddfc`
  (2026-07-26/27). Full gate green; chromium+mobile-chrome verified
  earlier, full 5-project matrix run twice showed persistent WebKit-only
  timeout flakiness (never reproducible in isolation, zero failures in
  chromium/firefox/mobile-chrome across both runs) — reported to the user
  in full, who explicitly authorized committing with it documented rather
  than requiring further multi-hour investigation. See
  `docs/meld-masters-phase-1-summary.md`.
- **Phase 2** (design tokens and global arcade foundation) — completed
  2026-07-27. All three previously-pending decisions were approved by the
  user and implemented: dark-only arcade theme (D2), self-hosted
  Silkscreen display font (D5), and a decorative header monogram beside
  the live-text wordmark. Full design-token system, site-wide static grid
  background, `.arcade-panel` foundation, and restyled header/nav
  implemented. Full gate green; chromium+mobile-chrome e2e 66/66 (includes
  every existing axe and mobile-overflow check, none weakened). 12 review
  screenshots captured. See `docs/meld-masters-phase-2-summary.md` for the
  full contrast-ratio table, font/monogram provenance, and file list.
- **Phase 3** (dashboard, lobby, room, and recovery presentation) —
  completed 2026-07-27. Applied the Phase 2 arcade system to all seven
  pre-game/identity screens: new `.page-title`/`.panel-title` heading
  classes, `.arcade-action` dashboard buttons (cyan/gold/purple/green),
  `.room-row` browser rows with a new "Open Rooms" panel heading,
  `.arcade-choice` segmented radios (native inputs, `:has()`-driven, no
  parallel selection mechanism), `.seat-panel` waiting-room member rows
  (per-seat accent, ready/waiting state, structured for a future Phase 5
  portrait with no placeholder art), and `.code-readout` for every
  recovery/room code (plain monospace, no glow/letter-spacing). Every
  panel/card uses a new `.arcade-panel` class, never `.card` itself, so
  `.card` (shared with ChatPanel's Phase-4 tabletop usage) was never
  touched. Full gate green (177 web tests, 3 new); chromium+mobile-webkit
  targeted e2e 38/38 clean on the first attempt (all 7 axe checks × 2
  projects, plus mobile-overflow) — no WebKit flakiness this run. 28
  review screenshots captured. See `docs/meld-masters-phase-3-summary.md`.
- **Phase 4** (tabletop, rack, tiles, controls, and game status) —
  completed 2026-07-27. Tile visuals moved from inline styles to CSS
  classes (`.is-selected`/`.is-invalid`/`.is-dragging`/`.is-joker`) and a
  `--tile-face-color` custom property sourced from the existing
  `--tile-color-C1..C4` tokens (`packages/shared`'s `TILE_COLOR_TOKENS`
  stays the single source of truth); tile geometry unchanged (44×56px, so
  no drag-precision re-tuning was needed). `.card` restyled (plus a new
  `.card--accent-gold` for the completed-game/Rematch panel — the first
  change to `.card` since Phase 3 deliberately left it alone) and
  `.tabletop-status`/`.tabletop-board`/`.tabletop-rack`/`.opponent-row`/
  `.table-set`/action-bar accent classes added. Full gate green (693
  tests, 3 new, up from 690); full 5-project e2e matrix 160/165 passed —
  the 5 failures are all outside this phase's files (recovery/dashboard/
  lifecycle, not tabletop) and one was root-caused directly via the
  server's own request log to the local dev server's shared recovery-
  endpoint rate limit (429s), not a code regression; every tabletop-
  specific spec (drag-and-drop, mobile overflow, tabletop axe) passed
  clean on all 5 projects. 24 review screenshots captured. This phase's
  implementation was originally written in a prior session that ended in
  a machine crash before verification or commit; the following session
  recovered, verified, and completed it. See
  `docs/meld-masters-phase-4-summary.md`.
- **Phase 6** (logo derivatives, favicon, PWA icons, manifest, and browser
  metadata) — completed 2026-07-27. Full icon pipeline mechanically
  derived from the approved logo master via a new deterministic script
  (`scripts/derive-icons.py`) — standard/maskable PWA icons, Apple touch
  icon, favicon.ico (16/32/48) and a self-contained raster-backed
  favicon.svg — wired into `manifest.json`, `index.html`, and `sw.js`; old
  root icon paths kept serving for one transitional release. Theme/
  background color changed from the old Tile Meld blue (`#2f6fb4`) to the
  Phase 2 arcade navy (`#0a0e1a`), single-sourced via a new `THEME_COLOR`
  shared constant with a consistency test against `--bg-page`. Full gate
  green (714 tests, 21 new: `manifestIcons.test.ts` + 1
  `brandConsistency.test.ts` addition); production-server static-asset
  check confirmed every new path serves with correct content-type and
  byte-identical bytes; Chromium e2e 32/33 (the one failure is the
  already-documented Phase 4 local rate-limit artifact, not a Phase 6
  regression). Phase 6 does not require the full 5-project matrix (no
  interaction-geometry change) per the plan. Manual Android/iOS/desktop-
  installed-PWA verification still requires the user with real devices —
  not claimed as passed. See `docs/meld-masters-phase-6-summary.md`.
- **Phase 5** (original character portrait system) — completed
  2026-07-27. The approved portrait pack (8 rivals + 1 fallback) was
  found already placed under `docs/design-reference/meld-masters/` at
  the start of this phase, resolving Blocker B3. Integrated via a new
  deterministic registry (`apps/web/src/branding/portraits.ts`) into the
  Waiting Room seat panels and Tabletop opponent strip — `alt=""`
  decorative images only, every game-state fact stays in text. Production
  copies mechanically resized from ~22.5 MB to ~285.5 KB total
  (`scripts/derive-portraits.py`); `docs/` originals confirmed unmodified.
  Two documented deviations from the original asset contract: delivered
  portraits are 1024×1536/2:3 (not 512×512/1:1), resolved with
  `object-fit: cover` + top-anchored crop; no dedicated bot portrait was
  supplied, so computer seats use the fallback. Full gate green (724
  tests, 10 new); targeted Playwright (accessibility + vs-computer +
  full-lifecycle + tabletopMobile, chromium + mobile-webkit) 22/22,
  including clean Waiting Room and Tabletop axe scans on both engines. 24
  review screenshots captured. See `docs/meld-masters-phase-5-summary.md`.

## Approved decisions (implemented in Phase 2)

Previously recorded as pending; all three were approved by the user and
implemented — see `docs/meld-masters-phase-2-summary.md` §4–13 for details:

1. **Dark-only theme** — implemented. The `prefers-color-scheme: dark`
   media-query override was removed; `:root` holds the arcade dark values
   directly, so both OS preferences resolve identically. No theme toggle.
2. **Silkscreen display font** — implemented. Self-hosted from the
   official Google Fonts repository, SIL OFL 1.1, used only for the
   wordmark/headings/panel titles/nav labels — never body text, forms,
   chat, tile numbers, or recovery codes.
3. **Header monogram** — implemented. A 96×96 decorative derivative of the
   approved logo master sits beside the live-text wordmark; `alt=""`; the
   header link's accessible name remains exactly "Meld Masters" (test-verified).

## Next phase

**Phase 7 — Responsive refinement and accessibility** (plan §11) is the
next unblocked phase once Phase 5 is approved. Not started. No later phase
(Phase 8) was started automatically.

Independently, Phase 6's manual Android/iOS/desktop-installed-PWA device
checklists (`docs/meld-masters-phase-6-summary.md` §30-33) still require
the user — not automatically satisfied, not a precondition Claude can
complete alone, and not something Phase 5 depended on or resolved.

Phase 7 is gated on this Phase 5 checkpoint being reviewed and approved.

## Structure to use when work begins on a new, unrelated task

Replace everything above with:

- **Objective** — one sentence.
- **Inputs** — documents and files the work depends on.
- **Deliverables** — what must exist when this is done.
- **In scope** — explicit list.
- **Out of scope** — explicit list.
- **Constraints** — versions, purity boundaries, contracts not to break.
- **Acceptance criteria** — verifiable statements.
- **Manual verification steps** — exact commands and expected output.

## Checklist for starting the next task

1. `git status` (expect clean on `main`) and `git --no-pager log --oneline -5`.
2. Confirm PostgreSQL is up and migrated.
3. Run the full gate once to confirm a green baseline **before** changing code —
   with `TEST_DATABASE_URL` set, per the warning in `docs/environment.md`.
4. Branch for the new work; implement one reviewable change at a time.
5. Keep `packages/engine` and `packages/bot` pure, and the server authoritative.
6. For anything touching draft/undo, drag-and-drop, or E2E setup, re-read the
   "Areas that require special care" section of `CLAUDE.md` first.
7. Run the gate plus the relevant E2E specs before committing. Stop at the phase
   checkpoint for manual review before starting the next phase.

## Candidate work

Surfaced on 2026-07-25. None selected or prioritised.

**Consistency:**

1. Resolve the retention discrepancy — `docs/changes.md` specifies 4-hour
   deletion of completed games; the implementation is 48 hours (`ac9c2a3`).
   Correct whichever is wrong.

**Verification gaps** (from `docs/current-state.md`):

2. ~~Investigate and fix the order-dependent `public-lobby.spec.ts` Quick
   Join failure~~ **Resolved 2026-07-26** — see "Phase history" above and
   `docs/meld-masters-phase-1-summary.md`. The real root cause (a leftover
   room from the spec's own prior run, not an earlier spec) differed from
   Phase 0's original hypothesis; fixed in the test only, committed
   `15bc370`.
3. Confirm what commit the Render service is actually serving, and whether it is
   healthy.

**Deferred feature work** — clean seams, nothing started:

4. A stronger computer opponent (search, opponent modelling, difficulty levels).
   The current bot is deliberately basic and is "just another caller of the pure
   engine", so a smarter one is additive.
5. Multiple or mixed bots, bots in 3–4 player games, computer-vs-computer. V1
   intentionally excludes these; the domain leaves seams but nothing is built.
6. Accounts / Google sign-in, email notifications, moderation, lifetime stats
   and leaderboards, horizontal scale, a dedicated worker — see
   `docs/opus-implementation-plan.md` §14.2.
