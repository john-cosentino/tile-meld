# Tile Meld — Working Status & Handoff Guide

> A resume-where-we-left-off guide for Claude Code (or any engineer). Pair this
> with `CLAUDE.md` (non-negotiable working rules) and
> `docs/opus-implementation-plan.md` (authoritative architecture/plan).
> Last updated: 2026-07-18.

## 1. Current state (TL;DR)

- **Branch:** `main`, clean tree. Feature branches for past work are merged.
- **Shipped & deployed:** the **Computer Opponent V1** ("Play vs Computer")
  feature is complete (Phases A–F) and **enabled in production** on Render, and
  the follow-up **CI/Docker stabilization** is merged.
- **Recent history (newest first):**
  - `3ea972c` Merge PR #2 `fix/ci-e2e-and-trivy` — CI/E2E/Docker repair.
  - `19b87f9` fix(ci): strip runtime npm and stabilize E2E interactions.
  - `b03ebbb` fix(ci): stabilize Playwright E2E and update Trivy action.
  - `a52d7d0` Merge PR #1 `feature/computer-opponent-v1` — the whole feature.
- **CI:** green (format/lint/typecheck/unit+integration/build; full Playwright
  matrix; Trivy image scan). No known failing checks.
- **Toolchain:** Node 24 (`v24.18.0`), pnpm 11 (pinned via `.nvmrc`/
  `.node-version`/`package.json`). Do **not** reintroduce Node 20.

There is **no in-progress work** and no open checkpoint. This is a clean base to
start the next task from.

## 2. What the Computer Opponent V1 is (so you don't re-derive it)

A simple, deterministic, server-side single-player opponent: **1 human + 1
computer**, private 2-seat room. Correct and competent, not expert (no strategy/
lookahead/opponent modelling). Full write-up: **`docs/computer-opponent.md`**.

Key design facts to respect:
- **Purity:** `packages/engine` and `packages/bot` are pure — no DB, network,
  env, logging, timers, `Date.now()`, or `Math.random()`. The bot's input type
  cannot even represent the human's rack.
- **Server-authoritative:** the bot proposes; the engine validates. Bot turns go
  through the SAME `commitTurn`/`drawTurn`/`passTurn` path a human uses
  (`apps/server/src/game/botTurn.ts`: read snapshot → generate OUTSIDE any txn →
  short locking write). Duplicate/stale/concurrent/completed/wrong-seat
  executions are safe no-ops.
- **Identity:** one global, credential-less computer player (`players.kind =
  'computer'`, `recovery_hash IS NULL`, enforced by a CHECK). `controller_type`
  on room_members/game_seats is DB-derived from `players.kind` via a composite
  FK. Never invent a fake password/token/session for the bot.
- **Durability:** a ~1s fast-path timer is latency-only; the durable recovery
  sweep (`game/deadlineSweep.ts` `runBotTurnSweepOnce`) is the correctness
  backstop. No Redis/queue/worker was added.
- **Privacy:** the only opponent-visible seat field added is `isComputer`;
  opponents still get a rack COUNT only, never contents (single redaction
  chokepoint `apps/server/src/db/redact.ts`).

## 3. Repo map (where things live)

```
packages/engine   Pure rules engine (validateTurn, applyCommit/Draw/Pass, sets, scoring)
packages/bot      Pure deterministic move generator (@tile-meld/bot)
packages/shared   Zod DTOs shared client+server
apps/server       Fastify + Socket.IO + PostgreSQL (Kysely). Turn lifecycle in
                  game/turnActions.ts; bot orchestration in game/botTurn.ts;
                  embedded sweep in game/deadlineSweep.ts; single redaction in
                  db/redact.ts; migrations in db/migrations (0018 = bot model)
apps/web          React 19 SPA (react-router, dnd-kit, StrictMode ON)
e2e               Playwright (5 projects: chromium/firefox/webkit + Pixel 7 + iPhone 14)
docs              opus-implementation-plan.md (authoritative), computer-opponent.md,
                  deploy-render.md, deploy-vps.md, backup-restore.md
```

## 4. How to run things

Local PostgreSQL is expected at `postgres://tilemeld:tilemeld@localhost:5432/tilemeld`
(a Docker container named `tile-meld-db-1` is the usual local instance;
`docker compose up -d db` also works). Migrations: `pnpm --filter @tile-meld/server run migrate`.

Standard gate (what CI's first job runs):
```
pnpm run format:check
pnpm run lint
pnpm run typecheck                 # all 6 workspace projects
DATABASE_URL=postgres://tilemeld:tilemeld@localhost:5432/tilemeld pnpm run test
pnpm run build
```
Expected unit/integration totals: shared 15, engine 115, bot 36, web 45,
server 155 = **366 passing**.

E2E (starts its own API + Vite servers via `webServer`; needs migrated Postgres):
```
cd e2e && npx playwright test                          # full matrix (~30 min)
cd e2e && npx playwright test <spec> --project=chromium # one spec/project
```
The E2E API server env sets `BOT_TURN_DELAY_MS=1200` (see
`e2e/playwright.config.ts`) so the bot turn is observable. `retries: CI ? 2 : 0`.

Docker image + scan (what CI's Trivy job does):
```
docker build -t tile-meld:local .
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.67.0 \
  image --severity HIGH,CRITICAL --ignore-unfixed --scanners vuln tile-meld:local
```

## 5. Configuration / deployment knobs

- `ENABLE_COMPUTER_OPPONENT` — **enabled by default**; set `"false"` as an
  operational kill switch (blocks only NEW bot-room creation; in-flight games
  keep running/recovering). Not a schema change.
- `BOT_TURN_DELAY_MS` — UX-only delay before the bot acts (default ~1000ms).
- Both are documented in `.env.example`, `render.yaml`, and
  `docs/deploy-render.md`. Deploy target: single Render web service + one
  Postgres; migrations run pre-traffic (`preDeployCommand`).
- **Rollback of the feature = the flag**, never a down-migration. Migration
  `0018` is additive and its `down()` is unsafe once computer games exist; any
  future schema change must be a forward corrective migration.

## 6. Hard-won gotchas (read before touching these areas)

- **React StrictMode is ON** (`apps/web/src/main.tsx`) and the E2E runs the Vite
  DEV build, so StrictMode double-invokes effects/updaters. `setState` updaters
  MUST be pure — no ref mutation or nested `setState` inside them. (This caused a
  real Undo bug in `useDraftState`, now fixed with a single pure reducer.)
- **E2E rate limits are real and per-IP.** The whole matrix runs serially
  (`workers: 1`) against one shared bucket; the recovery endpoint (5/min) is the
  tightest. Do NOT loosen production rate limits to make tests pass. Instead use
  the patient, authoritative-state helpers in `e2e/tests/helpers.ts`
  (`retryOnRateLimit`, `waitForReady`, `clickUntilSettled`, and the
  `startTwoPlayerGame`/`startNPlayerGame` guest-navigation fallback).
- **dnd-kit drops are precision-sensitive.** `dragTo` settles the pointer at the
  target and repositions after release; for drag-onto-existing-set, target a
  tile INSIDE the set, not the container centre (collision can otherwise resolve
  to the adjacent "new set" zone). Assert full observable state (rack AND set
  counts) after each drag/undo.
- **Runtime Docker image has no npm/npx.** They are removed in the runtime stage
  (`node dist/index.js` / `dist/migrate-cli.js` / healthcheck use `node` only)
  because the Node base image's bundled npm vendors a flagged `undici`. Don't
  reintroduce npm at runtime; the build stages still use pnpm via corepack.
- **Never run Git write/history commands** yourself (CLAUDE.md). Print exact
  single-line commands for the human to run, rooted at `~/git/tile-meld`.

## 7. Deferred / future work (clean seams, not started)

- A stronger/strategic computer opponent (search, opponent modelling, difficulty
  levels) — the current bot is deliberately basic; it's "just another caller of
  the pure engine," so a smarter one is additive.
- Multiple/mixed bots, bots in 3–4 player games, computer-vs-computer — v1
  intentionally excludes these; the domain leaves seams but nothing is built.
- Accounts/Google sign-in, email notifications, moderation, lifetime stats/
  leaderboards, horizontal scale / dedicated worker — see
  `docs/opus-implementation-plan.md` §14.2 deferred roadmap.

## 8. Starting the next task — checklist

1. `git status` (expect clean on `main`) and `git --no-pager log --oneline -5`.
2. Confirm local Postgres is up and migrated.
3. Run the standard gate once to confirm a green baseline before changing code.
4. Branch for new work (human runs the command); implement one reviewable
   change at a time; keep the engine/bot pure and the server authoritative.
5. For anything touching draft/undo, drag-and-drop, or E2E setup, re-read §6.
6. Run the full gate + relevant E2E specs before proposing a commit; stop at a
   manual Git checkpoint and print the exact commit/push commands.
