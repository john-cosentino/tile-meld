# Current task — Meld Masters visual refresh

**Active initiative:** Meld Masters visual refresh (rename Tile Meld →
Meld Masters, retro-arcade visual redesign, new smartphone/PWA icon
pipeline). Authoritative plan: `docs/meld-masters-visual-refresh-plan.md`.

**Current checkpoint: Phase 7 — responsive refinement and accessibility —
completed, pending human review.** The plan's full §13.2 acceptance
checklist was executed: skip-link focus reveal, a keyboard tile-selection
bug fix, a narrow-viewport username-overflow fix, 6 touch-target fixes,
6 decorative-emoji `aria-hidden` fixes, a full contrast table, the full
keyboard-only walkthrough, 200%/400% zoom, reduced motion, overflow at
all 7 required viewports, and axe/semantics/live-region audits — all
passing, all documented in `docs/meld-masters-phase-7-summary.md`. Local
e2e verification: chromium, firefox, and mobile-chrome full projects all
**42/42 passed**. Webkit and mobile-webkit are **explicitly deferred** —
see "WebKit deferred" note below; this is a documented, user-approved
scope decision, not an oversight. Real screen-reader checks (NVDA/
VoiceOver/TalkBack) and the Phase 6 real-device checks remain open and
require the user — see `docs/meld-masters-phase-7-summary.md` §39-42.
Public product name: **Meld Masters**. `tile-meld` remains the internal
repository name, package scope, and deployment identifier.

**Implementation state:** see `docs/meld-masters-phase-7-summary.md` for
the complete writeup (findings, fixes, contrast table, browser-project
results, screenshot inventory). Phase 5 (original character portrait
system) is complete — see the Phase history entry below and
`docs/meld-masters-phase-5-summary.md`.

**Machine freeze (2026-07-28, first incident):** an earlier session
working on Phase 7 was interrupted when this machine froze (black screen,
unresponsive, required a hard reboot) partway through an unattended,
detached full 5-project Playwright matrix run left running overnight. A
later session re-verified and completed that in-progress diff; no code
was lost.

**WebKit deferred (2026-07-28, second incident):** during this Phase 7
completion session, running the full 42-test webkit project in one
continuous invocation caused a severe process leak — 29 leftover
`WPEWebProcess` instances, ~17.7GB combined RSS, before being caught and
stopped. Stopping the supervising task killed every leaked process
instantly and memory recovered in full — strong evidence this is the same
mechanism behind the first incident, just run unsupervised for hours that
time. Separately (and unrelated to the leak), one test
(`multi-player.spec.ts`'s 4-player-capacity case) fails reproducibly
(3/3) on webkit specifically — the identical test passes cleanly on
chromium and mobile-chrome, matching this project's own previously-
documented pattern of WebKit-via-Playwright engine-level instability
under concurrent multi-context tests (Phase 1, Phase 4). Per explicit
user decision, webkit and mobile-webkit are deferred rather than run to
completion locally. See `docs/meld-masters-phase-7-summary.md` §6/§35 for
full detail, including a discovered, separately-tracked issue: CI's e2e
matrix job has not run on any push since 2026-07-27 (blocked earlier, at
format-check, by a pre-existing gap unrelated to Phase 7) — CI can't
currently serve as an independent webkit cross-check either. Playwright
runs continue to default to `--project=chromium` for ordinary iteration;
any future full-matrix or webkit-specific run must stay in the foreground,
watched, never detached/unattended, per both incidents above.

**Next phase: Phase 8** (regression testing, visual review, and release
preparation — plan §11), after this Phase 7 checkpoint is reviewed and
approved. Not started. Independently and not blocking Phase 8: real
screen-reader checks, Phase 6's manual Android/iOS/desktop-installed-PWA
device checklists (`docs/meld-masters-phase-6-summary.md` §30-33), fixing
the CI format-check gate, and completing local webkit/mobile-webkit
verification in small batches if full local coverage is wanted later —
none of these were performed or claimed as passed this phase.

## Open blocker

None. Blocker B3 (production portrait assets) is **resolved** — the
approved pack was supplied and integrated in Phase 5.

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
- **Phase 7** (responsive refinement and accessibility) — **completed**,
  2026-07-28, pending human review. Full plan §13.2 acceptance checklist
  executed: skip-link `:focus` reveal; a keyboard tile-selection bug fix
  (dnd-kit's `KeyboardSensor` was swallowing native Enter/Space activation
  — removed); a narrow-viewport username-overflow fix; 6 touch-target
  fixes (buttons/nav links/radio choices, all previously 2-14px short of
  44×44px — one deliberate exception, an inline text link, per WCAG
  2.5.5's own named exception); 6 decorative-emoji `aria-hidden` fixes
  (glyphs kept visible, screen-reader duplication removed); a full
  contrast table (no failures); the full keyboard-only walkthrough (13/13
  items); 200%/400% zoom; reduced motion (new automated test); zero
  horizontal overflow at all 7 required viewports across 11 scenarios (new
  automated 390px multi-route test added); axe/semantics/live-region
  audits (all already correct). Full gate green. Local e2e: chromium
  42/42, firefox 42/42, mobile-chrome 42/42, all clean. Webkit/
  mobile-webkit explicitly deferred (see "WebKit deferred" note above) —
  one test fails reproducibly on webkit specifically (passes on chromium
  and mobile-chrome), and a severe webkit process leak was found and
  safely stopped before it could repeat the original machine-freeze
  mechanism. 18 review screenshots captured. Real screen-reader checks
  (§39-42) not performed — requires the user. See
  `docs/meld-masters-phase-7-summary.md` for the complete writeup.

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

**Phase 7 — Responsive refinement and accessibility** (plan §11) is
**completed, pending human review** — see the Phase history entry above
and `docs/meld-masters-phase-7-summary.md`. **Phase 8** (regression
testing, visual review, release prep) is the next phase after Phase 7 is
approved. Not started.

Independently, and not blocking Phase 8: Phase 6's manual Android/iOS/
desktop-installed-PWA device checklists (`docs/meld-masters-phase-6-summary.md`
§30-33), real screen-reader checks (NVDA/VoiceOver/TalkBack —
`docs/meld-masters-phase-7-summary.md` §39-42), fixing the CI
format-check gate so it can independently verify webkit/mobile-webkit,
and completing local webkit/mobile-webkit verification in small batches
if full local coverage is wanted — none of these require the user's
approval of the Phase 7 checkpoint itself, none were performed or claimed
as passed this phase, and none are preconditions Claude can complete
alone.

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
