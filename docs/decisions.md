# Decisions — Tile Meld

This project already records decisions elsewhere. **This file is an index, plus
a home for decisions made outside those documents** — it does not duplicate
them.

## Where the existing decision records live

| Record | Location |
|---|---|
| Confirmed architecture and design decisions | `docs/opus-implementation-plan.md`, Appendix A |
| Phased delivery order | `docs/opus-implementation-plan.md` §13 |
| Deferred roadmap | `docs/opus-implementation-plan.md` §14.2 |
| Computer Opponent V1 design | `docs/computer-opponent.md` |
| Tabletop layout contract | `docs/tabletop-layout-contract.md` |
| Phases 01–08 rationale | `docs/phase-01-*.md` … `docs/phase-08-*.md` |
| Deployment choices | `docs/deploy-render.md`, `docs/deploy-vps.md` |
| Backup and restore approach | `docs/backup-restore.md` |

`docs/opus-implementation-plan.md` is the authoritative plan. Do not deviate
from a confirmed Decision in Appendix A without asking first.

The load-bearing ones, in short — the plan is authoritative, not this summary:

- **Engine and bot purity.** No React, DB, network, env, logging, timers,
  `Date.now()`, or `Math.random()`. Time and randomness are injected. The bot's
  input type cannot even represent the human's rack.
- **Server-authoritative.** The bot proposes; the engine validates. Bot turns go
  through the same `commitTurn` / `drawTurn` / `passTurn` path a human uses.
- **One redaction chokepoint.** `apps/server/src/db/redact.ts`. A redacted view
  must never contain another seat's rack contents, recovery hashes, or session
  tokens. Opponents get a rack count only.
- **Rollback is the flag, never a down-migration.** Migration `0018` is additive
  and its `down()` is unsafe once computer games exist.

---

## Decisions recorded here

### 2026-07-25 — D-GITGUARD superseded: Claude has full Git control

**Decided:** Claude may run Git write and history commands directly in this
repository, including staging, committing, branching, merging, rebasing,
pushing, and force-pushing.

**Why:** a machine-wide policy change for personal projects on this laptop. The
previous rule required printing commands for manual execution, which was
friction without a matching benefit on a single-maintainer personal project.

**Supersedes:** Decision **D-GITGUARD** in `docs/opus-implementation-plan.md`
§1.6, which has **not** yet been rewritten. That document still describes the
old rule. Whoever next edits §1.6 should bring it into line.

**Consequences:** phase checkpoints still stop for manual testing and review —
what changed is who runs the Git commands, not whether work pauses for
approval. `CLAUDE.md` is guidance, not enforcement; the enforcing layer is
Claude Code's permission settings.

**Date:** 2026-07-25.

---

### 2026-07-25 — HANDOFF.md retired, replaced by docs/current-state.md

**Decided:** `HANDOFF.md` was deleted. `docs/current-state.md` is now the
record of project state.

**Why:** it was written as a resume-where-we-left-off guide for a different
assistant, and had drifted materially — it reported 366 tests when the suite has
663, and named PR #2 as the newest merge after PR #3 had landed. State
documents that live outside a defined structure go stale without anyone
noticing.

**Consequences:** its durable content survives — the hard-won gotchas moved to
`CLAUDE.md`, run and deployment knobs to `docs/environment.md`, deferred work to
`docs/task.md`. The original file is recoverable with
`git show 7d6248a:HANDOFF.md`.

**Date:** 2026-07-25.

---

### 2026-07-25 — Tests run against a dedicated database

**Decided:** the test suite is run with `TEST_DATABASE_URL` pointed at a
database used for nothing else. A `tilemeld_test` database was created on this
machine for the purpose.

**Why:** `apps/server/test/setup/test-db.ts` falls back to `DATABASE_URL` and
truncates 13 tables between tests. With the documented gate as previously
written, running the suite silently destroyed the contents of the development
database.

**Consequences:** `docs/environment.md` leads its testing section with this
warning. The local connection string lives in the uncommitted
`CLAUDE.local.md`.

**Date:** 2026-07-25.
