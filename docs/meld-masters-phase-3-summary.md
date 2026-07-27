# Meld Masters visual refresh — Phase 3 summary

## 1. Date

2026-07-27 (UTC).

## 2. Starting branch and commit

`main` @ `0eee903f80a54bf0d492243067785e3908ff0ee9` ("feat(theme): arcade
design tokens, display font, and global Meld Masters shell" — the Phase 2
checkpoint).

## 3. Starting worktree and upstream status

Verified before any edit: worktree clean, `main` tracking `origin/main`
with no ahead/behind divergence (fetched and confirmed). Matched the
expected starting point exactly.

## 4. Screens redesigned

Home dashboard, game-status cards, Public Lobby, Create Room, Join Room by
Name, Waiting Room, and Recovery — all seven screens in scope, each with a
presentation-only change: new/added CSS classes on existing markup, no
route, API call, or behavior changed.

## 5. Components changed

`apps/web/src/pages/HomePage.tsx`, `apps/web/src/dashboard/GameStatusCard.tsx`,
`apps/web/src/pages/PublicLobbyPage.tsx`, `apps/web/src/pages/CreateRoomPage.tsx`,
`apps/web/src/pages/JoinRoomPage.tsx`, `apps/web/src/pages/WaitingRoomPage.tsx`,
`apps/web/src/pages/RecoveryPage.tsx`. No other component file was touched.

## 6. CSS classes and reusable patterns added

All appended to `apps/web/src/styles/global.css` in one new section, reusing
the Phase 2 token system exclusively — no second token set was introduced.

- **`.page-title`** — page-level `<h1>` (Public Lobby, Create Room, Join
  Room, Recovery, Waiting Room's room-name heading). Silkscreen, 1.8rem —
  one step below HomePage's own `.dashboard-title` (2.5rem, also given
  `font-family: var(--font-display)` this phase, previously plain), which
  stays the single largest heading in the app.
- **`.panel-title`** — section/panel `<h2>` (Create a Game, Your Games,
  the new "Open Rooms", Choose a username, Rotate your recovery code,
  Recover a session on this device, the read-only Username panel).
  Compact, uppercase Silkscreen.
- **`.arcade-action` + `--cyan/--gold/--purple/--green`** — the four
  HomePage primary actions.
- **`.room-row` + `.room-row-meta`** — Public Lobby's room-browser rows.
- **`.arcade-choice-group` + `.arcade-choice`** — Create Room's segmented
  radio groups, using `:has(input:checked)`/`:has(input:focus-visible)` to
  react to the real native input state (no parallel selection mechanism).
- **`.code-readout`** — monospace, no letter-spacing/glow/blur, used for
  recovery codes and the Waiting Room's room code.
- **`.seat-list`, `.seat-panel` (+ `--accent-0..3`), `.seat-identity`,
  `.seat-name`, `.seat-state` (+ `--ready`/`--waiting`)** — Waiting Room
  member rows.
- **`button.accent-cyan`, `button.accent-gold`** — the button-hierarchy
  additions beyond Phase 2's `.primary` (cyan-filled) and `.danger`
  (coral-filled): `.accent-cyan` is an outlined cyan variant (Mark ready),
  `.accent-gold` is a filled gold variant (form submits, Start
  game/rematch, the recovery "I've saved it" acknowledgement).
- **`.arcade-panel` gained `padding: var(--space-4)`** (matching `.card`'s
  padding) — the only change to a Phase-2-defined rule. `.arcade-panel`
  was unused by any component in Phase 2 (the header uses its own
  `.app-header` rule), so this could not spill into anything already
  styled. Every Phase 3 panel/card/form uses `.arcade-panel` **instead
  of** `.card`, not combined with it — `.card` itself was never touched,
  so ChatPanel's Phase-4 tabletop usage of `.card` is provably unaffected.

## 7. Dashboard action treatment

The four actions keep their exact existing labels, `<button>`/`<Link>`
structure, and disabled/loading behavior. Play vs Computer keeps
`.primary` (solid cyan, Phase 2's contrast-corrected dark-on-accent text)
and additionally gets `.arcade-action--cyan` for the shared uppercase
Silkscreen treatment; New Game/Join Room by Name/Browse Public Lobby are
outlined gold/purple/green respectively — four legible, colour-coded, but
hierarchically distinct targets rather than four competing solid fills.
No subtitle text was invented; only the plain sentence already following
the row (Play vs Computer's existing description) remains.

## 8. Game-status card treatment

`GameStatusCard` changed exactly one class: `card` → `arcade-panel` (the
`dashboard-card`/`dashboard-card--{tone}` modifier classes, which carry
the tone-specific tinted background via `color-mix`, are untouched and
still win over `.arcade-panel`'s neutral border by normal cascade order,
since they're defined later in the file — confirmed by the existing
`HomePage.test.tsx` assertions on `card.className` still passing
unmodified). Status text, badge, meta line, and the single-link/one-card
interaction model are all unchanged.

## 9. Public-lobby room-browser treatment

The existing `<ul>`/`<li>` list stays a list — **not** converted to a
`<table>`. Each `<li>` is now `.room-row.arcade-panel`, with gold
hover/focus emphasis (`border-color: var(--neon-gold)` on `:hover`/
`:focus-within`) matching the concept's browser-row treatment. A new
`<h2 className="panel-title">Open Rooms</h2>` was added directly above
the list — genuinely new text, but explicitly requested ("Clear panel
title" is a named Phase 3 requirement for this screen, distinct from the
prohibition on inventing dashboard-action subtitles). No ping, round,
mode, or rank column was added; the existing metadata
(`{count}/{capacity} players -- {hours}h turn limit`, member names, Join
button) is unchanged verbatim.

## 10. Create-room form treatment

`.arcade-panel` replaces `.card` on the form; the three
`<fieldset>`/`<legend>` groups and every native `<input type="radio">` are
unchanged. Each `<label>` wrapping a radio is now `.arcade-choice`: the
native radio stays fully visible (never `display:none`/`opacity:0`), so
its own filled/unfilled dot remains a real, non-color affordance; a pure-CSS
`:has(input:checked)` rule additionally highlights the whole label with a
cyan border and a subtle tint. The submit button changed from `.primary`
to `.accent-gold` (filled gold, "established primary-action treatment" per
the brief). No new room setting was added.

## 11. Join-room form treatment

Same form-panel language as Create Room: `.arcade-panel` instead of
`.card`, `.page-title` heading, `.accent-gold` submit. The `Room name`
`<label>`/`<input>` implicit association is unchanged (still passes
`getByLabelText("Room name")`). No new field or step was added.

## 12. Waiting-room seat treatment

Each member `<li>` is now `.seat-panel.arcade-panel`, cycling through four
existing accent colors by seat index (`--accent-0..3`: cyan/gold/purple/
green) — purely decorative variety, never the only way to distinguish
seats (the name is always present as the primary identifier). Two-region
structure inside each seat panel:

- **`.seat-identity`** — name (`.seat-name`), the BOT badge (unchanged
  `aria-label="computer opponent"`), and host/you labels (now separate
  `<span className="muted">` elements instead of string-concatenated
  " (host)"/" (you)" suffixes — confirmed no test or e2e spec depended on
  the old concatenated-text-node format before making this change).
- **`.seat-state`** — the ready indicator, `--ready` (green
  border/text) or `--waiting` (muted), with the exact existing "✅ Ready"
  / "Not ready" text and `aria-label="ready"`/`"not ready"` unchanged.

A future Phase 5 portrait has an obvious insertion point (inside
`.seat-identity`, before the name) without restructuring this row — no
placeholder square, silhouette, or reserved empty space was added; per
the binding non-goals, nothing resembling final portrait art was created.
The room code now renders as `Room code: <code class="code-readout">...`
— same "Room code: " prefix, verified against `readRoomCode()`'s
`getByText(/^Room code: /)` + `.textContent()` parsing (the nested
`<code>` element's text is included in the parent `<p>`'s `textContent`,
so this helper is unaffected). Button hierarchy: Mark ready →
`.accent-cyan` (outlined), Start game/rematch → `.accent-gold` (filled,
was `.primary`), Leave room → unchanged `.danger`.

## 13. Recovery/identity treatment

Every existing panel (`Username`, `Choose a username`, the one-time
`RecoveryCodeDisplay`, `Rotate your recovery code`, `Recover a session on
this device`) is now `.arcade-panel` instead of `.card`; every `<h2>` gets
`.panel-title`. Recovery-code `<dd>` values (Player ID, Recovery secret)
changed from an inline `style={{fontFamily:"monospace", wordBreak:
"break-all"}}` to `<code className="code-readout">` — same monospace
font, same word-break, now also a bordered inset panel; **no letter-spacing,
glow, or blur was added**, per the explicit instruction that code
readability must never be traded for style. Silkscreen is never applied to
a code value (`.code-readout` sets `font-family: monospace` explicitly,
independent of `.panel-title`/`.page-title`, which are only ever applied
to headings). Claim username / Recover session / "I've saved it" all
changed from `.primary` to `.accent-gold`, matching the gold "commit
action" language established on Create Room and Join Room. Recovery logic,
storage keys, and rate-limit behavior are completely untouched — no new
automated e2e interaction was added against this screen.

## 14. Responsive behavior

No new media query was required beyond the two already added in Phase 2/3
(`.arcade-action` centers its text under 480px; `.brand-monogram` hides
under 480px, Phase 2). Every Phase 3 class uses `flex-wrap: wrap` where the
underlying layout already wrapped (`.room-row`, `.seat-panel`,
`.seat-identity`, `.arcade-choice-group`), so phone-width stacking is
inherited from the existing flex/grid structure, not reimplemented.
Confirmed by `tabletopMobile.spec.ts` (zero horizontal overflow at 390px)
and `dashboard.spec.ts`'s own narrow-viewport test, both passing (§18),
plus visual confirmation in the 390×844 and 844×390 screenshots (§20).

## 15. Accessibility protections

- Every fieldset/legend, label/input association, `aria-label`, and
  `role` from before this phase is unchanged — confirmed by the full
  existing unit-test suite passing with zero modifications needed to any
  assertion (only new tests were added, none of the pre-existing ones
  needed to change).
- New test: fieldsets remain accessible `role="group"` regions containing
  real `<input>` radios (not div-based fakes) —
  `apps/web/test/CreateRoomPage.test.tsx`.
- Checked-radio state is communicated through the native input's own
  dot (never hidden) plus a border/background change — never color alone.
- Ready/not-ready state keeps its exact text, independent of the new
  `.seat-state` styling — new test in `WaitingRoomPage.test.tsx`.
- No new purely-decorative element was introduced this phase (no new
  icon/glyph spans), so no new `aria-hidden` case was needed; the one new
  visible text addition (`"Open Rooms"` heading) is real, meaningful
  content, not decoration.
- Focus-visible: unchanged global rule from Phase 2 (cyan outline + glow,
  11–12:1 measured); `.arcade-choice` additionally outlines the whole
  label on `:has(input:focus-visible)`, on top of (not instead of) the
  input's own native focus ring.
- Reduced motion: the only new `transition` properties (`border-color` on
  `.arcade-action`, `.room-row`, `.arcade-choice`, `.seat-panel`) are
  short, non-essential, and automatically clamped by the existing global
  `prefers-reduced-motion` wildcard rule — no change to that rule was
  needed.

## 16. Contrast checks beyond Phase 2

No new token values were introduced, so no new base contrast pair needed
computing — every color used this phase (`--neon-cyan`, `--neon-gold`,
`--neon-purple`, `--neon-green`, `--state-success`, `--text-on-accent`,
`--text-muted`) was already measured against `--bg-page`/`--bg-panel` in
`docs/meld-masters-phase-2-summary.md` §6. The one new derived combination
— `--text-on-accent` on `.accent-gold`'s `--neon-gold` fill — is identical
to the button-fill case already measured there (12.57:1). This was
verified end to end by the required `accessibility.spec.ts` axe run
passing clean (zero serious/critical violations) on every one of the seven
touched screens, on both chromium and mobile-webkit (§18) — not lowered or
narrowed to reach that result.

## 17. Tests added or updated

- **`apps/web/test/CreateRoomPage.test.tsx`** (+1 test) — fieldset/legend
  group-role accessibility with real `<input>` radios.
- **`apps/web/test/PublicLobbyPage.test.tsx`** (+1 test) — the new "Open
  Rooms" `<h2>` panel title.
- **`apps/web/test/WaitingRoomPage.test.tsx`** (+1 test) — exact ready/
  not-ready text stays visible independent of the new seat-state styling.
- No existing test in any of the seven touched files needed modification —
  every pre-existing assertion (role/label/text queries) passed unchanged
  against the restyled markup, confirming the restyle stayed
  presentation-only.
- No test asserts an exact box-shadow, border-radius, hex color, or full
  class-attribute string, per the explicit instruction against that kind
  of brittleness.

## 18. Commands run and exact results

Database safety: `TEST_DATABASE_URL`/`DATABASE_URL` confirmed (redacted)
pointed at `tilemeld_test` before any command touching a truncatable
database. E2E used a freshly created, freshly migrated
`tilemeld_e2e_baseline`, with the server process and Playwright process
given the identical `DATABASE_URL`.

| Command | Result |
| --- | --- |
| `pnpm --filter @tile-meld/web run typecheck` | pass, after each of the 7 page edits |
| `pnpm --filter @tile-meld/web exec vitest run <file>` per changed page | pass, after each edit |
| `pnpm --filter @tile-meld/web run test` (full web suite) | pass — 23 files, 177 tests (174 prior + 3 new) |
| `pnpm run format:check` | pass |
| `pnpm run lint` | pass |
| `pnpm run typecheck` (6 workspace projects) | pass |
| `pnpm run test` | pass — exit 0; `apps/server` tail confirms 317/317 across 28 files (untouched by this phase) |
| `pnpm run build` | pass — web (135 modules) + server; hashed asset output unchanged in kind from Phase 2 |

## 19. Playwright results and any documented WebKit harness behavior

```
cd e2e && npx playwright test \
  tests/dashboard.spec.ts tests/public-lobby.spec.ts tests/full-lifecycle.spec.ts \
  tests/reconnect-recovery.spec.ts tests/accessibility.spec.ts tests/tabletopMobile.spec.ts \
  --project=chromium --project=mobile-webkit
```

**38/38 passed, 8.5 minutes.** No failure, no retry, no WebKit-family
timeout of the kind documented in Phase 1 — this run was clean on the
first attempt on both projects. This includes all seven
`accessibility.spec.ts` axe checks (Home, Create Room, Join Room, Public
Lobby, Recovery, Waiting Room, Tabletop) on both chromium and
mobile-webkit (14 axe passes total), plus the 390px mobile-overflow scan.
No threshold was lowered, no selector was weakened, and no assertion was
retried into passing.

## 20. Screenshot inventory

- **Path:** `docs/design-reference/phase-3-review/`
- **Count:** 28 (7 states × 4 viewports)
- **Screens:** `home-dashboard` (claimed identity — also stands in for the
  empty state, since a fresh claimed identity's dashboard is materially
  identical to the unclaimed one already captured in Phase 0/2, just with
  Play vs Computer enabled; a near-duplicate second capture was judged not
  worth adding), `public-lobby` (seeded with real rooms via a disposable
  second identity), `create-room`, `join-by-name`, `waiting-room` (human +
  computer opponent, via the Play vs Computer flow), `recovery`, and
  `home-dashboard-populated` (the eighth/bonus screen — the same identity's
  dashboard after the waiting-room capture, now showing one real "Open"
  status card, chosen over a redundant empty-dashboard variant as more
  genuinely useful per the brief's own suggestion).
- **Viewports:** 1440×900, 1280×720, 390×844, 844×390 — every state at
  every viewport.
- Captured with `e2e/scripts/capture-phase-3-review.ts` (kept outside
  `e2e/tests` so it never runs as part of the real suite or CI, same
  pattern as the Phase 0/2 scripts).
- `docs/design-reference/baseline/` and `.../phase-2-review/` were not
  touched (`git status` confirms zero change to either).
- Visual confirmation from the captures: a coherent arcade lobby system
  across all seven screens; the room browser is easy to scan; forms stay
  simple with visible native radio state; the waiting room's seat panels
  and ready/not-ready state are immediately legible; recovery codes remain
  in plain monospace with no glow/blur; no horizontal overflow at any
  viewport; body/help/instruction text stays in the system font throughout
  — only headings and panel titles use Silkscreen.

## 21. Confirmation: no Phase 4 tabletop work occurred

No file under `apps/web/src/tabletop/`, no `.tabletop-*` CSS rule, and no
line of `TabletopPage.tsx` was touched. `.card` itself (which ChatPanel
uses) was never modified — only pre-game screens switched to the separate
`.arcade-panel` class, as detailed in §6.

## 22. Confirmation: no portraits were added

No portrait asset, portrait component, or portrait placeholder (square,
silhouette, or otherwise) was added anywhere. The Waiting Room's seat
structure was organized to make a future Phase 5 portrait insertion clean
(§12), but nothing resembling final or placeholder portrait art exists in
this commit. Blocker B3 is unaffected.

## 23. Confirmation: no PWA/icon work occurred

`apps/web/public/manifest.json`, `apps/web/public/sw.js`,
`apps/web/public/*.png`, and every icon `<link>` in `apps/web/index.html`
are byte-for-byte unchanged (`git diff` confirms no touch to any of these
paths). No maskable icon, favicon, or manifest icon entry was added or
changed.

## 24. Confirmation: no game, server, room, or recovery behavior changed

No file under `packages/engine/src`, `packages/bot/src`, or
`apps/server/src` was touched. Room lifecycle, Quick Join, auto-start,
recovery, and rate-limit logic are unaffected — confirmed by the diff
itself, by the full unit/integration suite (`apps/server`: 317/317,
identical to Phase 2), and by the e2e run in §19 (which directly exercises
room creation/join/ready/start/rematch/resign via `full-lifecycle.spec.ts`
and session recovery via `reconnect-recovery.spec.ts`, both passing
unmodified).

## 25. Remaining blocker B3

Unchanged: production character-portrait assets have not been supplied.
Blocks only Phase 5.

## 26. Files changed

| File | Purpose |
| --- | --- |
| `apps/web/src/styles/global.css` | Phase 3 CSS section: page/panel titles, arcade actions, room-browser rows, arcade-choice radios, code-readout, seat panels, button accents; one `.arcade-panel` padding addition; `.dashboard-title` gained Silkscreen |
| `apps/web/src/pages/HomePage.tsx` | Panel titles; four actions restyled with `.arcade-action` + accents |
| `apps/web/src/dashboard/GameStatusCard.tsx` | `card` → `arcade-panel` |
| `apps/web/src/pages/PublicLobbyPage.tsx` | Page/panel titles (new "Open Rooms" heading); room rows restyled |
| `apps/web/src/pages/CreateRoomPage.tsx` | Page title; arcade-panel form; arcade-choice radios; gold submit |
| `apps/web/src/pages/JoinRoomPage.tsx` | Page title; arcade-panel form; gold submit |
| `apps/web/src/pages/WaitingRoomPage.tsx` | Page title; seat-panel member rows; code-readout room code; button-accent hierarchy |
| `apps/web/src/pages/RecoveryPage.tsx` | Page/panel titles; arcade-panel sections; code-readout for recovery values; gold action buttons |
| `apps/web/test/CreateRoomPage.test.tsx` | +1 test: fieldset/legend accessibility |
| `apps/web/test/PublicLobbyPage.test.tsx` | +1 test: "Open Rooms" heading |
| `apps/web/test/WaitingRoomPage.test.tsx` | +1 test: ready-state text visibility |
| `e2e/scripts/capture-phase-3-review.ts` | New: Phase 3 screenshot capture script |
| `docs/design-reference/phase-3-review/*.png` (28 files) | New: Phase 3 manual-review screenshots |
| `docs/meld-masters-phase-3-summary.md` | This document |
| `docs/task.md` | Phase 3 checkpoint recorded, Phase 4 next-but-not-started |

## 27. Manual review instructions

- **This summary:** `docs/meld-masters-phase-3-summary.md`
- **The CSS foundation and its reasoning:** the new section at the end of
  `apps/web/src/styles/global.css` (inline comments explain the
  `.arcade-panel`-vs-`.card` isolation decision and every class's scope).
- **Screenshots:** `docs/design-reference/phase-3-review/` — open any
  `home-dashboard*--*`, `public-lobby--*`, `create-room--*`,
  `join-by-name--*`, `waiting-room--*`, or `recovery--*` file directly, or
  run the app locally (`pnpm --filter @tile-meld/server run dev` +
  `pnpm --filter @tile-meld/web run dev`) and browse it live.
- **New tests:** the three files listed in §17.

## 28. Recommended next step

**Human review before Phase 4.** Phase 4 (tabletop, rack, tiles, action
bar, status frame) is the highest-risk phase (drag-and-drop precision,
tile contrast, the active-game surface) and should not start until this
checkpoint is reviewed.
