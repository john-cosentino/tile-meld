# Tile Meld

A browser-based, asynchronous multiplayer tile-melding game (2-4 players).
See `docs/opus-implementation-plan.md` for the full approved architecture,
data model, and phased delivery plan, and `CLAUDE.md` for the working rules
this repo is built under.

**Status:** Phase 4 (HTTP + identity/recovery + rooms/lobby) — no gameplay UI
yet, but the server (`apps/server`) now actually runs: a Fastify HTTP API
covering identity/recovery, sessions, and the full room lifecycle (create,
join, public lobby, quick-join, ready, leave, start, rematch) sits on top of
the Postgres persistence layer and pure engine from earlier phases. Real-time
gameplay (Socket.IO, turn commits, the deadline sweep) lands in Phase 5.

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
built from the root `Dockerfile`). Both paths share the same
`.env.example` and Postgres schema.

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
```
