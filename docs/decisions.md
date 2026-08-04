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

### 2026-08-01 — Concept-art fidelity rebuild: four user decisions

After six failed attempts (2026-07-26 → 08-01) to make the app match the
concept art, the user approved a rebuild governed by four decisions:

1. **The concept PNGs are both the spec and the asset source.** Chrome is
   cropped/9-sliced directly from `docs/design-reference/meld-masters/`
   and `docs/design-reference/v2/new_layout1.png`; **no AI image
   generation**. This revokes the visual-refresh plan's §4/§17.7 rule
   forbidding cropping the concepts.
2. **The glossy generated "production" assets are retired wholesale**
   (tabletop-production/, home-production/ — deleted; history keeps them).
3. **Portraits are deterministically pixelated** from the approved smooth
   pack (`scripts/pixelate-portraits.py`), reviewed before/after.
4. **Order Home → Tabletop → utility screens, one user checkpoint per
   screen; evidence is concept-vs-app comparison sheets, never
   self-assessment.**

Follow-on decisions made at checkpoints: **VT323** is `--font-arcade`
(picked from a 4-candidate sheet); on home the **menu rail is the
Main-navigation landmark** and the header nav is hidden on home and
tabletop (links stay in the DOM; utility screens keep a slim header).

Mechanics, contracts, and commands: `docs/arcade-visual-kit.md`.
Supersedes the visual approach of `docs/meld-masters-visual-refresh-plan.md`
(D3 "no art assets", §13.2 acceptance without resemblance criteria) and
`docs/meld-masters-visual-baseline-v1.md`.

**Date:** 2026-08-01.

---

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

---

### 2026-08-04 — Phase F: legacy identities retired destructively

**Decided:** with accounts live, the legacy guest + recovery-code system was
removed entirely rather than kept for a migration window. Migration 0024
deletes every passwordless human identity along with their rooms and game
subtrees, drops `players.recovery_hash`/`recovery_rotated_at`, and tightens
the credential CHECK so every human row must carry a password. The
guest-mint/recover/rotate/claim routes, `GET /api/config`,
`POST /api/account/upgrade`, the `ENABLE_ACCOUNTS` flag, and the web legacy
branch were deleted with it.

**Why:** the user's explicit call: "I don't care about recovery codes. I am
the only one who really used the app thus far. Removing old usernames/games is
fine." Carrying a dual-mode identity system indefinitely for zero real legacy
users was pure maintenance cost.

**Consequences:** the purge is unrecoverable by design (forward-only policy,
D-MIGRATE); freed legacy usernames can be re-registered. Tests create players
through `apps/server/test/setup/test-account.ts` (fake password hashes — no
argon2 cost, no register-route rate limit). The Render dashboard's leftover
`ENABLE_ACCOUNTS` var is ignored and can be deleted.

**Date:** 2026-08-04.
