# Tile Meld — working rules for Claude

This file is **guidance for the model, not a hard control**. It cannot stop a
misbehaving tool call by itself — the enforceable guard is the Git-permission
allowlist plus (recommended) a PreToolUse hook in `.claude/settings.local.json`
(see `docs/opus-implementation-plan.md` §1.6, Decision D-GITGUARD). Treat this
file as a reminder of the agreed workflow, not as the mechanism that enforces it.

## Authoritative plan

`docs/opus-implementation-plan.md` is the approved implementation plan.
Treat it as the source of truth for architecture, data model, rules, and the
phased delivery order. Do not deviate from a confirmed Decision (Appendix A)
without asking first.

## Project documents

- `docs/current-state.md` — what exists, and what has actually been verified.
- `docs/task.md` — the current piece of work, if any.
- `docs/environment.md` — versions, commands, ports, environment variable
  names, deployment, and CI.
- `docs/decisions.md` — index of the decision records above, plus decisions
  made outside them.

## Non-negotiable rules

- **Git is fully permitted** (changed 2026-07-25) — staging, committing,
  branching, merging, rebasing, pushing, and force-pushing may be run without
  asking. This supersedes Decision D-GITGUARD in
  `docs/opus-implementation-plan.md` §1.6, which has not yet been updated to
  match. Show the diff before committing, and never commit secrets.
- **Ask before any system-level install** (apt packages, Docker, database
  engines, global system config). Project-level dependencies inside this repo
  (via `pnpm install`) do not require asking.
- **Implement one phase at a time** (see plan §13). Do not start the next
  phase until the user has confirmed the checkpoint for the current one.
- **Stop at every phase checkpoint** for manual testing and review. Commit the
  completed phase and summarize what changed, then wait for the user to confirm
  before starting the next phase.
- **Keep `packages/engine` pure** — no React, DB, network, `Date.now()`, or
  `Math.random()`. Time and randomness are always injected. The server is
  authoritative; the client's copy of the engine is hints only, never a
  source of truth.
- **Never leak hidden state** — a redacted view sent to any client must never
  contain another seat's rack contents, recovery credential hashes, or
  session tokens.
- **Never run the test suite without `TEST_DATABASE_URL` set.** The server
  tests truncate every table in whatever database they connect to, and the
  fallback chain ends at the development database. See `docs/environment.md`.

## Areas that require special care

Hard-won, non-obvious, and easy to break. Read the relevant entry before
touching that area.

- **React StrictMode is ON** (`apps/web/src/main.tsx`) and E2E runs the Vite
  DEV build, so StrictMode double-invokes effects and updaters. `setState`
  updaters MUST be pure — no ref mutation, no nested `setState` inside them.
  This caused a real Undo bug in `useDraftState`, fixed with a single pure
  reducer.
- **E2E rate limits are real and per-IP.** The whole matrix runs serially
  (`workers: 1`) against one shared bucket; the recovery endpoint (5/min) is
  tightest. Do NOT loosen production rate limits to make tests pass. Use the
  patient, authoritative-state helpers in `e2e/tests/helpers.ts` —
  `retryOnRateLimit`, `waitForReady`, `clickUntilSettled`, and the
  `startTwoPlayerGame` / `startNPlayerGame` guest-navigation fallback.
- **dnd-kit drops are precision-sensitive.** `dragTo` settles the pointer at
  the target and repositions after release. For drag-onto-existing-set, target
  a tile INSIDE the set, not the container centre — collision can otherwise
  resolve to the adjacent "new set" zone. Assert full observable state (rack
  AND set counts) after each drag and undo.
- **The runtime Docker image has no npm or npx.** They are removed in the
  runtime stage because the Node base image's bundled npm vendors a flagged
  `undici`; `node dist/index.js`, `dist/migrate-cli.js`, and the healthcheck
  use `node` only. Do not reintroduce npm at runtime. Build stages still use
  pnpm via corepack.

## Toolchain

Node.js 24 LTS + pnpm 11, pinned via `.nvmrc`/`.node-version` and the root
`package.json` `engines`/`packageManager` fields. Do not target or reintroduce
Node 20 (end-of-life).

Full command list, ports, and environment variable names: `docs/environment.md`.
