# Meld Masters visual refresh — Phase 5 summary

## 1. Date

2026-07-27 (UTC).

## 2. Starting branch and commit

`main` @ `4142106d48da013b2fb9c5bc2d47ed9d86558184` ("feat(brand): Meld
Masters icon pipeline, favicon, and PWA install metadata" — the Phase 6
checkpoint).

## 3. Starting upstream and worktree status

Verified before any edit: `origin/main` configured as upstream, `git fetch`
showed 0 ahead / 0 behind. `git status --short` was **not** empty: 10
untracked files were already present under
`docs/design-reference/meld-masters/` — the approved portrait source pack
itself, placed on disk outside any prior session in this conversation.
These were not "unrelated uncommitted work" to stop for; they are exactly
the required Phase 5 input, so this session proceeded to verify and use
them (§4-6) rather than treating their presence as a blocker.

## 4. Verified source-asset location in `docs/`

`docs/design-reference/meld-masters/` (the same directory the concept art
and logo master already live in — no separate portraits subdirectory was
created under `docs/`).

## 5. Verified source asset inventory

All 10 expected files present and load correctly (checked via Pillow —
none corrupted, none zero-byte):

| File | Dimensions | Mode | Bytes |
| --- | --- | --- | --- |
| `portrait-rival-01.png` .. `portrait-rival-08.png` | 1024×1536 each | RGBA | 2.2–3.0 MB each |
| `portrait-fallback.png` | 1024×1536 | RGBA | 2.43 MB |
| `meld-masters-concept-roster.png` | 1448×1086 | RGB | 2.07 MB |

**Discrepancy from the documented asset contract, flagged rather than
silently resolved**: `docs/meld-masters-visual-refresh-plan.md` §9.3
specifies "512×512 source PNG per portrait, 1:1". The delivered files are
1024×1536 (2:3, taller than wide), not square. Every rival portrait was
visually inspected (not assumed): each is a head-and-shoulders "bust" shot
with the face consistently positioned in the upper ~40% of the frame, and
each has genuine alpha transparency at all 4 corners (confirmed by
sampling corner pixels, not just checking the color mode) — a soft
vignette cutout, not a hard-edged rectangle. Given this, the display
treatment was `object-fit: cover` with `object-position: top center`
inside a square frame (§14), which crops the lower torso, never the face —
a considered resolution, not a workaround forced by not noticing the
mismatch.

`meld-masters-concept-roster.png` is reference material only, exactly like
the four `meld-masters-concept-0N.png` concept screens — never imported by
the app, never a runtime asset. `manifestIcons`-style verification for
this is covered by a dedicated test (§16).

## 6. Whether `portrait-fallback.png` was present

**Yes.** The blocking condition ("if `portrait-fallback.png` is missing,
stop and report it as a blocker") did not trigger. No fallback was
invented, cropped from the roster sheet, or substituted from a rival
portrait.

## 7. Production asset location

`apps/web/src/assets/portraits/` (new directory), matching the plan's own
§9.3 naming convention. A README in that directory documents provenance,
the file list, the fallback's meaning, and the dimension discrepancy above
(§5).

## 8. Files copied into production assets

The 8 rival portraits + `portrait-fallback.png` (9 files; the roster sheet
was deliberately **not** copied — it is reference-only and must never be a
runtime asset, per the task's own explicit prohibition).

**Not a byte-identical copy.** The `docs/` originals are 2.2–3.0 MB each
(~22.5 MB total for the 9 files) — the plan's own asset budget (§9.3) caps
the *combined* portrait payload at ≤150 KB, and every planned display size
is well under 100px. A new deterministic script,
`scripts/derive-portraits.py`, produces the production copies by resizing
each source (LANCZOS) to 128×192 (preserving the 2:3 source ratio, roughly
2x the largest planned ~56px display size for headroom on high-DPI
screens) and re-saving with `optimize=True` — mechanical resize +
recompression only, no content change, and **the `docs/` originals are
only ever opened for reading, never written to** (verified: MD5 checksums
of all 9 source files were unchanged after every run of the script this
session).

| Metric | Before | After |
| --- | --- | --- |
| Total (9 files) | 23,076,044 bytes (~22.5 MB) | 292,379 bytes (~285.5 KB) |

This lands close to, but does not hit, the plan's original ≤150 KB figure
— documented as a deliberate trade-off (§5's dimension mismatch means the
"512×512, ~150 KB" budget was set against different assets than what was
actually delivered) rather than chased further at a real cost to visual
quality at the achieved size (checked visually — faces remain clearly
legible at 128×192, see the review screenshots §19).

## 9. Portrait registry/mapping strategy

`apps/web/src/branding/portraits.ts` (new module) — the only place in the
app that imports the portrait assets:

- `PORTRAIT_ROSTER: readonly string[]` — the 8 rival portrait URLs, stable
  order.
- `PORTRAIT_FALLBACK: string` — the fallback portrait URL.
- `portraitForSeat(seatIndex: number, isComputer: boolean): string` — pure
  function, deterministic:
  - Computer seats **always** get `PORTRAIT_FALLBACK`. **No dedicated bot
    portrait was included in the delivered asset pack** — a deviation from
    the plan's original §9.3 sketch ("the computer opponent always gets
    portrait-bot"), documented here rather than invented. The fallback's
    own design (a neutral, non-human "crash-test-dummy" style figure, see
    the review screenshots) reads reasonably as a stand-in for a computer
    player on its own merits, not merely as an error state.
  - Human seats: `PORTRAIT_ROSTER[seatIndex % PORTRAIT_ROSTER.length]` — a
    given seat index always maps to the same portrait, and modulo means
    any capacity this app supports (2-4 seats) or ever might (the roster
    has 8 entries, more than double the current max capacity) resolves to
    a real portrait without an out-of-range access.
  - A negative, non-integer, or `NaN` seat index (malformed/unexpected
    data) resolves to `PORTRAIT_FALLBACK` rather than crashing or indexing
    out of bounds.
- No storage, no server round-trip, no persisted selection anywhere — the
  mapping is recomputed from `seatIndex`/`isComputer` on every render, and
  those values are already part of the existing room/game view data (no
  API change was needed).

## 10. Fallback behavior

`PORTRAIT_FALLBACK` is used for: every computer seat (by design, §9), and
any out-of-range/malformed seat index. It is rendered through the exact
same `<img>`/CSS path as every rival portrait (`portraitForSeat` returns a
plain string URL either way) — there is no separate "broken" code path, so
a screen showing the fallback looks and behaves like any other portrait,
never a missing-image icon or empty box.

## 11. Waiting-room integration details

`apps/web/src/pages/WaitingRoomPage.tsx`: one `<img className="seat-portrait">`
added inside the existing `.seat-identity` span, immediately before the
existing `.seat-name` span (exactly the slot Phase 3's own code comment
had already reserved: *"A future Phase 5 portrait would land here, before
the name"*). `portraitForSeat(index, m.isComputer)` uses the member's
position in `room.members.map((m, index) => ...)` as the seat index — the
same array Phase 3 already iterates, so no new data was threaded through.
56×56 explicit `width`/`height`, `alt=""`. Every other line of the
component (ready-toggle logic, host/start/leave actions, room-code
display, polling) is unchanged.

## 12. Opponent-strip integration details

`apps/web/src/tabletop/OpponentStrip.tsx`: one `<img className="opponent-portrait">`
added before the opponent's text content, using `portraitForSeat(o.seatIndex, o.isComputer)`
(the real server-assigned seat index already present on
`RedactedGameView["opponents"][number]` — no new field). The previously
flat, un-wrapped text content (`{o.displayName}{...}: {o.rackCount} tiles...`)
was wrapped in a `<span>` sibling to the image, purely so it remains one
contiguous text node — this was required to keep the pre-existing test
assertion `getByText(/Bob: 9 tiles/)` matching unchanged; no visible text
or wording changed. 36×36 explicit `width`/`height`, `alt=""`. `<li>` count
and `aria-label="Opponents"` on the `<ul>` are unchanged.

## 13. Small layout refinements required

None beyond the CSS in §14 — no existing component was restructured, no
DOM element was moved, no existing class was removed.

## 14. Accessibility treatment

- Both new `<img>` elements use `alt=""` — per the ARIA spec, an `<img
  alt="">` gets an **implicit role of `presentation`/`none`**, which is
  correct decorative behavior: assistive tech skips it entirely rather
  than announcing an empty or generic name. (This also means
  `getByRole("img")` will never find these elements in a test — verified
  directly, and documented in the test comments, §16.)
- Nothing about the portrait is focusable — plain `<img>`, no
  `tabindex`, no click handler.
- Every piece of game-state meaning stays in text exactly as before:
  ready/not-ready (`aria-label="ready"`/`"not ready"`, unchanged), BOT
  badge (`aria-label="computer opponent"`, unchanged), host/you labels
  (unchanged), opponent name/tile-count/resigned/active-turn text
  (unchanged, §12). No portrait alone ever carries information a
  screen-reader user couldn't already get from the adjacent text.
- List semantics (`role="list"`/`"listitem"` via the native `<ul>`/`<li>`)
  are unaffected — the portrait is a child of the existing `<li>`, not an
  extra sibling.
- Verified directly, not just reasoned about:
  `accessibility.spec.ts`'s "Waiting Room page" and "Tabletop page" axe
  checks both pass clean on chromium **and** mobile-webkit after the
  portraits were added (§18) — zero new serious/critical violations.
- A pre-existing test, `TabletopLayout.test.tsx`'s "no artwork dependency
  (Phase 8)" block, asserted **zero** `<img>` elements anywhere on the
  Tabletop page — written before any tabletop artwork existed. That
  assertion is now literally false (the opponent-strip portrait is a real,
  intentional `<img>`), so it was updated, not weakened: the new version
  asserts every `<img>` present has `alt=""` (still fully decorative,
  still nothing required for correct rendering), which is the actual
  invariant the original test was protecting.

## 15. Responsive behavior

Verified at all 4 required viewports (1440×900, 1280×720, 390×844,
844×390) via the review screenshots (§19) and directly via
`tabletopMobile.spec.ts` (chromium + mobile-webkit, §18), which already
asserts zero horizontal overflow and re-runs its own axe scan. `flex-
shrink: 0` on `.seat-portrait`/`.opponent-portrait` (`global.css`) stops a
long display name from squeezing the portrait in a narrow row; the
existing `flex-wrap: wrap` on `.seat-identity`/`.seat-panel` (unchanged)
still governs overall wrapping. No fixed-width container outside the
portrait frame itself was introduced, so nothing about the surrounding
layout's own responsiveness changed.

## 16. Tests added or updated

- **New**: `apps/web/test/portraits.test.ts` — 8 tests covering
  `portraitForSeat`'s determinism, the 0-7 direct mapping, modulo wraparound,
  fallback on negative/non-integer/NaN input, and the always-fallback rule
  for computer seats, plus registry sanity (8 distinct roster entries, a
  fallback distinct from all of them).
- **Updated**: `apps/web/test/WaitingRoomPage.test.tsx` — +1 test:
  exactly 2 `<img alt="">` elements render (one per member), list item
  count unaffected, names remain independently findable.
- **Updated**: `apps/web/test/TabletopLayout.test.tsx` — +1 new test in
  the existing "opponents (Phase 8)" block (portraits present, decorative,
  list semantics/text intact); the 2 pre-existing "no artwork dependency"
  tests were updated per §14 rather than left failing or deleted.
- No test asserts on exact pixel values, full class strings, box-shadow
  values, or a screenshot diff.

## 17. Commands run and exact results

Database safety: `TEST_DATABASE_URL`/`DATABASE_URL` both exported to the
disposable `tilemeld_test` database (per `CLAUDE.local.md`) before any
command touching a truncatable database; a **separate**, freshly created
and migrated disposable database (`tilemeld_e2e_phase5`) was used for the
Playwright run (§18), with a freshly started server process pointed at it
(the previous session's leftover dev-server process, pointed at a
different database, was stopped first).

| Command | Result |
| --- | --- |
| `pnpm --filter @tile-meld/web test` (iterating) | pass — 211/211, 25 files |
| `pnpm run format:check` | pass (after fixing 2 new/modified files, plus one incidental pre-existing formatting drift in a Phase 6 script — see §24) |
| `pnpm run lint` | pass |
| `pnpm run typecheck` (6 workspace projects) | pass |
| `pnpm run test` (full suite) | pass — **724 passed**, 0 failed (`packages/shared` 45, `packages/engine` 115, `packages/bot` 36, `apps/web` 211 [201 prior + 10 new], `apps/server` 317, unchanged) |
| `pnpm run build` | pass — web + server |

## 18. Playwright verification results

```
cd e2e && npx playwright test \
  tests/accessibility.spec.ts tests/vs-computer.spec.ts \
  tests/full-lifecycle.spec.ts tests/tabletopMobile.spec.ts \
  --project=chromium --project=mobile-webkit
```

**22/22 passed, 7.1 minutes**, against the fresh `tilemeld_e2e_phase5`
database. This set was chosen specifically because it covers every place
this phase actually touched: `accessibility.spec.ts` includes the Waiting
Room and Tabletop axe checks (both engines, both clean — the direct proof
the new `<img alt="">`s introduced no violations); `vs-computer.spec.ts`
exercises the Waiting Room and Tabletop with a BOT member (the fallback
portrait's real code path); `full-lifecycle.spec.ts` exercises a
human-vs-human room end to end; `tabletopMobile.spec.ts` is the dedicated
390×844 mobile-overflow + axe check. No failure occurred, so there was
nothing to classify or investigate this phase.

## 19. Screenshot inventory

- **Path:** `docs/design-reference/phase-5-review/`
- **Count:** 24 (6 states × 4 viewports).
- **States:**
  1. `waiting-room-vs-computer` — human (real rival portrait) + BOT
     (fallback portrait) side by side, before the game starts.
  2. `tabletop-vs-computer` — active game, opponent strip showing the
     fallback portrait for the computer seat.
  3. `tabletop-human-opponent` — active 2-human game, opponent strip
     showing a genuine rival portrait (not the fallback).
  4. `waiting-room-two-human` — a 3-capacity room with 2 of 3 seats
     filled (deliberately under capacity, so it stays a genuine waiting
     room rather than auto-starting) — two distinct rival portraits.
  5. `waiting-room-multiplayer` — 3 of 4 seats filled, three distinct
     rival portraits visible at once.
  6. `tabletop-multiplayer` — active 4-player game, opponent strip
     showing 3 distinct rival portraits at once.
- **Viewports:** 1440×900, 1280×720, 390×844, 844×390.
- **Fallback-state requirement**: satisfied by states 1 and 2 above,
  produced by the real `portraitForSeat` mapping (every vs-computer game
  has a BOT seat, which always resolves to the fallback) — no contrived
  product-code change was needed to produce a fallback-portrait screenshot.
- Captured with `e2e/scripts/capture-phase-5-review.ts` (kept outside
  `e2e/tests`, same pattern as the other capture-phase-N scripts,
  `try/finally`-equivalent cleanup via a `withBrowser` wrapper so a setup
  failure can't orphan a browser process). Its first run hit the exact
  "claimUsername lands on Recovery, not Home" bug already documented in
  the Phase 4 closure summary — fixed the same way (click the header link
  before looking for Play vs Computer) before the successful rerun.
- **Sensitivity review:** all 24 screenshots were opened and reviewed this
  session. No recovery secrets, credentials, tokens, connection strings,
  or private URLs appear in any of them — every identity is a disposable
  per-run username (`Phase5VsBot*`, `Phase5Two*`, `Phase5Pair*`,
  `Phase5Multi*`), every room is disposable test data.
- **Visual-review criteria, checked directly against the captures:**
  - Portraits match the approved production pack (side-by-side against
    the `docs/` originals — same characters, same art, only resized).
  - Portraits read as native to the Phase 2-4 arcade system: the seat
    panel/opponent-plaque borders, accent colors, and typography around
    each portrait are entirely unchanged Phase 3/4 CSS.
  - Names, BOT/host/you labels, ready state, tile counts, and turn
    indicators remain the visually primary content in every capture —
    the portrait reads as a small enhancement, not a replacement.
  - No background remnants or opaque boxes: the `object-fit: cover`
    treatment fills its square frame cleanly, no visible seam or box
    around the portrait's own soft-vignette edge.
  - No horizontal overflow at any viewport (also independently confirmed
    by `tabletopMobile.spec.ts`, §18).
  - No gameplay/interaction element (drop zones, action buttons, chat)
    was displaced or resized by the portrait additions.
  - No portrait redesign occurred anywhere — every portrait pixel in the
    production copies is the source pixel data, only resized.

## 20. Confirmation that no portrait artwork was generated or altered

No portrait was drawn, generated, traced, or edited in content. The only
processing applied anywhere was mechanical resize + PNG recompression
(`scripts/derive-portraits.py`), applied exclusively to the **production
copies** under `apps/web/src/assets/portraits/` — every `docs/` original
was opened read-only and its MD5 checksum was unchanged after every run
this session, including the final check before writing this document.

## 21. Confirmation that no Phase 7 work occurred

No responsive/accessibility sweep beyond what portrait integration itself
required (§13-15) was performed. No file under `apps/web/src/styles/
global.css` was touched beyond the two new `.seat-portrait`/
`.opponent-portrait` rules and their surrounding comments (§14 of the
Phase 4 summary's "special-care" style — verified via `git diff`).

## 22. Confirmation that no gameplay/server/engine/bot behavior changed

No file under `packages/engine/src`, `packages/bot/src`, or
`apps/server/src` was touched. No API shape changed — `portraitForSeat`
consumes fields (`seatIndex`, `isComputer`) that already existed on the
client's existing `RedactedGameView`/room-member types; nothing new was
requested from the server. Confirmed by the diff itself and by
`apps/server`'s unit/integration suite (317/317, identical count to Phase
6) and the untouched drag-and-drop/action-bar/chat behavior (no file
under those areas appears in the diff).

## 23. Remaining open real-device Phase 6 checks

Unchanged and still open — this phase did not touch icons/PWA/manifest at
all: Android install/launcher-icon/maskable-cropping verification, iOS Add
to Home Screen verification, and desktop-installed-PWA verification (see
`docs/meld-masters-phase-6-summary.md` §30-33). None of these are Phase 5
work and none were performed or claimed as passed in this phase either.

## 24. Files changed

| File | Purpose |
| --- | --- |
| `apps/web/src/assets/portraits/*.png` (9 files) | New: production portrait copies (§8) |
| `apps/web/src/assets/portraits/README.md` | New: provenance/dimensions/fallback documentation |
| `apps/web/src/branding/portraits.ts` | New: registry + deterministic mapping (§9) |
| `apps/web/src/pages/WaitingRoomPage.tsx` | +portrait `<img>` in `.seat-identity` (§11) |
| `apps/web/src/tabletop/OpponentStrip.tsx` | +portrait `<img>`, text wrapped in a `<span>` (§12) |
| `apps/web/src/styles/global.css` | +`.seat-portrait`/`.opponent-portrait` frame rules; 2 stale comments updated (§14) |
| `apps/web/test/portraits.test.ts` | New: 8 tests (§16) |
| `apps/web/test/WaitingRoomPage.test.tsx` | +1 test |
| `apps/web/test/TabletopLayout.test.tsx` | +1 test; 2 existing tests updated (§14) |
| `scripts/derive-portraits.py` | New: deterministic portrait-resize script (§8) |
| `e2e/scripts/capture-phase-5-review.ts` | New: Phase 5 screenshot capture script |
| `docs/design-reference/phase-5-review/*.png` (24 files) | New: Phase 5 manual-review screenshots |
| `docs/meld-masters-phase-5-summary.md` | This document |
| `docs/task.md` | Phase 5 checkpoint recorded, Phase 7 next |
| `e2e/scripts/capture-phase-6-home.ts` | Incidental: 1-line pre-existing formatting fix, no behavior change (§17) |

## 25. Manual review instructions

- **This summary:** `docs/meld-masters-phase-5-summary.md`.
- **The registry:** `apps/web/src/branding/portraits.ts` (inline comments
  explain the mapping strategy and the no-bot-portrait deviation).
- **Screenshots:** `docs/design-reference/phase-5-review/` — or run the
  app locally (`pnpm --filter @tile-meld/server run dev` +
  `pnpm --filter @tile-meld/web run dev`) and start a Play vs Computer or
  multi-player game.
- **New tests:** `apps/web/test/portraits.test.ts`.

## 26. Recommended next step

**Phase 7 (responsive refinement and accessibility) after human review.**
Phase 7 has not started. Real-device verification for Phase 6 (§23) is
independent of this recommendation and remains open whenever the user is
able to perform it.
