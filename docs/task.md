# Current task — Meld Masters visual refresh

**Active initiative:** Meld Masters visual refresh (rename Tile Meld →
Meld Masters, retro-arcade visual redesign, new smartphone/PWA icon
pipeline). Authoritative plan: `docs/meld-masters-visual-refresh-plan.md`.

**Current checkpoint: CI security-gate restructuring — completed,
pending human review.** A small, focused follow-up on top of the
dependency remediation checkpoint (below): `.github/workflows/ci.yml`'s
`security` job now runs `pnpm audit --prod --audit-level=high` as a
**blocking** step and a separate `pnpm audit --dev --audit-level=high`
as a **non-blocking, always-visible** step
(`continue-on-error: true`), so the documented dev-only
`brace-expansion@1.1.16` finding stays logged in every CI run without
silently skipping the Docker build/Trivy scan the way the previous
single combined audit step did. No dependency version or application
code changed — workflow structure and documentation only. See
`docs/meld-masters-dependency-security-summary.md`'s addendum for the
full writeup.

**Before that: dependency security remediation — completed, pending
human review.** A focused follow-up on top of the completed Phase 8
checkpoint (below). Fresh `pnpm audit` found 5 vulnerabilities (4 high,
1 moderate); 4 resolved (`@fastify/static` 10.1.0→10.1.2, `find-my-way`
9.6.0→9.7.0, `react-router-dom`→`react-router` 8.3.0 — the only
available fix, no patched 7.x exists, verified narrow before applying),
1 documented and left unresolved (`brace-expansion@1.1.16`, dev-only
eslint toolchain, no production exposure, already the latest release of
its maintained line — not silently suppressed). Full local gate green;
local e2e chromium/firefox/mobile-chrome 42/42 each; a live
path-traversal probe against the compiled server confirmed the
`@fastify/static` fix is actually effective. See
`docs/meld-masters-dependency-security-summary.md` for the complete
writeup. Public product name: **Meld Masters**. `tile-meld` remains the
internal repository name, package scope, and deployment identifier.

**Before that: Phase 8 — regression testing, visual review, and release
preparation — completed, pending human review.** This was the plan's
final phase (§11). The visual refresh implementation itself (Phases 0–8)
is functionally complete. Full repository gate green; local e2e
(chromium/firefox/mobile-chrome) 42/42 each; CI independently confirmed
chromium/firefox/webkit/mobile-chrome all green (mobile-webkit
CI-inconclusive — infrastructure interruptions, not a test failure, see
below); production-build static-asset serving verified; branding/
obsolete-artwork sweep clean; 71 final review screenshots captured and
compared against the concept references.

**Implementation state:** see `docs/meld-masters-dependency-security-summary.md`
and `docs/meld-masters-phase-8-summary.md` for the complete writeups and
`docs/current-state.md` for the current verified-state snapshot. Phase 7
(responsive refinement and accessibility) is complete — see the Phase
history entry below and `docs/meld-masters-phase-7-summary.md`.

**Machine freeze (2026-07-28, first incident):** an earlier session
working on Phase 7 was interrupted when this machine froze (black screen,
unresponsive, required a hard reboot) partway through an unattended,
detached full 5-project Playwright matrix run left running overnight. A
later session re-verified and completed that in-progress diff; no code
was lost.

**WebKit local limitation (2026-07-28, second incident, reconfirmed in
Phase 8):** running the full webkit (or mobile-webkit) Playwright project
in one continuous local invocation has twice caused severe resource
problems on this machine — once the machine-freezing incident above, and
once (during Phase 7 completion) a reproducible ~17.7GB `WPEWebProcess`
leak caught and safely stopped mid-run. Stopping the supervising task
both times killed every leaked process instantly and memory recovered in
full. Chromium, Firefox, and Mobile Chrome show no equivalent issue.
**CI (GitHub Actions) is the authoritative cross-engine verification
environment for WebKit/Mobile WebKit going forward** — during Phase 8,
CI confirmed chromium/firefox/webkit/mobile-chrome all pass; mobile-webkit
CI runs remain inconclusive (3 attempts, all CI-infrastructure
interruptions — a 30-minute job timeout once, an external runner
shutdown signal twice — never a real test assertion failure). Playwright
runs continue to default to `--project=chromium` for ordinary local
iteration; any future full-matrix or webkit-specific run must stay in
the foreground, watched, never detached/unattended. **Playwright's
WebKit engine is not a certified stand-in for real Safari** regardless of
any Playwright-WebKit result, local or CI (the project's own long-
standing documented policy) — real Safari verification remains a
separate, unperformed manual step. See
`docs/meld-masters-phase-8-summary.md` for full detail, including a
CI-format-check gate that was fixed this phase (had blocked the e2e
matrix job entirely since 2026-07-27) and a pre-existing, unpatched
dependency-audit finding (4 high/1 moderate CVEs, out of this phase's
scope) that now surfaces now that the format gate no longer blocks it.

**Remaining work (not blocking checkpoint completion, all require the
user or a separate deliberate task):** real screen-reader checks (NVDA/
VoiceOver/TalkBack), real Safari verification (desktop + iOS), Phase 6's
manual Android/iOS/desktop-installed-PWA device checklists
(`docs/meld-masters-phase-6-summary.md` §30-33), the one remaining
dev-only dependency finding (`brace-expansion@1.1.16` via eslint's
toolchain — see the dependency security summary §14, no production
exposure, revisit only if/when upstream `eslint`/`@eslint/config-array`
moves off its current `minimatch` major), completing local webkit/
mobile-webkit verification in small batches if full local coverage is
wanted, and actual deployment (not performed or requested).

**No new phase started automatically.** The plan's Phase 8 (§11) was the
final defined phase of this visual-refresh initiative; there is no
Phase 9. Any further work (deployment, real-device/screen-reader checks,
the dependency-audit fixes) is tracked as remaining work above, not a
new phase.

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
- **Phase 8** (regression testing, visual review, and release
  preparation) — **completed**, 2026-07-28, pending human review. The
  plan's final phase (§11). Fixed the pre-existing CI format-check gap
  that had silently blocked CI's entire e2e matrix job since 2026-07-27
  (whitespace-only reflow in `e2e/scripts/capture-phase-5-review.ts`, no
  behavior change) as a separate first commit, then pushed the rest of
  Phase 8 as a second commit and let CI verify independently. Full gate
  green; local e2e chromium/firefox/mobile-chrome all 42/42; CI
  independently confirmed all four of those plus webkit all pass;
  mobile-webkit CI runs stayed inconclusive across 3 attempts
  (infrastructure interruptions only, never a real test failure — see
  "WebKit local limitation" note above). Production-build static-asset
  serving verified directly (health/manifest/icons/fonts/portraits/
  bundles all correct). Branding sweep (`git grep "Tile Meld"` /
  `mahjong`, case-insensitive) found only allowed historical/prohibition-
  text/absence-asserting-test hits — no active-UI or runtime-file leak.
  Asset inventory confirmed (8 rival portraits + fallback, registry,
  derivation scripts, reference roster sheet docs-only with no runtime
  import). 71 final review screenshots captured
  (`docs/design-reference/final/`, a new directory, earlier phase-N-review
  directories untouched) across the required states/viewports; two
  states (a live in-progress drag gesture, and a valid-set/multiple-sets/
  commit-enabled trio requiring a random hand with a ready-made meld)
  were not captured after 2-3 genuine attempts each and are documented as
  an honest gap, not fabricated. A real pre-staging catch: an early
  capture attempt's fullPage screenshots exposed a live (if disposable,
  test-only) recovery secret on the Recovery page — found during the
  required per-screenshot sensitivity review, fixed by dismissing the
  one-time reveal before capturing, and the entire screenshot set was
  regenerated clean before staging. Compared against the 6 concept
  reference images — no deviation beyond the already-documented
  Phase 0-7 deliberate differences. Deployment readiness inspected
  (Render Blueprint, Docker, VPS compose, env vars, migration-as-
  pre-traffic-step) and a concrete pre-deploy checklist produced; no
  deployment performed or requested. See
  `docs/meld-masters-phase-8-summary.md` for the complete writeup.

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

**None.** Phase 8 — regression testing, visual review, and release
preparation (plan §11) — was the final defined phase of the Meld Masters
visual-refresh initiative, and is complete. A separate, focused
dependency security remediation checkpoint followed it (see the top of
this document and `docs/meld-masters-dependency-security-summary.md`) —
not itself a plan phase, a maintenance checkpoint outside the plan's
numbering. No Phase 9 exists in the plan and none was started
automatically.

Remaining work, independent of and not blocking review of this
checkpoint (none are preconditions Claude can complete alone; none were
performed or claimed as passed):

- Real screen-reader checks (NVDA/VoiceOver/TalkBack) and real Safari
  verification (desktop + iOS) — `docs/meld-masters-phase-8-summary.md`.
- Phase 6's manual Android/iOS/desktop-installed-PWA device checklists
  (`docs/meld-masters-phase-6-summary.md` §30-33).
- The one remaining dev-only dependency finding
  (`brace-expansion@1.1.16` via `eslint`'s own toolchain, no production
  exposure — `docs/meld-masters-dependency-security-summary.md` §14).
- Completing local webkit/mobile-webkit verification in small batches,
  if full local coverage beyond CI is ever wanted.
- Actual deployment (Render Blueprint or otherwise) — not performed or
  requested. See `docs/meld-masters-phase-8-summary.md` for the
  deployment-readiness recommendation and checklist.

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
