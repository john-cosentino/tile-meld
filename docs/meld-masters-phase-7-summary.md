# Meld Masters visual refresh — Phase 7 summary (partial)

## 1. Status

**Partial.** This document covers three specific findings discovered and
fixed so far, all verified. It does **not** close out Phase 7 — the plan's
own acceptance checklist (`docs/meld-masters-visual-refresh-plan.md` §13.2)
is substantially larger than what's covered here (see §6, "Not yet done").
`docs/task.md` reflects this as an in-progress checkpoint, not a completed
phase.

## 2. Date

2026-07-28 (UTC). Continuation of work started in a prior session on the
same date, which was interrupted mid-verification when this machine froze
and required a hard reboot (unrelated to any bug in the code under test —
see the git-workflow feedback note in this session's memory for the
mechanism). No application code changed as a result of the interruption;
this session re-verified and completed the in-progress diff as found.

## 3. Starting point

`main` @ `7734982` ("feat(theme): integrate approved portrait pack into
waiting room and tabletop opponents" — the Phase 5 checkpoint), plus an
uncommitted working-tree diff already present at session start (8 files:
5 app files, 3 e2e specs).

## 4. Findings and fixes

### 4.1 Skip-link had no `:focus` reveal

The plan named this gap directly (§3.6, carried into §11 Phase 7 scope).
`RootLayout.tsx`'s skip-to-content link used `.visually-hidden`, which has
no focus-visible state, so a keyboard user tabbing to it saw nothing.

**Fix:** a new `.skip-link` class (`global.css`), kept deliberately
separate from `.visually-hidden` (which is also used for content that must
*never* become visible — the chat input's `<label>`, the live announcer
region, the screen-reader-only tabletop `<h1>` — so changing its focus
behavior would have incorrectly revealed those too). On `:focus-visible` it
becomes a real, high-contrast, fixed-position element using the site's
established cyan focus color. `<main id="main-content">` also gained
`tabIndex={-1}` — without it, activating an in-page fragment link only
scrolls, it doesn't move focus, leaving a keyboard/AT user with no
indication anything happened.

**Verified:** new e2e test (`accessibility.spec.ts`) — Tab reveals the
link with a non-zero bounding box, Enter moves focus to `#main-content`.
Screenshots: `docs/design-reference/phase-7-review/skip-link-before-
focus--1280x720.png` / `skip-link-after-focus--1280x720.png`.

### 4.2 Keyboard tile selection was silently broken

`TabletopPage.tsx` registered dnd-kit's `KeyboardSensor` alongside
`PointerSensor`. `Tile` is a native `<button onClick>`, so Enter/Space
already activate it (select/deselect) via default DOM behavior — the
documented keyboard-accessible alternative to drag-and-drop. But
`KeyboardSensor` claims Enter and Space as its own drag-activation keys and
calls `preventDefault()` on them (its default `keyboardCodes`), which
silently swallowed the button's native activation before a real keyboard
press ever reached `onClick`. Confirmed live before fixing: `aria-pressed`
never toggled on a real Enter keypress, even though the exact same
interaction via a synthetic `.click()` (Playwright's default) worked fine
— the existing test suite could not have caught this, because nothing in
it pressed a real key.

**Fix:** removed `KeyboardSensor`. Nothing in the app exercises dnd-kit's
own arrow-key-driven keyboard drag (the click/tap-to-select-then-place
path is the documented and tested keyboard alternative), so removing it
only restores the button's native behavior; drag-and-drop via
`PointerSensor` is unaffected.

**Verified:** new e2e test (`two-player-smoke.spec.ts`) that presses real
keys (`page.keyboard.press`), not `.click()` — focuses a tile, presses
Enter, asserts `aria-pressed` flips, then does the same to place it into a
new set and asserts the rack/set counts update. Screenshot:
`docs/design-reference/phase-7-review/tabletop-keyboard-selected-tile--
1280x720.png`.

### 4.3 Long username overflowed the page at phone width

Private-room names are the creator's raw username (up to
`USERNAME_MAX_LENGTH` = 24 characters), with no separator or forced break
point. A realistic max-length username previously forced `.page-title`
(the room-name heading) past its container, overflowing the page
horizontally at narrow phone widths.

**Fix:** `overflow-wrap: break-word` on `.page-title` (`global.css`).

**Verified:** new e2e test (`vs-computer.spec.ts`) — claims a 24-character
username, opens the Play vs Computer waiting room, sets the viewport to
320×568, and asserts `document.documentElement.scrollWidth <=
clientWidth`. Screenshot: `docs/design-reference/phase-7-review/waiting-
room-long-username-narrow--320x568.png`.

## 5. Verification performed this session

Per this session's explicit agreement with the user: chromium-only for
iteration; the full 5-project matrix is deferred until it can be run in
the foreground with the user present, after the machine freeze documented
in §2.

| Command | Result |
| --- | --- |
| `pnpm exec prettier --check` (files this diff touches) | pass |
| `pnpm run lint` | pass |
| `pnpm run typecheck` (6 workspace projects) | pass |
| `pnpm run test` (full suite, `TEST_DATABASE_URL` set per `CLAUDE.local.md`) | pass — exit 0; `apps/server` alone: 28 files / 317 tests |
| `pnpm run build` | pass — web + server |
| Playwright, `--project=chromium`, `accessibility.spec.ts two-player-smoke.spec.ts vs-computer.spec.ts` | **15/15 passed**, against a fresh disposable database (`tilemeld_e2e_phase7`) |

Dev servers used for both the Playwright run and the screenshot capture
script were started and stopped explicitly in the foreground each time —
none were left detached or unattended.

## 6. Not yet done (open Phase 7 scope, per plan §13.2)

None of the following were performed this session. Listed explicitly so
they aren't mistaken for silently-skipped or forgotten:

- Full 5-project e2e matrix (chromium, firefox, webkit, mobile-chrome,
  mobile-webkit) — deferred, see §5.
- Tablet breakpoint (~860px) transition check.
- Phone landscape (844×390) playability check.
- A full keyboard-only turn (select, place, reorder, commit) end to end —
  only tile selection (§4.2) was specifically verified.
- Screen-reader smoke test (NVDA or VoiceOver) — requires a human with
  real assistive-technology software; not something this session can
  perform.
- Recorded contrast-ratio table.
- 200% text-zoom pass.
- Reduced-motion pass (beyond the existing global clamp from Phase 2,
  unverified against anything new this phase might have introduced).
- Decorative-layer `aria-hidden` audit (grid, portraits, glyph spans).
- Installed-app checklist (§6.4) — already open from Phase 6, unaffected
  by this phase either way.

## 7. Files changed

| File | Purpose |
| --- | --- |
| `apps/web/src/layout/RootLayout.tsx` | Skip-link class rename to `.skip-link`; `tabIndex={-1}` on `#main-content` (§4.1) |
| `apps/web/src/styles/global.css` | `.skip-link` focus-reveal rules; `overflow-wrap: break-word` on `.page-title` (§4.1, §4.3) |
| `apps/web/src/pages/TabletopPage.tsx` | Removed `KeyboardSensor` (§4.2) |
| `apps/web/src/pages/WaitingRoomPage.tsx` | `decoding="async"` on the seat portrait `<img>` |
| `apps/web/src/tabletop/OpponentStrip.tsx` | `decoding="async"` on the opponent portrait `<img>` |
| `e2e/tests/accessibility.spec.ts` | +1 test (§4.1) |
| `e2e/tests/two-player-smoke.spec.ts` | +1 test (§4.2) |
| `e2e/tests/vs-computer.spec.ts` | +1 test (§4.3) |
| `e2e/scripts/capture-phase-7-review.ts` | New: Phase 7 screenshot capture script |
| `docs/design-reference/phase-7-review/*.png` (4 files) | New: review screenshots |
| `docs/meld-masters-phase-7-summary.md` | This document |
| `docs/task.md` | Phase 7 checkpoint recorded as in-progress/partial |

## 8. Recommended next step

Ask the user whether to continue the remaining §13.2 items now (§6) — the
machine-checkable ones (tablet/landscape overflow, contrast-ratio
measurement, 200%-zoom, reduced-motion, `aria-hidden` audit) can be done
without a human present; the screen-reader smoke test cannot. Per this
project's phase-checkpoint convention, stopping here for review rather
than proceeding unprompted through the rest of the checklist.
