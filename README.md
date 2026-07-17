# Tile Meld

A browser-based, asynchronous multiplayer tile-melding game (2-4 players),
with a single-player **Play vs Computer** mode (a simple, deterministic
computer opponent — see `docs/computer-opponent.md`).
See `docs/opus-implementation-plan.md` for the full approved architecture,
data model, and phased delivery plan, and `CLAUDE.md` for the working rules
this repo is built under.

**Status:** Phase 9 (deployment & ops) — the app is feature-complete
(Phases 0-8) and ready to actually run somewhere real. `apps/server` now
has a production build (`esbuild`, bundling the workspace's own packages
in while keeping real npm dependencies external) served by a
multi-stage `Dockerfile` that assembles a lean, production-only image via
`pnpm deploy`; the same server process now also serves the built web SPA
from its own origin (`apps/server/src/app.ts`), so a deploy is one
container, not two. Graceful shutdown (`SIGTERM` drains sockets, stops the
deadline sweep, closes the DB pool before exiting) and structured,
secret-redacted JSON logs are both wired up. Two deploy paths are
documented and both have been exercised for real, including a full
two-browser game played end to end through the actual production
container: `docs/deploy-render.md` (Option A, primary -- a `render.yaml`
Blueprint) and `docs/deploy-vps.md` (Option B, fallback -- `docker-
compose.prod.yml` + Caddy for automatic TLS). `docs/backup-restore.md`
covers both Render's managed point-in-time recovery and a scripted,
GPG-encrypted `pg_dump` path (`scripts/backup-postgres.sh` /
`restore-postgres.sh`) for the VPS option -- the restore drill in that doc
was actually run, not just described, dump-to-fresh-database-with-a-
verified-marker-row and all.

To run the full stack locally: `pnpm --filter @tile-meld/server run dev` (API,
port 3000) and `pnpm --filter @tile-meld/web run dev` (Vite, port 5173 --
proxies `/api` and `/socket.io` to the API server) in separate terminals,
then open `http://localhost:5173`. The Playwright suite (`e2e/`) doesn't
need either running manually first -- it starts both itself and reuses
whatever's already up if you do. To try the actual production build
locally: `docker compose up` (see "Quick start (with Docker)" below).

## Prerequisites

- Node.js 24 LTS (pinned in `.nvmrc` / `.node-version`)
- pnpm 11 (via `corepack enable && corepack prepare pnpm@11.13.0 --activate`)
- Docker Engine + Compose v2 (optional for the fast inner loop; used for
  local Postgres and container parity)

## Quick start (without Docker)

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d db          # or a local, non-Docker PostgreSQL 16
pnpm --filter @tile-meld/server run migrate
pnpm run typecheck
pnpm run lint
pnpm run test
```

`apps/server`'s tests are DB integration tests -- they need a running
PostgreSQL 16 reachable via `DATABASE_URL` (see `.env.example`) and migrated
to latest. `pnpm run typecheck` and `pnpm run lint` do not need a database;
`packages/engine`/`packages/shared`/`apps/web` tests don't either.

To run the server itself: `pnpm --filter @tile-meld/server run dev` (needs
`DATABASE_URL` and `SESSION_TOKEN_HMAC_SECRET` set in `.env`, and Postgres
migrated). `GET /api/health` confirms it's up and can reach the database.

## Quick start (with Docker)

```bash
docker compose up
```

Brings up a PostgreSQL 16 container (`db`) and the server container (`web`,
built from the root `Dockerfile`), open `http://localhost:3000` -- this is
the actual production build (compiled server + built web app, both served
from the one container), not a dev-mode process, so it's the closest local
preview of a real deploy. Both paths share the same `.env.example` and
Postgres schema. `docker-compose.prod.yml` is a separate file for actually
deploying (see `docs/deploy-vps.md`), not for local use.

## Workspace layout

```
packages/engine   pure, server-authoritative game-rules engine (no IO)
packages/shared   Zod schemas, shared types, branding/design tokens
apps/server       Fastify + Socket.IO backend
apps/web          React + Vite frontend
e2e               Playwright multi-browser-context tests
docs/             planning and architecture documents
```

## Common commands

```bash
pnpm run format        # prettier --write
pnpm run format:check  # prettier --check
pnpm run lint          # eslint
pnpm run typecheck     # tsc --noEmit across all workspace packages
pnpm run test          # vitest across all workspace packages
pnpm run build         # production build (apps/web + apps/server; packages/* have none --
                        # consumed as workspace-linked TS source, no compile step needed)

cd e2e && npx playwright test   # full E2E matrix -- Chromium, Firefox, WebKit,
                                 # mobile Chrome, mobile Safari; auto-starts the
                                 # API + web dev servers if neither is running
```

## Deployment

See `docs/deploy-render.md` (primary) or `docs/deploy-vps.md` (fallback), and
`docs/backup-restore.md` for both options' backup/restore procedures.
