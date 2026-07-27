# Current state — Meld Masters

Public product name: **Meld Masters** (renamed from Tile Meld, Phase 1 of
`docs/meld-masters-visual-refresh-plan.md`, 2026-07-26). `tile-meld` remains
the internal repository name, package scope, and deployment identifier —
see the plan's §5.5. The verification below predates the rename and
describes the state as of the date given.

- **Last verified:** 2026-07-25
- **Last verified commit:** `7d6248a`
- **Working tree at verification:** clean, branch `main`, in sync with
  `origin/main`

This file replaces `HANDOFF.md`, which was written for a different assistant and
had drifted badly — it reported 366 tests when there are 663, and listed PR #2
as the newest merge after PR #3 had landed. Its durable content was moved:
gotchas to `CLAUDE.md`, run and deploy knobs to `docs/environment.md`, deferred
work to `docs/task.md`. The original is recoverable with
`git show 7d6248a:HANDOFF.md`.

## Verified by running it, 2026-07-25

Full gate, executed at `7d6248a` against an isolated test database:

| Step | Command | Result |
|---|---|---|
| Format | `pnpm run format:check` | pass |
| Lint | `pnpm run lint` | pass |
| Typecheck | `pnpm run typecheck` | pass, 6 workspace projects |
| Tests | `pnpm run test` | **663 passed**, 65 files, 0 failures |
| Build | `pnpm run build` | pass, web + server |

Test totals by package:

| Package | Files | Tests |
|---|---|---|
| `packages/shared` | 1 | 38 |
| `packages/engine` | 12 | 115 |
| `packages/bot` | 3 | 36 |
| `apps/web` | 21 | 157 |
| `apps/server` | 28 | 317 |
| **Total** | **65** | **663** |

Also confirmed: PostgreSQL 16 running as container `tile-meld-db-1`, healthy;
six workspace projects resolving; production build emits
`dist/index.js`, `dist/migrate-cli.js`, `dist/migrations/*.js`, and a 423 kB web
bundle (129 kB gzipped).

## Shipped and merged (from Git history)

- **Computer Opponent V1** — a deterministic server-side single-player
  opponent. Full write-up in `docs/computer-opponent.md`. Recorded as enabled in
  production on Render.
- **Phases 01–08 of `docs/next-changes-implementation-plan.md`** — global
  username, friendly room names, join-by-name, auto-start on capacity, one-click
  rematch, home dashboard redesign, completed-game retention, tabletop layout.
  Merged at `712d031`.
- **CI / E2E / release stabilization** — PR #3, merged at `b3efeeb`, preceded by
  `e86e36c`, `99e351e`, `82e394f`.

## Not verified

- **The Playwright E2E suite was not run.** It takes roughly 30 minutes across
  five browser projects and starts its own servers. The unit and integration
  gate above does not cover it.
- **No deployment was performed or checked.** Whether the Render service is
  currently healthy, and what commit it is serving, is unknown from this
  machine.
- **The application was not exercised by hand.** A green gate is not a
  play-through.
- Production behavior of `ENABLE_COMPUTER_OPPONENT` and `BOT_TURN_DELAY_MS` was
  not observed; only their code paths are covered by tests.

## Known discrepancy

`docs/changes.md` (2026-07-20, the source brief for Phases 01–08) specifies:

> Completed/ended/resigned games last 4 hours and then are permanently deleted

The implemented behavior is **48 hours** — commit `ac9c2a3`, "feat(server): add
48-hour completed-game retention". Presumably a deliberate revision during
Phase 07, but the rationale has not been confirmed against
`docs/phase-07-retention.md`. Either the brief or the implementation should be
corrected so they stop disagreeing.

## Work in progress

None. Clean tree, no open checkpoint. This is a clean base to start the next
task from.
