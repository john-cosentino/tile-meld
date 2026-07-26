# Meld Masters visual refresh — Phase 0 summary

**Verification date:** 2026-07-26.
**Status: Phase 0 work is complete, but the checkpoint is NOT committed or
pushed.** The full verification gate is not cleanly green — see §"Verification
results" and §"Blocking issue: gate not clean" below. Per the phase's own
binding rule ("Do not commit and push a failing checkpoint unless the user
explicitly authorizes it"), this is a stop point for a human decision, not a
completed-and-shipped checkpoint.

## 1–6. Repository baseline

- **Branch:** `main`
- **Starting full commit hash:** `4cf3f2b273808d265bb5863e5b85538fdf9e48e8`
- **Starting latest commit subject:** "Add Claude Code permission settings"
- **Upstream:** `origin/main`, in sync (fetched; no ahead/behind divergence)
- **Initial worktree status:** clean except two expected untracked items
  already present at session start: `docs/design-reference/` (the five
  approved reference PNGs) and `docs/meld-masters-visual-refresh-plan.md`
  (the plan document, written and approved in a prior session). No unrelated
  modified or untracked files were present.
- **Repository-vs-plan discrepancies:** none material. The plan's Phase 0
  description matched the repository as found.

## 7. Verified visual-reference inventory

All five files in `docs/design-reference/meld-masters/` confirmed present,
valid PNG, non-corrupt, and previously visually inspected (during planning):

| File | Dimensions | Role |
| --- | --- | --- |
| `meld-masters-concept-01.png` | 1448×1086 | Desktop game screen |
| `meld-masters-concept-02.png` | 1448×1086 | Desktop lobby/dashboard |
| `meld-masters-concept-03.png` | 941×1672 | Phone-portrait game screen |
| `meld-masters-concept-04.png` | 941×1672 | Portrait-correction reference (confirmed by the user) |
| `meld-masters-concept-logo.png` | 1254×1254 | Approved logo/icon master |

No file was renamed, cropped, compressed, or altered. No asset was extracted,
derived, or generated from them in this phase. Prohibited-artwork rule
restated and honored: no old Tile Meld concept art, no mahjong imagery, no
old Tile Meld logos, no generic fantasy styling, no Street Fighter-style
portraits, no copied Nintendo/Punch-Out/Tron/other protected artwork appears
anywhere in this repository, and nothing in this phase introduced any.

## Work completed

- Verified the repository baseline and the reference collection (above).
- Updated `docs/task.md` to record the active initiative, current
  checkpoint, open blocker, and pending approvals (§17–18 below).
- Captured a full baseline screenshot set of the pre-redesign interface
  (§8 below) using a new, reusable capture script.
- Ran the complete verification gate plus a chromium browser baseline,
  diagnosing and documenting every failure encountered along the way
  (§9–10, §11).
- Wrote this summary.

**No branding implementation occurred.** `PRODUCT_NAME`, `index.html`'s
title, `manifest.json`, `sw.js`, and every other "Tile Meld" string in the
application are unchanged.
**No visual redesign occurred.** `global.css` and every component's styling
are unchanged.
**No game behavior changed.** No file under `packages/engine`,
`packages/bot`, `apps/server/src` (application logic), or
`apps/web/src` (application logic) was modified.
**No icon derivation occurred.** `apps/web/public/*.png` and `manifest.json`
are unchanged; no file was added under `apps/web/public/icons/`.
**No portrait implementation occurred.** No portrait asset or component was
added.

## Files changed or created

| File | Purpose |
| --- | --- |
| `docs/task.md` | Modified: records the active Meld Masters initiative, current Phase 0 checkpoint, blocker B3, pending approvals, and next-phase pointer. |
| `docs/design-reference/meld-masters/*.png` (5 files) | Newly tracked (were already on disk, untracked): the approved reference collection. |
| `docs/meld-masters-visual-refresh-plan.md` | Newly tracked (already on disk, untracked, written and approved in a prior session): the authoritative implementation plan. |
| `docs/design-reference/baseline/*.png` (52 files) | New: pre-redesign baseline screenshots, 13 states × 4 viewports. |
| `e2e/scripts/capture-baseline-screenshots.ts` | New: the reusable capture script (see §8). Lives outside `e2e/tests` (Playwright's `testDir`) so it is never picked up by `npx playwright test` or CI. |
| `docs/meld-masters-phase-0-summary.md` | New: this document. |

No application source file (`apps/*/src`, `packages/*/src`) was changed.

## 8. Baseline screenshot inventory

- **Directory:** `docs/design-reference/baseline/`
- **Total:** 52 screenshots (13 states × 4 viewports)
- **Viewports:** 1440×900, 1280×720, 390×844 (portrait), 844×390 (landscape) — every state captured at all four, per the plan's requirement.
- **Screens/states captured:**
  1. `home-dashboard-new` — brand-new, unclaimed identity (empty "Your Games", Play vs Computer disabled)
  2. `recovery` — immediately after claiming a username (username claim
     confirmation, rotate-recovery-code, and recover-session-on-this-device
     sections; the one-time recovery-secret display card had already been
     dismissed by this point in the flow, so no secret value appears in this
     screenshot — verified by direct inspection)
  3. `home-dashboard-claimed` — returning-user view (Play vs Computer enabled)
  4. `public-lobby`
  5. `create-room` (form, not submitted)
  6. `join-by-name` (form, not submitted)
  7. `waiting-room-vs-computer` — human seat + computer seat with BOT badge, before starting
  8. `tabletop-your-turn` — clean 14-tile rack, empty table
  9. `tabletop-computer-turn` — "Computer is playing…" state
  10. `tabletop-tile-selected` — a rack tile selected (gold ring, `aria-pressed`)
  11. `tabletop-invalid-set` — an invalid table set with its red dashed border, "not a valid run or group" caption, and the commit-penalty hint text
  12. `tabletop-completed-rematch` — "Game over" + one-click Rematch card
  13. `tabletop-unavailable-game` — direct navigation to a never-issued game id (the same code path a retention-purged game hits)
- **Missing state:** none. All 13 planned states were captured successfully at all 4 viewports on the final run (the script's first attempt hit two environment-caused failures — see §11 — both fixed, then a clean 52/52 run completed).
- The capture script (`e2e/scripts/capture-baseline-screenshots.ts`) reuses the real e2e helpers (`waitForReady`, `claimUsername`, `dragTo`) against a normal running dev server. It takes an output directory argument, so Phase 8's final review can re-run it unchanged against `docs/design-reference/final/`.

## 8a. Sensitive-data check (screenshots and documentation)

Verified by direct inspection before committing: no password, recovery
secret, session token, or private connection string appears in any of the
52 baseline screenshots or in any committed document. Specifically checked:
the `recovery` screenshots (all 4 viewports) show only a disposable local
test username and empty, unfilled "Player ID" / "Recovery secret" input
fields — the one-time recovery-secret display card
(`RecoveryCodeDisplay`, `apps/web/src/pages/RecoveryPage.tsx`) had already
been dismissed by the time these were captured, so no secret value is
visible. The `home-dashboard-new` screenshots show the "save your recovery
code" banner, which is a link only and never renders the secret inline.
Credentials used to run local services (database connection strings,
`SESSION_TOKEN_HMAC_SECRET`) were exported directly into shell environment
variables during this phase and were never echoed, printed, or written into
any file — command output was redacted (host/dbname only) wherever a
connection string needed to be referenced for verification.

## 9. Commands run and results

All commands run from `/home/johnc/git/tile-meld` with `TEST_DATABASE_URL`
and `DATABASE_URL` both explicitly confirmed pointed at `tilemeld_test`
before any command that could touch a database that gets truncated
(credentials were never printed — only the redacted host/dbname portion was
echoed for verification).

| Command | Result |
| --- | --- |
| `pnpm run format:check` | **pass** |
| `pnpm run lint` | **pass** |
| `pnpm run typecheck` | **pass** (6 workspace projects) |
| `pnpm run test` | **pass** — exit code 0 (pnpm's recursive runner fails on any package failure). Visible tail confirms `apps/server`: 317/317 tests, 28/28 files. Combined with the documented baseline (663 total = 38+115+36+157+317 across shared/engine/bot/web/server), this matches. |
| `pnpm run build` | **pass** — web (134 modules, 423 kB / 129 kB gzip) + server (`dist/index.js`, `migrate-cli.js`, migrations) |
| `cd e2e && npx playwright test --project=chromium` (attempt 1, against the long-lived local `tilemeld` dev DB) | **1 failed / 32 passed** — `public-lobby.spec.ts` (see §11) |
| `npx playwright test tests/public-lobby.spec.ts --project=chromium` (isolated retry, fresh `tilemeld_e2e_baseline` DB) | **pass** |
| `npx playwright test --project=chromium` (attempt 2, fresh `tilemeld_e2e_baseline` DB, but `DATABASE_URL` not exported for the test process itself) | **1 failed / 32 passed** — `turn-timeout.spec.ts` (see §11) |
| `npx playwright test tests/turn-timeout.spec.ts --project=chromium` (isolated retry, `DATABASE_URL` correctly exported to match the server) | **pass** |
| `npx playwright test --project=chromium` (attempt 3, fully fresh `tilemeld_e2e_baseline` DB, `DATABASE_URL` correctly exported for both server and test process) | **1 failed / 32 passed** — `public-lobby.spec.ts` again (see §11 — this is the unresolved one) |

## 10. Exact pass/fail results — final state

- Format, lint, typecheck, unit/integration tests, build: **all green.**
- Chromium e2e: **32 of 33 pass. `public-lobby.spec.ts` fails reproducibly
  (2 of 2 full-suite runs) even against a freshly created, correctly migrated,
  empty database with `DATABASE_URL` correctly matched between the server and
  the test process.** It passes in isolation. This is the one gate item that
  is not clean — see the next section.

## 11. Blocking issue: gate not clean

### What was ruled out first (two false starts, both resolved, not the real cause)

1. **First chromium run** (against the pre-existing, long-lived local
   `tilemeld` dev database, which had also just accumulated state from this
   session's own screenshot-capture script): `public-lobby.spec.ts` failed
   at its final step (`Quick Join` → expected the "Leave room" button,
   30s timeout, no rate-limit banner observed). Isolating and re-running just
   that spec against a freshly created, empty database (`tilemeld_e2e_baseline`)
   **passed**, appearing to confirm the spec's own code comment: quick-join
   matching "could be a different leftover room... in a long-lived local dev
   database."
2. **Second chromium run** (fresh DB, but I had not exported `DATABASE_URL`
   for the `npx playwright test` shell invocation itself):
   `turn-timeout.spec.ts` failed — it connects directly to Postgres using its
   own `process.env.DATABASE_URL` (`e2e/tests/turn-timeout.spec.ts`), which
   fell back to the wrong (old dev) database, so its direct
   `UPDATE turns ... WHERE game_id = $1` matched 0 rows in a database that
   didn't contain that game. This was a mistake in how I invoked the test
   process, not an application defect. Re-running with `DATABASE_URL`
   correctly exported and matching the server's own **passed**.

### The actual unresolved failure

3. **Third chromium run** — database dropped and fully recreated fresh,
   migrated cleanly (verified via `\dt`: all 16 tables present), server
   restarted against it, `DATABASE_URL` correctly exported and identical for
   both the server process and the `npx playwright test` process. **32 of 33
   passed. `public-lobby.spec.ts` failed again, at the identical final step**
   (Quick Join → "Leave room" never appears, no rate-limit banner, 90s test
   timeout).

This is now the second time this exact spec has failed this exact way in a
full 33-spec run, and it passed cleanly both times it was run **in
isolation**. That pattern — consistent failure in full-suite context,
consistent pass alone — points to an **order-dependent interaction with
state left behind by an earlier spec in the same run**, not random flakiness
and not a database-accumulation artifact (the third run started from a
database that had never seen `public-lobby.spec.ts` fail in it before).

**Likely mechanism (not fully proven, but well-supported):**
`public-lobby.spec.ts`'s final assertion uses the app's real Quick Join
endpoint, which — per that spec's own comment —
"intentionally matches the oldest-idle eligible open public room
system-wide," not a room this test created itself. If an **earlier** spec in
the same 33-test run leaves behind a public room with exactly one free seat,
Quick Join could match that room instead of one of this test's own
deliberately-spacious rooms. Per the app's own auto-start-on-capacity
behavior, filling that room's last seat would immediately transition it to
`in_game` and redirect the joining player straight to the Tabletop — never
showing the waiting room's "Leave room" button this test is waiting for.
`public-lobby.spec.ts`'s own comment shows its authors deliberately protected
this test's **own** two rooms from that exact race ("Both candidate rooms
are deliberately left with at least 2 free seats... can never be the one
that reaches capacity"); the same protection does not and cannot extend to
whatever public rooms other specs earlier in the run happen to leave behind.

**This is not a Phase 0 regression.** Phase 0 changed zero lines of
application code (`apps/server/src`, `apps/web/src`, `packages/*/src` are
all untouched — see "Files changed" above). This interaction, if the
mechanism above is correct, is a pre-existing property of the real
Quick Join + auto-start features, exposed only when the specific 33-test
execution order leaves a particular kind of room behind — and per
`docs/current-state.md`'s "Not verified" note, **this Playwright matrix had
never been run end-to-end on this machine before this session**, so there is
no prior baseline showing it was ever green. Per this phase's binding
non-goals, I did not attempt to fix, work around, or modify
`public-lobby.spec.ts`, the Quick Join endpoint, or the auto-start logic —
that is real application/test behavior, out of scope for a documentation-only
Phase 0.

**I did not attempt a third full re-run or a bisection to further isolate
which specific earlier spec leaves the problematic room.** Two consistent
full-suite failures against the identical final assertion, plus a
consistent pass in isolation, already give a confident diagnosis; further
retries risk reading as "trying until it goes green" rather than honest
verification, which the task's own instructions specifically warn against.

### Disposition

This is recorded as a genuine, newly-discovered verification gap — a
candidate for `docs/task.md`'s backlog, not something I fixed or worked
around. **I have not committed or pushed.** The checkpoint is complete and
ready for review, but the "run the specified verification" gate is not
100% clean, and per this phase's own rule ("Do not commit and push a failing
checkpoint unless the user explicitly authorizes it"), that decision belongs
to the user.

## 12–16. Confirmations

- No branding implementation occurred (§"Work completed").
- No visual redesign occurred (§"Work completed").
- No game behavior changed (§"Work completed").
- No icon derivation occurred (§"Work completed").
- No portrait implementation occurred (§"Work completed").

## 17. Open blocker B3

**Production portrait assets have not been supplied.** The portraits
embedded inside `meld-masters-concept-03.png` / `-04.png` are reference
material only and must not be cropped, traced, or reconstructed for
production use. This blocks only Phase 5. It does not block Phases 0–4 or 6.

## 18. Pending approval decisions

Recorded in `docs/task.md`, not silently treated as approved:

1. Retiring the functional light theme in favor of the dark arcade palette
   regardless of system `prefers-color-scheme`.
2. Adding and self-hosting the Silkscreen font (SIL OFL license).
3. Optionally placing the Meld Masters monogram
   (`meld-masters-concept-logo.png`) beside the live-text header wordmark.

## 19. Every file changed or created

See "Files changed or created" above (7 items / groups).

## 20. Manual review instructions

- **Implementation plan:** `docs/meld-masters-visual-refresh-plan.md`
- **This summary:** `docs/meld-masters-phase-0-summary.md`
- **Approved visual references:** open each file under
  `docs/design-reference/meld-masters/` directly (5 PNGs).
- **Baseline screenshots:** open files under `docs/design-reference/baseline/`
  directly, or view them side by side by state name (all four viewport
  variants share the same prefix before `--`).
- **The gate-failure investigation:** this document's §11, plus the
  underlying spec at `e2e/tests/public-lobby.spec.ts` and its Quick Join
  assertion around line 101, and `apps/server/src/db/repositories/rooms.ts`'s
  `findQuickJoinableRoom` for the matching logic referenced.

## 21. Planned Phase 0 Git commit message

```
docs: add Meld Masters design references, refresh plan, and baseline screenshots
```

**Not yet run.** See §22.

## 22. Final Git status

**No commit was created. No push occurred.** The worktree currently contains
all the Phase 0 changes described above, uncommitted, exactly as listed in
"Files changed or created." `git status` at the time of writing this summary:

```
 M docs/task.md
?? docs/design-reference/
?? docs/meld-masters-visual-refresh-plan.md
?? e2e/scripts/
```

(`docs/design-reference/` includes both the `meld-masters/` reference
collection and the new `baseline/` screenshots — 57 files total.)

This is intentional: §11 documents one gate item (`public-lobby.spec.ts`)
that is not clean, and per the phase's binding rule, committing and pushing
a checkpoint with a known-failing verification step requires the user's
explicit authorization, which has not yet been given.

## Note on local environment cleanup

During this phase, a disposable database `tilemeld_e2e_baseline` was created,
migrated, used for the diagnostic re-runs described in §11, and dropped again
before this summary was written — it no longer exists. The pre-existing local
dev server (`pnpm --filter @tile-meld/server run dev`) and Vite dev server
were both started during this phase to support screenshot capture and were
stopped again before finishing. The long-lived local `tilemeld` (dev)
database was **not** touched or cleaned up; it now contains extra
rooms/games/identities created by this session's screenshot-capture script
and its first diagnostic e2e run. This is ordinary local-development
accumulation, not destructive to any pre-existing data, but is noted here in
case the user wants to clear it manually.
