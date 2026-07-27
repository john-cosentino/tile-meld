# Meld Masters visual refresh — Phase 1 summary

## 1. Date

2026-07-26 through 2026-07-27 (UTC).

## 2. Starting branch and commit

`main` @ `cc307c239b1c9d59aa5ed47f0c2db0f082bafc68` ("docs: add Meld Masters
design references, refresh plan, and baseline screenshots" — the Phase 0
checkpoint).

## 3. Starting worktree and upstream status

Verified before any edit: worktree clean, `main` tracking `origin/main`
with no ahead/behind divergence (fetched and confirmed). Matched the
expected starting point exactly; no repository-vs-plan discrepancy found.

## 4. Checkpoint A — test-isolation diagnosis and correction

### Diagnosis

Phase 0's documented `public-lobby.spec.ts` gap was investigated further,
and the original hypothesis (an earlier spec leaves a public room behind)
was **disproven**: `git grep` across every spec that runs before it in the
suite found none creates any public room.

The actual mechanism, confirmed empirically:

1. `npx playwright test tests/public-lobby.spec.ts --project=chromium
   --repeat-each=10` against a single database, with **no other spec
   involved at all** — repeat 1 passed, repeats 2 and 9 failed. This
   isolates the cause to repeated executions of the spec itself, not
   suite-wide ordering.
2. `findQuickJoinableRoom` (`apps/server/src/db/repositories/rooms.ts:339`)
   matches the oldest-idle open public room system-wide with a free seat —
   by design, not a bug. The spec's own two rooms are deliberately left
   with ≥2 free seats each, so a single run's own Quick Join can never fill
   either one. But a **previous** run's successful Quick Join leaves
   whichever room it joined with exactly 1 free seat, still `open`. A later
   run's Quick Join can legitimately match that leftover room and complete
   it to capacity — correctly triggering the same shared auto-start-on-capacity
   behavior any last-seat join uses (`game/roomStart.ts`), redirecting
   straight to the Tabletop instead of leaving the player in the Waiting
   Room.
3. Confirmed this is intentional, shared production behavior (not a
   defect): the same auto-start path is exercised and asserted directly by
   `dashboard.spec.ts`'s "a 2-player room shows Active on the dashboard
   immediately after capacity auto-start" test.

### Correction

`e2e/tests/public-lobby.spec.ts`'s final assertion was widened to accept
both real outcomes production can produce — landing in the Waiting Room
(`"Leave room"`) or, if the matched room happened to fill and auto-start,
landing directly on a dealt Tabletop (`"Your rack (N)"` heading) — instead
of assuming only the former is possible. No application code was touched;
no timeout was raised; no sleep or blind retry was added; no selector was
weakened (both accepted outcomes are still specific, real, accessible-role
locators).

### Files changed

- `e2e/tests/public-lobby.spec.ts` (test-only; comment and assertion
  logic).

### Why the fix is deterministic

It no longer depends on an unproven assumption about system-wide room
state. Whichever of the two legitimate outcomes production actually
produces, the test now recognizes it — there is no longer a code path
where a correct server response can fail the test.

### Verification results

- `--repeat-each=10` in isolation against a database **already polluted**
  by the prior failing runs: 10/10 passed.
- Full chromium project (33 specs): 33/33 passed.

### Test-isolation commit hash

`15bc370f8c86c2dd69355c27223ceade269bba04` — pushed before Checkpoint B
began.

## 5. Files changed for the e2e correction

See §4 — one file, `e2e/tests/public-lobby.spec.ts`.

## 6. Public-branding locations changed

| Location | Change |
| --- | --- |
| `packages/shared/src/branding.ts` | `PRODUCT_NAME` → `"Meld Masters"` (single source of truth); header comment updated to describe the rename accurately |
| `apps/web/src/layout/RootLayout.tsx`, `apps/web/src/pages/HomePage.tsx` | No edit needed — already consumed `PRODUCT_NAME`, updated automatically |
| `apps/web/src/pages/TabletopPage.tsx` | Two hardcoded `<h1>Tile Meld</h1>` (not-found and loading states) replaced with `{PRODUCT_NAME}`; import added |
| `apps/web/index.html` | `<title>` → `Meld Masters` |
| `apps/web/public/manifest.json` | `name` and `short_name` → `Meld Masters`. Icons, theme/background color, display mode, start URL, scope — all untouched (Phase 6 scope) |
| `apps/web/public/sw.js` | Push-notification fallback `title` → `Meld Masters`. The invisible notification dedup `tag: "tile-meld"` left unchanged (a technical identifier, not a public name) |
| `apps/server/src/realtime/gateway.ts` | Imports `PRODUCT_NAME` from `@tile-meld/shared`; both push-body strings now interpolate it (`` `It's your turn in ${PRODUCT_NAME}.` `` / `` `Your turn in ${PRODUCT_NAME} ends soon.` ``). Tag, payload structure, and delivery/timing logic unchanged |
| `apps/web/src/assets/tabletop/README.md` | One originality-policy sentence ("Meld Masters is not Rummikub...") updated — an active, non-historical rules document read by future phases |
| `apps/web/src/styles/global.css` | One code comment updated to match the renamed test description it quotes |

## 7. Internal identifiers deliberately retained

Per the plan's §5.5 and this session's explicit instructions, none of the
following were touched: `@tile-meld/*` package scopes; the repository name
and directory; the GitHub remote; Render service/database names;
PostgreSQL database/user names; Docker image/container/volume names; the
`tilemeld_session` cookie; the `tilemeld.identity` and
`tilemeld.recentRooms` localStorage keys; the `tile-meld` notification tag;
server log identifiers; environment-variable names; CI filters; the
`@tile-meld/` build-script package-prefix check; existing deployment URLs.
No migration shim was introduced for any of these.

## 8. Tests added or updated

**Updated** (assertions whose expected public copy changed):

- `apps/web/test/HomePage.test.tsx` — heading text and test description.
- `apps/server/test/push/pushSender.test.ts` — two fixture `body` literals
  (arbitrary test-input data echoed through `sendPushToPlayer`, updated for
  consistency/realism, not because the mechanism under test required it).
- `e2e/tests/helpers.ts` — `waitForReady()`'s heading locator (gates most
  of the suite).
- `e2e/tests/dashboard.spec.ts` (19 occurrences), `purgedGame.spec.ts` (1),
  `reconnect-recovery.spec.ts` (1), `rematch.spec.ts` (2),
  `vs-computer.spec.ts` (2) — all exact `"Tile Meld"` role-locator literals
  replaced with `"Meld Masters"`. No selector was changed in kind (still
  accessible-role queries), only the expected name.
- `e2e/scripts/capture-baseline-screenshots.ts` — the Phase 0 baseline
  capture script (live tooling reused in Phase 8, not documentation) had
  three stale `"Tile Meld"` locators updated so it keeps working.

**Added** (branding-protection, per the plan's testing strategy):

- `packages/shared/test/branding.test.ts` — asserts `PRODUCT_NAME` is
  exactly `"Meld Masters"` and not the old name; validates the tile-token
  shape (4 colors, each with code/label/hex/symbol), the color→token index,
  joker glyph/label distinctness, turn-limit options, and the meld
  threshold. 7 tests.
- `apps/web/test/brandConsistency.test.ts` — reads `index.html`,
  `public/manifest.json`, and `public/sw.js` from disk (path resolved from
  the test file's own `import.meta.url`, not `process.cwd()` or any
  absolute developer-machine path) and asserts each contains the current
  `PRODUCT_NAME` and none contains `"Tile Meld"`; validates the manifest
  parses as JSON with matching `name`/`short_name`; confirms the SW's
  notification tag is unchanged; and guards `apps/web/public/` against
  unexpected files via an explicit allowlist. 9 tests.

## 9. Documentation updated

Public-facing/current-operating documents only, each given the same short,
factual note (public name is Meld Masters; `tile-meld` is the retained
internal identifier, with a pointer to the plan's §5.5):

- `README.md` — title and a new explanatory sentence.
- `CLAUDE.md` — title and the same note.
- `docs/environment.md` — title and the same note.
- `docs/current-state.md` — title, the same note, and one added sentence
  clarifying the pre-rename verification below it predates the rename.
- `docs/task.md` — full rewrite of the active-initiative section: current
  checkpoint, a new "Phase history" section recording both Phase 0 and
  Phase 1/Checkpoint A with their commit hashes, and the resolved
  candidate-work item struck through with a pointer to this document.

**Historical documents were not touched**, per the plan's explicit
instruction: `docs/changes.md`, `docs/computer-opponent.md`,
`docs/decisions.md`, `docs/next-changes-implementation-plan.md`,
`docs/opus-implementation-plan.md`, `docs/phase-0*.md`,
`docs/meld-masters-phase-0-summary.md`, `tile-meld-opus-planning-prompt.md`.
These retain the terminology that was accurate when they were written.

## 10. Old-name sweep results and classification

`git grep -n "Tile Meld"` (not plain `grep` — `packages/bot/src/candidates.ts`
is known to be misdetected as binary by plain grep, per the plan's §3.7
gotcha) returned matches in exactly these categories, all allowed:

- **Historical documentation** (unedited by design): `docs/changes.md`,
  `docs/computer-opponent.md`, `docs/decisions.md`,
  `docs/next-changes-implementation-plan.md`,
  `docs/opus-implementation-plan.md`, `docs/phase-06-dashboard.md`,
  `docs/phase-08-tabletop-layout.md`, `tile-meld-opus-planning-prompt.md`.
- **The visual-refresh plan and the Phase 0 summary**, discussing the
  rename by name (exactly the allowed "phase summaries discussing the
  rename" category): `docs/meld-masters-visual-refresh-plan.md`,
  `docs/meld-masters-phase-0-summary.md`.
- **Explanatory migration text this session added**: `docs/current-state.md`,
  `docs/task.md` (both say "renamed from Tile Meld"),
  `packages/shared/src/branding.ts`'s header comment (explains what Phase 1
  renamed).

A broader case-insensitive sweep for `tilemeld`/`TileMeld` outside Markdown
files found only the retained internal identifiers (Postgres username in
`.github/workflows/ci.yml` and `render.yaml`) — no additional public-facing
occurrence anywhere.

**No active application code, browser metadata, manifest metadata,
service-worker title, or server notification body contains the old public
name.**

## 11. Database-safety confirmation

Before any command that could touch a database that gets truncated,
`TEST_DATABASE_URL` and `DATABASE_URL` were confirmed (credentials
redacted, never printed) to both point at
`postgres://[redacted]@localhost:5432/tilemeld_test` — the dedicated,
disposable test database, matching every previous session's pattern. For
e2e runs, a separate disposable database, `tilemeld_e2e_baseline`, was
created fresh and migrated, with the server process and the Playwright
process given the identical `DATABASE_URL` (a mismatch here caused one of
the Phase 0 false starts — verified not repeated this session). Neither
database contains data of any value; `tilemeld_e2e_baseline` was dropped
again after this phase's verification completed.

## 12. Commands run and exact results

All from `/home/johnc/git/tile-meld` unless noted.

| Command | Result |
| --- | --- |
| `pnpm run format:check` | pass |
| `pnpm run lint` | pass |
| `pnpm run typecheck` (6 workspace projects) | pass |
| `pnpm run test` | pass — exit 0; visible tail confirms `apps/server` 317/317 across 28 files |
| `pnpm run build` | pass — web (134 modules) + server; built `index.html` spot-checked to contain `<title>Meld Masters</title>` |
| `pnpm --filter @tile-meld/web run test` | pass — 22 files, 166 tests (157 prior + 9 new in `brandConsistency.test.ts`) |
| `pnpm --filter @tile-meld/shared exec vitest run test/branding.test.ts` | pass — 7/7 |
| `pnpm --filter @tile-meld/server exec vitest run test/push/pushSender.test.ts` | pass — 5/5 |
| Checkpoint A: `--repeat-each=10` isolated, then full chromium project | 10/10, then 33/33 — see §4 |
| `cd e2e && npx playwright test` (full 5-project matrix), attempt 1 | 163/165 passed, 2.2h (anomalous — includes a ~31-minute span with zero server requests, i.e. a genuine harness-level stall, not applicable code). Failures: `[webkit] two-player-smoke.spec.ts:17` (timeout waiting for the post-rename heading during identity bootstrap), `[mobile-webkit] turn-timeout.spec.ts:18` (`browserContext.newPage()` cancelled by the test's own timeout) |
| Isolated re-run of both attempt-1 failures | `webkit two-player-smoke.spec.ts` (3 tests): 3/3 pass, 1.4m. `mobile-webkit turn-timeout.spec.ts`: 1/1 pass, 1.1m |
| Full matrix, attempt 2 (fresh confirmation, not accepting one bad run) | 163/165 passed, 43.5m (normal pace). Failures: `[webkit] two-player-smoke.spec.ts:17` again — **different failure point** (this time inside `claimUsername`, not `waitForReady`) — and `[mobile-webkit] tabletopMobile.spec.ts:12` (an axe scan cut off by the test's own timeout) |

## 13. Full Playwright matrix result

**Not 100% clean on either attempt, and this was reported to the user
before proceeding — they explicitly authorized committing anyway** (see
§"Disposition" below).

Across both full-matrix attempts (330 total test executions):

- **`chromium`, `firefox`, `mobile-chrome`: 198/198 passed across both
  runs — zero failures, either attempt.**
- **`webkit`, `mobile-webkit`: 4 distinct failures across the two runs**,
  all timeout-class (never an assertion mismatch), all in a different
  spec or a different point within the same spec each time, none
  reproducible when the specific failing test was re-run in isolation.

### Disposition

This pattern — failures exclusively in the two WebKit-engine projects,
always timeouts, never the same failure point twice, never reproducible
alone — is consistent with `e2e/playwright.config.ts`'s own existing
documented position: *"Real Safari (desktop/iOS) is NOT certified by
Playwright's WebKit engine... CI runs WebKit as a best-effort proxy
only... Manual or hosted real-device checks against actual Safari... [are]
a required release-gate step... not something this CI config can claim to
cover."* Per `docs/current-state.md`'s pre-Phase-0 note, this full matrix
had never been run end-to-end before this initiative, so there is no prior
green WebKit baseline to compare against — this cannot be reported as a
regression, only as an observed, apparently pre-existing environmental
characteristic of WebKit on this Linux host.

Phase 1 changed zero timing-relevant code — every change is a string
literal or a direct interpolation of one. It is not plausible that
renaming a product name caused a browser-engine-specific performance
ceiling.

This was reported in full to the user (both runs, all four failures, the
isolated-reproduction evidence) **before** any commit, exactly mirroring
the Phase 0 precedent where a known gate gap was surfaced for an explicit
decision rather than resolved unilaterally. The user reviewed this and
explicitly authorized committing with the WebKit flakiness documented
rather than requiring a third multi-hour run or further infrastructure
investigation (both of which were offered as options).

## 14. Confirmation: no visual redesign occurred

`global.css` was touched in exactly one place: a code comment (§6). No
selector's styling, no color, no spacing, no layout rule changed. No
`text-transform`, no new class, no new CSS custom property.

## 15. Confirmation: no icon replacement occurred

`apps/web/public/*.png` are byte-for-byte unchanged. No file was added
under `apps/web/public/icons/`. No favicon was added or changed.

## 16. Confirmation: no game behavior changed

No file under `packages/engine/src`, `packages/bot/src`,
`apps/server/src` (excluding the one-line string interpolation in
`gateway.ts`), or `apps/web/src` (excluding the `PRODUCT_NAME` import/usage
in `TabletopPage.tsx`) was modified. Room lifecycle, Quick Join matching,
auto-start-on-capacity, drag-and-drop, and turn logic are all untouched —
confirmed both by the diff itself and by the full unit/integration suite
and (with the one documented, pre-existing WebKit caveat) the e2e matrix
passing.

## 17. Remaining blocker B3

Unchanged from Phase 0: production character-portrait assets have not been
supplied. Blocks only Phase 5.

## 18. Pending Phase 2 decisions

Unchanged from Phase 0, still pending:

1. Retiring the functional light theme in favor of the dark arcade palette
   regardless of system preference.
2. Adding and self-hosting the Silkscreen font (SIL OFL license).
3. Optionally placing the Meld Masters monogram beside the live-text
   header wordmark.

## 19. Files changed

| File | Purpose |
| --- | --- |
| `e2e/tests/public-lobby.spec.ts` | Checkpoint A: test-isolation fix (see §4–5) |
| `packages/shared/src/branding.ts` | `PRODUCT_NAME` → `Meld Masters`; comment updated |
| `apps/web/src/pages/TabletopPage.tsx` | Two hidden headings now use `PRODUCT_NAME` |
| `apps/web/index.html` | `<title>` renamed |
| `apps/web/public/manifest.json` | `name`/`short_name` renamed |
| `apps/web/public/sw.js` | Push fallback title renamed; tag preserved |
| `apps/server/src/realtime/gateway.ts` | Push body strings interpolate `PRODUCT_NAME` |
| `apps/web/src/assets/tabletop/README.md` | One originality-policy sentence renamed |
| `apps/web/src/styles/global.css` | One stale code comment corrected |
| `apps/web/test/HomePage.test.tsx` | Heading assertion + description renamed |
| `apps/server/test/push/pushSender.test.ts` | Two fixture literals renamed |
| `e2e/tests/helpers.ts` | `waitForReady()`'s heading locator renamed |
| `e2e/tests/dashboard.spec.ts` | 19 locator literals renamed |
| `e2e/tests/purgedGame.spec.ts` | 1 locator literal renamed |
| `e2e/tests/reconnect-recovery.spec.ts` | 1 locator literal renamed |
| `e2e/tests/rematch.spec.ts` | 2 locator literals renamed |
| `e2e/tests/vs-computer.spec.ts` | 2 locator literals renamed |
| `e2e/scripts/capture-baseline-screenshots.ts` | 3 stale locators fixed so Phase 8 reuse still works |
| `packages/shared/test/branding.test.ts` | New: branding-protection test |
| `apps/web/test/brandConsistency.test.ts` | New: static-file consistency test |
| `README.md` | Title + explanatory note |
| `CLAUDE.md` | Title + explanatory note |
| `docs/environment.md` | Title + explanatory note |
| `docs/current-state.md` | Title + explanatory note |
| `docs/task.md` | Rewritten active-initiative/history/pending sections |
| `docs/meld-masters-phase-1-summary.md` | This document |

## 20. Manual review instructions

- **This summary:** `docs/meld-masters-phase-1-summary.md`
- **The Checkpoint A fix and its reasoning:** `e2e/tests/public-lobby.spec.ts`
  (the updated comment block explains the mechanism in full), and
  `apps/server/src/db/repositories/rooms.ts:339` (`findQuickJoinableRoom`)
  for the matching logic referenced.
- **The rename itself:** `packages/shared/src/branding.ts:13`
  (`PRODUCT_NAME`) is the single source; every consumer is listed in §6.
- **New tests:** `packages/shared/test/branding.test.ts`,
  `apps/web/test/brandConsistency.test.ts`.
- **To re-verify locally:** run the app (`pnpm --filter @tile-meld/server
  run dev` + `pnpm --filter @tile-meld/web run dev`) and confirm the
  browser tab title, header link, and every heading read "Meld Masters"
  with no visual change otherwise.

## 21. Recommended next step

**Human approval before Phase 2.** Phase 2 (design tokens and the global
arcade foundation) is a visual change and should not start until this
checkpoint is reviewed and the three pending decisions in §18 are resolved.
