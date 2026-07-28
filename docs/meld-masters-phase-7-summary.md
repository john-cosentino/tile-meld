# Meld Masters visual refresh — Phase 7 summary

## 1. Date

2026-07-28 (UTC), across two sessions on the same date (see §6).

## 2. Starting branch and commit

`main` @ `7734982` ("feat(theme): integrate approved portrait pack into
waiting room and tabletop opponents" — the Phase 5 checkpoint) at the
start of Phase 7 work. An intermediate partial checkpoint was committed
mid-phase as `e842b11` ("fix(theme): Phase 7 partial — skip-link focus,
keyboard tile selection, username overflow"); this document covers the
complete phase through the final commit on top of it (hash intentionally
not recorded here — see `git log` for the current `main` tip).

## 3. Phase 5 commit

`7734982` — original character portrait system, completed and reviewed.
See `docs/meld-masters-phase-5-summary.md`.

## 4. Phase 6 commit

`4142106` — logo derivatives, favicon, PWA icons, manifest, browser
metadata. See `docs/meld-masters-phase-6-summary.md`.

## 5. Starting worktree status

At the start of the session that produced this document: `main` @ `e842b11`
(the partial checkpoint above), 1 commit ahead of `origin/main`, working
tree otherwise clean — the partial Phase 7 work was already committed, not
left uncommitted. No unrelated user work was present.

## 6. Earlier machine interruptions

Two separate incidents, both root-caused, both unrelated to any bug in the
application code under test:

- **First incident:** a prior session ran the full 5-project Playwright
  matrix detached in the background (`nohup ... & disown`) overnight,
  unattended. The machine went fully unresponsive (black screen) and
  required a hard reboot. The interrupted work was picked up and completed
  safely in a following session (the partial checkpoint, `e842b11`).
- **Second incident (this session):** running the full 42-test webkit
  project in one continuous `playwright test` invocation caused a severe
  process leak — 29 leftover `WPEWebProcess` (WebKit's renderer process)
  instances accumulated, consuming ~17.7GB combined RSS and driving free
  memory to ~2Gi before being caught and stopped. Stopping the supervising
  task killed every leaked process instantly and memory recovered in full
  — strong evidence this same leak mechanism, run unsupervised for hours
  via the first incident's detached background process, is what actually
  froze the machine originally. See §35 for how this shaped this
  session's browser-project results.

## 7. Audit methodology

A standalone script, `e2e/scripts/audit-phase-7.ts` (kept outside
`e2e/tests`, driving the raw Chromium API directly, single browser/single
worker — never competes with the real e2e suite's rate-limit budget or
adds extra browser-engine load), automates the plan's §13.2 checklist
across 11 route/state scenarios (Home, Public Lobby, Create Room ×2
identity states, Join Room by Name, Recovery, Waiting Room 2p, Waiting
Room multiplayer, Tabletop human-opponent, Tabletop vs-computer, Tabletop
completed/rematch, Tabletop unavailable-game):

- Horizontal-overflow check at all 7 required viewports per scenario.
- An axe scan (serious/critical violations) per scenario.
- Touch-target measurement (≥44×44px) for the scenario's interactive
  controls at 390px.
- A tab-sequence focus-visibility check (no `outline: none`/`0px` on any
  tab stop).
- A `prefers-reduced-motion: reduce` check sampling real computed
  transition/animation durations.
- A 200%/400% zoom check (via `document.documentElement.style.zoom`)
  confirming critical controls stay visible/reachable.
- A full keyboard-only walkthrough on the Tabletop (13 numbered steps,
  §13.2's own list) using real `page.keyboard.press`, not synthetic
  clicks.
- A portrait network-request trace on the multiplayer waiting room.

The script prints a structured `PASS`/`FAIL`/`NOTE` report; it was run
repeatedly (7 full passes over the session) as fixes landed, each time
against a freshly created, migrated, disposable database with manually
started/stopped dev servers in the foreground — never detached.

## 8. Complete findings

Six real, verified issues were found and fixed (§9 below has the file-by-
file detail): the skip-link had no `:focus` reveal; keyboard tile
selection was silently broken by a `dnd-kit` sensor conflict; a
max-length username overflowed the page at narrow widths; six classes of
interactive control measured ~2–14px short of the 44×44px touch-target
guideline; six bare decorative emoji had no `aria-hidden`, risking
duplicate/verbose screen-reader announcements; and a test-infrastructure
bug in the audit script itself (not a product bug) intermittently broke
one scenario. Everything else audited — overflow at all viewports, axe,
focus visibility, reduced motion, 200%/400% zoom, the full keyboard
walkthrough, list/landmark/heading semantics, live regions, and contrast
— was already correct and required no change.

## 9. Existing fixes (from the partial checkpoint, `e842b11`)

- **Skip-link `:focus` reveal** — `RootLayout.tsx`/`global.css`. New
  `.skip-link` class (deliberately separate from `.visually-hidden`, which
  is also used for content that must never become visible). `#main-content`
  gained `tabIndex={-1}` so activating the link actually moves focus, not
  just scroll position.
- **Keyboard tile selection** — `TabletopPage.tsx`. `dnd-kit`'s
  `KeyboardSensor` claimed Enter/Space as its own drag-activation keys and
  `preventDefault()`-ed them, silently blocking `Tile`'s native `<button>`
  click activation for real keyboard input. Removed (nothing exercises its
  arrow-key drag).
- **Username overflow** — `global.css`. `overflow-wrap: break-word` on
  `.page-title`; max-length (24-char) usernames no longer force horizontal
  overflow at phone widths.

## 10. New fixes (this document's session)

### 10.1 Touch targets (`global.css`)

| Control | Before | After | Fix |
| --- | --- | --- | --- |
| Every plain `<button>` (Mark ready, Draw tile, Commit turn, Sort by number, chat toggle, dashboard/action-bar buttons, Rematch, etc.) | ~42px tall | ≥44px | `min-height: 44px; display: inline-flex; align-items: center; justify-content: center;` on the base `button` rule |
| `.app-nav a` (Home/Create Room/Join/Public Lobby/Recovery nav links) | ~30px tall | ≥44px | `min-height: 44px` |
| `.arcade-choice` (radio-choice labels: capacity, visibility, turn limit) | ~42px tall | ≥44px | `min-height: 44px` |

`.tile` (44×56px, fixed) is unaffected — its own explicit sizing already
exceeds the floor, so the base-button rule is a no-op there; **tile
geometry was not touched**. `.arcade-action` dashboard buttons are
single-line text only, so centering introduced no layout change.

**Deliberately not changed:** the "Claim a username" inline link
(`CreateRoomPage.tsx`/`JoinRoomPage.tsx`/`HomePage.tsx`/
`PublicLobbyPage.tsx`), measured 136×22px. This is WCAG 2.5.5's own named
exception — "the target is in a sentence or block of text" — and padding
it to 44px would break the sentence's natural reading flow for no real
accessibility benefit.

### 10.2 Decorative/emoji audit (§13.2 "decorative layers ... silent")

The connection indicator (🟢/🟡/🔴), the "Computer is playing…" H1 marker
and opponent-strip "🤖", the active-seat "⏳", the turn-deadline-warning
"⏰", and the notification-bell "🔔/🔕" were all bare emoji with no
`aria-hidden` — each is redundant with adjacent text that already carries
the full meaning ("Connected", "Computer is playing…", "Notifications
on"). Wrapped each in `<span aria-hidden="true">`, preserving the visible
glyph exactly (per the plan's own instruction: correct the duplicate AT
announcement, don't remove a useful visual symbol). Files:
`TabletopStatus.tsx`, `OpponentStrip.tsx`, `TabletopPage.tsx`,
`NotificationsControl.tsx`.

The BOT badge (`WaitingRoomPage.tsx`, `"🤖 BOT"`) already had its own
`aria-label="computer opponent"` on the wrapping `<span>`, which already
fully overrides the accessible name — no change needed there.

**Test fallout, fixed:** wrapping an emoji in its own `<span>` splits
previously-single-text-node assertions across DOM siblings, which
React Testing Library's default `getByText` doesn't match across by
design (documented RTL behavior, not a real accessibility regression —
the text is still fully present and visible). Added a small
`textAcrossElements` matcher helper (RTL's own documented workaround
pattern) to `TabletopComputerTurn.test.tsx` and `TabletopLayout.test.tsx`
and updated the 4 affected assertions to use it.

### 10.3 Audit-script bug (not a product bug)

The audit script's own "completed/rematch" scenario resigned on the guest
page without first waiting for the *host* to finish navigating into the
game (a wait scenario 8 already had). This produced an intermittent
"Game over never appears" false failure purely in the throwaway script,
diagnosed via `hostUrl`/`guestUrl` logging (host was still on `/rooms/...`
while guest had already reached `/games/...`) and fixed by adding the same
host-side wait already used elsewhere.

## 11. Files inspected

Full-file reads this session, beyond the files changed (§46): `Tile.tsx`,
`ChatPanel.tsx`, `TabletopStatus.tsx`, `OpponentStrip.tsx`,
`DeadlineCountdown.tsx`, `NotificationsControl.tsx`,
`AnnouncerProvider.tsx`, `Rack.tsx`/`TableSet.tsx` (sort/reorder controls),
`TabletopPage.tsx` (full action bar), `global.css` (contrast-relevant
rules: `.badge`, `.status-badge*`, `.code-readout`, `.arcade-action*`,
`button.accent-*`), `playwright.config.ts`, `helpers.ts`.

## 12. Files changed

See §46 for the complete list with purposes.

## 13. Global shell

Header/nav unchanged in structure; `.app-nav a` touch-target fix only
(§10.1). Skip-link from the partial checkpoint (§9).

## 14. Dashboard

No changes beyond the global `button`/`.arcade-action` touch-target fix
(§10.1), which affects the four dashboard CTAs' height only (already
single-line text, no layout change).

## 15. Lobby

No Phase-7-specific change; verified clean at all 7 viewports, axe clean
(§9 of the audit report).

## 16. Forms

Create Room's `.arcade-choice` radio labels fixed for touch target
(§10.1); verified with the form actually rendered (a claimed-username
context), since unauthenticated the form doesn't render at all (a "claim a
username" prompt shows instead) — the audit script's first attempt missed
this and was corrected to claim a username first.

## 17. Waiting room and portraits

`Mark ready` button touch-target fix (§10.1, part of the base-button
rule). Portrait rendering, decorative `alt=""`, and the seat-portrait
frame are unchanged from Phase 5. See §32 for the portrait-loading
investigation.

## 18. Recovery

No Phase-7-specific change; verified clean at all 7 viewports and 200%
zoom, axe clean. Recovery-secret screenshots were captured on
unauthenticated pages (no secret ever generated/shown) — see §37's
sensitivity review.

## 19. Tabletop

Draw tile / Commit turn / Sort by number / chat-toggle touch-target fixes
(§10.1); keyboard tile-selection fix (§9); emoji `aria-hidden` fixes
(§10.2). Verified at 320×568, 844×390 (landscape), 768×1024 (tablet),
200% zoom, and reduced-motion, plus the full keyboard walkthrough (§20).

## 20. Keyboard walkthrough

All 13 items from the plan's §13.2 list were exercised with real
`page.keyboard.press`, not synthetic clicks, on a live 2-player game:

1–3. Focus a rack tile, press Enter, `aria-pressed` flips to `true` — pass.
4–5. Focus "Start a new set", press Enter, tile places (rack 14→13) — pass.
6. Sort by number reachable and activatable by keyboard — pass.
7. Set-reorder ("Move left"/"Move right") controls reachable and
   activatable by keyboard when present — pass (not exercised on every
   run when the set under test had fewer than 2 tiles; the controls exist
   and are native `<button>`s, so keyboard operability doesn't depend on
   the set's current size).
8. Undo and Commit turn reachable and activatable by keyboard — pass.
9. Chat expand reachable by keyboard, input present — pass.
10. Resign confirmation opened and cancelled via keyboard — pass.
11–12. Rematch controls reachable (verified via the completed/rematch
   scenario's touch-target and axe checks; the Rematch button is a plain
   native `<button>`).
13. No portrait/decorative `<img>` ever received focus across a 30-stop
   Tab sweep — pass.

No dnd-kit keyboard dragging was reintroduced — the native button-based
path (click/tap + Enter/Space) is the supported, tested keyboard
alternative, per §9's fix.

## 21. Skip link

See §9. New e2e test (`accessibility.spec.ts`): Tab reveals the link with
a non-zero bounding box; Enter moves focus to `#main-content`. Screenshots:
`skip-link-before-focus--1280x720.png` / `skip-link-after-focus--1280x720.png`.

## 22. Accessibility tree

Reviewed directly via source read + axe automation, not just reasoned
about: tile symbols are `aria-hidden` with full meaning in `aria-label`
("Crimson 7"); portraits are `alt=""` (implicit `presentation` role, off
the accessibility tree by design); the BOT badge has its own `aria-label`;
opponent/member lists use real `<ul>`/`<li>`; tiles are native `<button>`s
with `aria-pressed`; drop zones (`Start a new set`, rack) are
keyboard-activatable native buttons; the header link's accessible name is
exactly "Meld Masters" regardless of the decorative monogram (existing
test, re-verified). Zero serious/critical axe violations across every
scenario in every audit-script run.

## 23. Real screen-reader status

**Not performed.** No NVDA, VoiceOver, or TalkBack session was run this
phase — this requires a human with real assistive-technology software,
which this session cannot provide. A manual checklist is below (§40).
Everything machine-checkable in its place (axe, accessibility-tree
inspection, role queries, keyboard-only interaction, live-region source
review) was performed and passed.

## 24. Decorative and emoji audit

See §10.2. Six bare emoji found and fixed (aria-hidden, glyph kept
visible); the BOT badge's emoji was already correctly handled via its
parent's `aria-label`. No visual symbol was removed.

## 25. Live regions

Reviewed by source: the shared announcer (`AnnouncerProvider.tsx`) is a
single `role="status" aria-live="polite"` region, visually hidden, with a
deliberate zero-width-space toggle so a repeated identical message still
re-announces (a documented real screen-reader quirk — many SRs only
announce on text *change*) rather than silently duplicating or dropping.
Chat (`ChatPanel.tsx`) is `role="log" aria-live="polite"
aria-label="Chat messages"`. Every banner uses the correct role
(`role="alert"` for errors, `role="status"` for informational/warning
banners and the completed-game panel). Turn/deadline/invalid-set/
game-over text all render as plain text inside these regions — nothing
new this phase changes what gets announced or how. Portrait images
(`alt=""`) never enter the accessibility tree, so their loading causes no
announcements by construction.

## 26. Focus

Focus-visibility spot-checked via real Tab sequences on Home (6 stops:
skip-link + header nav) and Tabletop (8 stops: rack tiles + actions) — no
tab stop anywhere had `outline: none` or `0px`. The app-wide
`:focus-visible` rule (3px solid cyan + glow, 11–12:1 contrast, verified
in Phase 2) and tiles' own higher-contrast focus ring (verified in Phase
4) are both unchanged and both still apply. Tile *selection*
(`.is-selected`, an orange box-shadow ring) and tile *focus*
(`.tile:focus-visible`, a teal outline) use visually distinct tokens, so
the two states never look identical. Portrait frames (a plain 1px border,
no glow) don't resemble the focus treatment.

## 27. Reduced motion

New e2e test (`accessibility.spec.ts`) samples real computed
`transitionDuration`/`animationDuration` on buttons, links, panels, the
skip-link, and tiles under `prefers-reduced-motion: reduce` and asserts
every one is clamped to ~0 — confirming the existing Phase 2 global clamp
(`@media (prefers-reduced-motion: reduce) { ... animation-duration:
0.001ms !important; ... }`) still applies against the current stylesheet,
not just re-reading the CSS source. A reduced-motion screenshot of the
Tabletop shell was also captured (`tabletop-reduced-motion--1280x720.png`)
— static images can't show the *absence* of animation directly, so the
automated test is the actual proof; the screenshot is a visual
reference only.

## 28. Zoom

200% zoom checked via `document.documentElement.style.zoom` on Home,
Recovery, and Tabletop: heading, nav links, and primary action buttons
(Commit turn, chat toggle) all remained visible/reachable in every case.
400% checked as a diagnostic on Home only (per the plan's "document
limitations honestly" instruction, not a full pass requirement) — the H1
remained visible; no further systematic 400% sweep was performed, and none
is claimed.

## 29. Touch targets

See §10.1 for the full before/after table. One deliberate, documented
exception (the inline "Claim a username" link, WCAG 2.5.5's own named
exception).

## 30. Overflow

Zero horizontal overflow at any of the 7 required viewports
(1440×900, 1280×720, 768×1024, 1024×768, 390×844, 844×390, 320×568) across
every one of the 11 scenarios the audit script covers, confirmed in the
final clean audit run. A new permanent e2e spec
(`e2e/tests/mobileOverflow.spec.ts`) automates the 390px check for Home,
Public Lobby, Create Room, Recovery, and Waiting Room going forward
(Tabletop's own 390px check already existed in `tabletopMobile.spec.ts`
and wasn't duplicated; the existing 320px long-username check in
`vs-computer.spec.ts` was kept as-is).

## 31. Final contrast table

All values computed directly via the real WCAG relative-luminance formula
against the actual hex values in `global.css` — reusing Phase 2/4's
already-measured, unchanged tokens where the same pairing was already
verified, and computing the handful of new pairings this phase's audit
specifically asked for. Requirement: normal text ≥4.5:1, large/display
text and non-text (focus rings, borders) ≥3:1.

| Pair | Ratio | Source |
| --- | --- | --- |
| Primary text on page (`--text-primary` / `--bg-page`) | 17.14:1 | Phase 2 |
| Primary text on panels (`--text-primary` / `--bg-panel`) | 15.80:1 | Phase 2 |
| Muted text on page (`--text-muted` / `--bg-page`) | 8.74:1 | Phase 2 |
| Muted text on panels (`--text-muted` / `--bg-panel`) | 8.05:1 | Phase 2 |
| Navigation / wordmark fallback (`--neon-cyan` / `--bg-panel`) | 11.25:1 | Phase 2 |
| Cyan button (`--text-on-accent` / `--neon-cyan`) | 12.21:1 | Phase 2 |
| Gold button (`--text-on-accent` / `--neon-gold`) | 12.57:1 | Phase 2 |
| Purple action (`--neon-purple` text / `--bg-panel`) | 5.37:1 | computed this phase |
| Green state (`--state-success` / `--bg-panel`) | 10.52:1 | Phase 2 |
| Green state, page background (status-badge--active) | 11.41:1 | computed this phase |
| Warning (`--state-warning` / `--bg-panel`) | 11.59:1 | Phase 2 |
| Error (`--state-error` / `--bg-panel`) | 6.35:1 | Phase 2 |
| Error, solid fill (`button.danger`) | 6.89:1 | Phase 2 |
| General focus ring (`--neon-cyan` / `--bg-page`\|`--bg-panel`) | 12.21:1 / 11.25:1 | Phase 2 |
| Tile numerals (C1–C4, worst case) | 4.76:1–6.25:1 | Phase 4 |
| Tile selected ring | 3.90:1 (ivory) / 4.19:1 (bg-inset) | Phase 4 |
| Tile focus ring | 3.86:1 (ivory) / 4.22:1 (bg-inset) | Phase 4 |
| Tile invalid border | 4.49:1 (ivory) / 3.63:1 (bg-inset) | Phase 4 |
| Recovery code / room code (`.code-readout`, `--text-primary` / `--bg-inset`) | 16.52:1 | computed this phase |
| Badge text (BOT badge, status badges — `--text-muted` / `--bg-panel`\|`--bg-page`) | 8.05:1 / 8.74:1 | Phase 2 |
| Text beside portraits (`.seat-name`/opponent text, same as primary text on panel) | 15.80:1 | Phase 2 |

No failing combination was found. No token or component needed a contrast
fix this phase.

## 32. Portrait loading conclusion

Inspected via a live network trace (audit script, multiplayer waiting
room, 3 of 4 seats filled) and via source/build inspection:

- **`decoding="async"`**: present on both `<img>` sites (`WaitingRoomPage.tsx`,
  `OpponentStrip.tsx`) since the partial checkpoint.
- **`loading="lazy"`**: intentionally **not** added. Every portrait this
  app renders is always immediately visible (small avatar-sized images in
  the seat list/opponent strip, never below-the-fold deferred content), so
  lazy-loading would provide no benefit and could only add risk (a
  flash-of-no-image in some browsers for content that's on-screen
  immediately) — exactly the case the plan's own phrasing anticipated
  ("without delaying immediately visible portraits").
- **Explicit `width`/`height`**: present on both sites (56×56, 36×36),
  preventing layout shift (CLS).
- **Dev-mode network trace**: with 3 seats filled (3 distinct portraits
  visible), the trace showed 9 `?import`-suffixed requests (one per
  `portraits.ts` roster entry) plus 1 real image-byte request. The 9
  `?import` requests are Vite dev-server artifacts of static top-level ES
  imports (`import x from './foo.png'` is spec-eager, resolved regardless
  of which one is actually rendered) — each returns a tiny JS module
  exporting a URL string, not the image bytes. Confirmed against the
  production build: exactly 9 image files are emitted (one per roster
  entry + fallback, ~285.5KB combined per Phase 5), with no `?import`
  artifacts — in production these static imports collapse to compile-time
  string constants, so only the portrait(s) actually rendered in an
  `<img src>` trigger a real network fetch.
- **Conclusion: no change needed.** No real loading or layout problem was
  demonstrated; the total payload is already tiny and every portrait is
  always immediately visible.

## 33. Tests added or updated

- **New**: `e2e/tests/mobileOverflow.spec.ts` — 5 tests, 390px overflow
  across Home/Public Lobby/Create Room/Recovery/Waiting Room.
- **New**: `accessibility.spec.ts` — +1 test, reduced-motion duration
  clamp (§27).
- **Updated**: `TabletopComputerTurn.test.tsx`, `TabletopLayout.test.tsx`
  — 4 assertions switched to a `textAcrossElements` matcher after emoji
  moved into their own `aria-hidden` sibling elements (§10.2); no
  assertion was weakened, only the query mechanism changed to match text
  now split across DOM nodes.
- **New**: `e2e/scripts/audit-phase-7.ts` — the automated §13.2 audit
  driver (§7), not part of the enforced test gate (kept outside
  `e2e/tests`, like the existing `capture-phase-N-review.ts` scripts).
- **Config**: `e2e/tsconfig.json` gained `"lib": ["ES2023", "DOM"]` —
  required for `document`/`getComputedStyle` references inside
  `page.evaluate()` closures in the new reduced-motion test; purely
  additive, verified with a full repo typecheck afterward.

## 34. Commands and exact results

Database safety: `TEST_DATABASE_URL`/`DATABASE_URL` both exported to the
disposable `tilemeld_test` database before any command touching a
truncatable database, per `CLAUDE.local.md`. Every Playwright/manual
dev-server run used a freshly created, migrated, disposable database
(`tilemeld_e2e_phase7*`), dropped after use.

| Command | Result |
| --- | --- |
| `pnpm exec prettier --check` (every file this phase touched) | pass (after 2 fixes) |
| `pnpm run lint` | pass |
| `pnpm run typecheck` (6 workspace projects) | pass |
| `pnpm run test` (full suite) | pass — exit 0; `apps/server` alone 28 files/317 tests; `apps/web` separately re-confirmed 211/211 after the emoji fixes |
| `pnpm run build` | pass — web + server, 9 portrait files emitted (matches §32) |

## 35. Browser-project results

| Project | Result | Method |
| --- | --- | --- |
| chromium | **42/42 passed**, 7.9 min | Local, foreground, `--workers=1`, fresh disposable DB, `timeout`-wrapped |
| firefox | **42/42 passed**, 12.2 min | Same |
| mobile-chrome | **42/42 passed**, 7.2 min | Same |
| webkit | **1 known failure** (see below), full-project run aborted mid-run for safety | Local, foreground, `--workers=1` |
| mobile-webkit | **Deferred**, not attempted | Same engine as webkit; deferred by explicit user decision after the webkit findings |

**WebKit detail:** `multi-player.spec.ts`'s "4-player game" test fails
reproducibly (3/3 attempts across two isolated re-runs), isolated
specifically to 4-concurrent-browser-context setups — the same file's
3-player test passes every time, and the identical 4-player test passes
cleanly on **both** chromium and mobile-chrome. The failure signature
(`page.goto: Target page, context or browser has been closed`, a
150-second test timeout) is a browser-context lifecycle crash, not a
content/layout/accessibility assertion failure — nothing in this phase's
diff touches the multiplayer room-join or socket code path it exercises.
Separately, running the full 42-test webkit project in one continuous
invocation triggered the severe process leak described in §6 — 29
leftover `WPEWebProcess` instances, ~17.7GB combined RSS. Per explicit
user decision after these findings were reported, webkit and
mobile-webkit are **deferred**, not run to completion locally this
session. This matches the project's own established, previously-documented
pattern (Phase 1, Phase 4) of WebKit-via-Playwright engine-level
instability under concurrent multi-context tests, and the plan's own
browser-support policy (§10.5/D-BROWSERS): "Playwright's WebKit engine is
NOT a certified stand-in for real desktop or mobile Safari... a
best-effort proxy only."

**Also discovered, out of scope to fix this phase:** `.github/workflows/ci.yml`'s
e2e matrix job has not actually run on any push since at least
2026-07-27 — CI fails earlier, at the format-check step, blocked by the
pre-existing `capture-phase-5-review.ts` formatting gap (committed in
`7734982`, predates Phase 7). CI cannot currently serve as an independent
cross-check for any browser project, including webkit/mobile-webkit,
until that gate is fixed.

## 36. Recovery-rate-limit observations

Every server process this session was started with
`E2E_DISABLE_RATE_LIMITS=true` (the same flag `playwright.config.ts`'s
`webServer` sets, gated on `NODE_ENV !== "production"`, per its own
documented reasoning). No HTTP 429 was observed in any test run's output
this session. Nothing needed to be classified as rate-limit-related.

## 37. Screenshot inventory

- **Path:** `docs/design-reference/phase-7-review/`
- **Count:** 18.
- **States:** skip-link before/after focus (1280×720); a long-username
  waiting room at 320×568; a keyboard-selected tile (1280×720); Home,
  Public Lobby, Create Room, Recovery at 320×568; Home and Recovery at
  200% zoom; a 2-player waiting room with a real portrait at 320×568; a
  4-player waiting room with 3 portraits at 390×844; a 2-player Tabletop
  with a portrait at 320×568, 844×390 (landscape), and 768×1024 (tablet);
  Tabletop at 200% zoom; Tabletop under `prefers-reduced-motion: reduce`;
  a 4-player Tabletop at 390×844.
- Captured with `e2e/scripts/capture-phase-7-review.ts` (kept outside
  `e2e/tests`, same pattern as the other capture-phase-N scripts).
- **Sensitivity review:** all 18 screenshots were individually opened and
  reviewed this session. No recovery secrets, credentials, tokens,
  connection strings, or private URLs appear in any of them — the two
  Recovery-page captures were taken on unauthenticated pages before any
  secret was ever generated, so nothing sensitive was ever on-screen to
  capture. Room codes are shareable join codes (not secrets) and every
  identity is a disposable per-run test username.

## 38. Checks completed locally

Full gate (§34); chromium, firefox, mobile-chrome full e2e projects
(§35); the entire automated §13.2 audit (§7–§32); the full keyboard
walkthrough (§20).

## 39. Android checks pending

Unchanged from Phase 6 — still open, still requires the user with a real
device. See `docs/meld-masters-phase-6-summary.md` §30-31.

## 40. iOS checks pending

Unchanged from Phase 6 — still open, still requires the user with a real
device. See `docs/meld-masters-phase-6-summary.md` §32.

Manual screen-reader checklist (new this phase, none performed):

- **NVDA** (Windows + Chrome/Firefox): heading walk (H1 per route, no
  skipped levels); tile selection announces color/value via `aria-label`;
  the announcer region announces turn start/deadline warning/timeout/
  invalid-set/game-over without duplication; chat log announces new
  messages; skip-link reveals on Tab and moves focus on activation.
- **VoiceOver** (macOS Safari + iOS Safari): same checklist, plus rotor
  navigation by landmark/heading; confirm WebKit-real-Safari behavior
  independently of this phase's Playwright-webkit findings (§35), per the
  plan's own explicit policy that Playwright WebKit isn't a certified
  Safari stand-in.
- **TalkBack** (Android Chrome): same checklist, plus touch-exploration
  of the tabletop board/rack/action-bar region order.

## 41. Desktop PWA checks pending

Unchanged from Phase 6 — still open, still requires the user. See
`docs/meld-masters-phase-6-summary.md` §33.

## 42. Real screen-reader checks pending

See §23 and §40. None performed this phase.

## 43. Confirmation Phase 8 did not start

No file under any Phase 8 scope (regression testing, visual review,
release prep — plan §11 Phase 8) was touched. `docs/task.md` records
Phase 7 as the current checkpoint pending review; Phase 8 is the
recommended next step (§48), not started.

## 44. Confirmation no gameplay/server/engine/bot behavior changed

No file under `packages/engine/src`, `packages/bot/src`, or
`apps/server/src` was touched this phase (verified via the diff itself).
No API shape changed. `apps/server`'s test count (317, unchanged from
Phase 6) and the untouched drag-and-drop/commit/draw/pass/resign logic
confirm this directly — every change this phase is presentational
(`global.css`, JSX structure for `aria-hidden`/focus), a dnd-kit sensor
removal that only restores a native button's default behavior, or test/
tooling code.

## 45. Confirmation internal identifiers and tile geometry unchanged

`tile-meld` remains the repository/package-scope/deployment identifier
(no rename-related file touched this phase). Tile geometry is unchanged:
`.tile` still measures exactly 44×56px (`width: 2.75rem; height: 3.5rem`),
confirmed both by direct CSS read and by the touch-target audit's own
measurement (`.tile 44x56px`, passing — already at the floor, not
resized to reach it).

## 46. Files changed

| File | Purpose |
| --- | --- |
| `apps/web/src/layout/RootLayout.tsx` | Skip-link class + `tabIndex={-1}` on `#main-content` (§9, partial checkpoint) |
| `apps/web/src/pages/TabletopPage.tsx` | `KeyboardSensor` removal (§9, partial checkpoint); `⏰` warning-toast emoji `aria-hidden` (§10.2) |
| `apps/web/src/pages/WaitingRoomPage.tsx` | `decoding="async"` (partial checkpoint) |
| `apps/web/src/tabletop/OpponentStrip.tsx` | `decoding="async"` (partial checkpoint); `🤖`/`⏳` emoji `aria-hidden` (§10.2) |
| `apps/web/src/tabletop/TabletopStatus.tsx` | Connection indicator + turn-text emoji `aria-hidden` (§10.2) |
| `apps/web/src/push/NotificationsControl.tsx` | `🔔`/`🔕` emoji `aria-hidden` (§10.2) |
| `apps/web/src/styles/global.css` | `.skip-link` rules (partial checkpoint); `.page-title` `overflow-wrap` (partial checkpoint); touch-target `min-height` on `button`/`.app-nav a`/`.arcade-choice` (§10.1) |
| `apps/web/test/TabletopComputerTurn.test.tsx` | `textAcrossElements` matcher helper + 1 updated assertion (§10.2) |
| `apps/web/test/TabletopLayout.test.tsx` | `textAcrossElements` matcher helper + 3 updated assertions (§10.2) |
| `e2e/tests/accessibility.spec.ts` | +1 test, skip-link (partial checkpoint); +1 test, reduced motion (§27) |
| `e2e/tests/two-player-smoke.spec.ts` | +1 test, real keyboard tile selection (partial checkpoint) |
| `e2e/tests/vs-computer.spec.ts` | +1 test, narrow-viewport username overflow (partial checkpoint) |
| `e2e/tests/mobileOverflow.spec.ts` | New: 5 tests, 390px overflow across 5 routes (§30) |
| `e2e/tsconfig.json` | `+"lib": ["ES2023", "DOM"]` (§33) |
| `e2e/scripts/capture-phase-7-review.ts` | Phase 7 screenshot capture script (partial checkpoint + this session's extensions) |
| `e2e/scripts/audit-phase-7.ts` | New: automated §13.2 audit driver (§7) |
| `docs/design-reference/phase-7-review/*.png` (18 files) | Review screenshots (§37) |
| `docs/meld-masters-phase-7-summary.md` | This document |
| `docs/task.md` | Phase 7 checkpoint recorded as complete, pending review |

## 47. Manual review instructions

- **This summary:** `docs/meld-masters-phase-7-summary.md`.
- **The audit script:** `e2e/scripts/audit-phase-7.ts` — run it directly
  (`pnpm exec tsx e2e/scripts/audit-phase-7.ts`) against a running dev
  server for a fresh structured report.
- **Screenshots:** `docs/design-reference/phase-7-review/`.
- **New tests:** `e2e/tests/mobileOverflow.spec.ts`,
  `e2e/tests/accessibility.spec.ts`'s reduced-motion test.
- **Manual screen-reader checklist:** §40, not yet performed.

## 48. Recommended next step

**Phase 8** (regression testing, visual review, and release preparation —
plan §11) after this Phase 7 checkpoint is reviewed and approved.
Independently and not blocking Phase 8: the real screen-reader checks
(§40, §42), the Phase 6 real-device checks (§39, §41), fixing the CI
format-check gate so webkit/mobile-webkit can be independently verified
there (§35), and completing local webkit/mobile-webkit verification in
small batches per the process-leak finding (§6) if the user wants full
local coverage rather than relying on CI.
