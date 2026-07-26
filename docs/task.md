# Current task — Tile Meld

**Status: no active task.**

Clean tree at `7d6248a`, full gate green, no open checkpoint. This is a clean
base to start the next task from.

## Structure to use when work begins

Replace everything below with:

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

2. Run the full Playwright matrix and record the result, so E2E moves from
   unverified to verified.
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
