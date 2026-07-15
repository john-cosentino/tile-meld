# Tile Meld

A browser-based, asynchronous multiplayer tile-melding game (2-4 players).
See `docs/opus-implementation-plan.md` for the full approved architecture,
data model, and phased delivery plan, and `CLAUDE.md` for the working rules
this repo is built under.

**Status:** Phase 8 (full E2E, accessibility, and CI hardening) — a full
game is playable end-to-end in the browser (Phases 0-7), now backed by a
Playwright suite covering the whole lifecycle across Chromium, Firefox,
WebKit, and mobile Chrome/Safari viewports: real mouse drag-and-drop, 3-4
player games, the public lobby and Quick Join, refresh/reconnect and
cross-device recovery, the invalid-commit penalty, a real turn timeout
settled by the server's own embedded deadline sweep, and a full room
lifecycle through resign, rematch, and a fresh game with fresh chat.
Automated accessibility checks (`@axe-core/playwright`) run against every
screen and gate on serious/critical violations, which caught and fixed two
real issues along the way: a WCAG AA color-contrast shortfall on links
inside error/warning banners, and an invalid ARIA parent-child relationship
on rack/table tiles (`role="option"` requires a `listbox` ancestor that
didn't exist; tiles now use `aria-pressed` on a plain button instead, the
same toggle-button pattern the rack's sort controls already used). CI
(`.github/workflows/ci.yml`) now runs three jobs: format/lint/typecheck/
unit-integration-tests/build, the full Playwright matrix (auto-starting
both the API and web dev servers via `webServer` in
`e2e/playwright.config.ts`), and a security job (`pnpm audit` plus a Trivy
scan of the Docker image) -- which caught and fixed a real, then-unpatched
high-severity SQL-injection vulnerability in `kysely` along the way, too.

To run the full stack locally: `pnpm --filter @tile-meld/server run dev` (API,
port 3000) and `pnpm --filter @tile-meld/web run dev` (Vite, port 5173 --
proxies `/api` and `/socket.io` to the API server) in separate terminals,
then open `http://localhost:5173`. The Playwright suite (`e2e/`) doesn't
need either running manually first -- it starts both itself and reuses
whatever's already up if you do.

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
pnpm run build         # production build (apps/web only; other packages have none)

cd e2e && npx playwright test   # full E2E matrix -- Chromium, Firefox, WebKit,
                                 # mobile Chrome, mobile Safari; auto-starts the
                                 # API + web dev servers if neither is running
```
