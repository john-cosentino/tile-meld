# Environment — Tile Meld

Last verified: 2026-07-25.

## Toolchain

| Item | Value | Pinned in |
|---|---|---|
| Node.js | 24 LTS (`v24.18.0` verified) | `.nvmrc` (`24`), `.node-version` (`24.18.0`), `engines.node` (`>=24 <25`) |
| pnpm | `11.13.0` | `packageManager` in root `package.json` |
| TypeScript | 5.7 | root `devDependencies` |
| PostgreSQL | 16 | `docker-compose.yml` service `db` |

Do not target or reintroduce Node 20 — it is end-of-life. Activate pnpm through
corepack, as `README.md` documents:

```
corepack enable
corepack prepare pnpm@11.13.0 --activate
```

Node is managed by **nvm** on this machine. No other version manager is
involved; do not introduce one.

## Workspace layout

Six projects, defined by `pnpm-workspace.yaml` (`packages/*`, `apps/*`, `e2e`):

```
packages/engine   pure server-authoritative rules engine (no IO)
packages/bot      pure deterministic move generator
packages/shared   Zod schemas, shared types, design tokens
apps/server       Fastify + Socket.IO + PostgreSQL (Kysely)
apps/web          React 19 SPA (Vite, react-router, dnd-kit)
e2e               Playwright, 5 browser projects
```

## Commands

```
pnpm run format        # prettier --write
pnpm run format:check  # prettier --check
pnpm run lint          # eslint
pnpm run typecheck     # tsc --noEmit across all 6 projects
pnpm run test          # vitest across all packages
pnpm run build         # production build (web + server)
```

Development servers, in separate terminals:

```
pnpm --filter @tile-meld/server run dev   # API, port 3000
pnpm --filter @tile-meld/web run dev      # Vite, port 5173
```

Vite proxies `/api` and `/socket.io` to the API server. Open
`http://localhost:5173`.

Migrations:

```
pnpm --filter @tile-meld/server run migrate
```

## Testing — read this before running the suite

> **`apps/server`'s tests TRUNCATE every table in whatever database they connect
> to.** `apps/server/test/setup/test-db.ts` resolves its connection as
> `TEST_DATABASE_URL` → `DATABASE_URL` → a hardcoded local default. If
> `TEST_DATABASE_URL` is unset and `DATABASE_URL` points at your development
> database, **running the tests destroys its contents.**

Always point `TEST_DATABASE_URL` at a database used for nothing else. A
dedicated one was created on this machine on 2026-07-25:

```
docker exec tile-meld-db-1 createdb -U tilemeld tilemeld_test
```

The connection string for it is recorded in `CLAUDE.local.md`, which is not
committed. Set both `TEST_DATABASE_URL` and `DATABASE_URL` to it when running
the suite, so no fallback path can reach the development database.

Verified 2026-07-25 at `7d6248a`: **663 tests passed across 65 files**, plus
format, lint, typecheck, and build all green. Per-package totals are in
`docs/current-state.md`.

`packages/engine`, `packages/shared`, and `apps/web` tests need no database.
`pnpm run typecheck` and `pnpm run lint` need no database.

## E2E

```
cd e2e && npx playwright test                           # full matrix, ~30 min
cd e2e && npx playwright test <spec> --project=chromium  # one spec
```

Five projects: Chromium, Firefox, WebKit, Pixel 7, iPhone 14. Playwright starts
the API and Vite servers itself via `webServer` and reuses whatever is already
running. It needs a migrated PostgreSQL. `retries` is 2 in CI, 0 locally.

The E2E API server sets `BOT_TURN_DELAY_MS=1200` (`e2e/playwright.config.ts`) so
the bot's turn is observable.

## Local services and ports

| Service | Port | Notes |
|---|---|---|
| API server (dev) | 3000 | also the production container's port |
| Vite dev server | 5173 | proxies to 3000 |
| PostgreSQL | 5432 | container `tile-meld-db-1`, image `postgres:16` |

`docker compose up -d db` starts only the database. `docker compose up` builds
and runs the full production image locally on port 3000.

## Environment variables

Names only — values belong in `.env`, which is never committed and never read.
The authoritative list is `.env.example`.

| Name | Purpose |
|---|---|
| `NODE_ENV` | runtime mode |
| `PORT` | API listen port |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | compose database provisioning |
| `DATABASE_URL` | database connection |
| `TEST_DATABASE_URL` | test-only override — see the warning above |
| `SESSION_TOKEN_HMAC_SECRET` | session token signing |
| `CORS_ORIGIN` | allowed origin |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | web push; unset disables push as a progressive enhancement |
| `ENABLE_COMPUTER_OPPONENT` | enabled by default; set `"false"` as an operational kill switch |
| `BOT_TURN_DELAY_MS` | UX-only delay before the bot acts, default ~1000 |
| `ENABLE_RETENTION_SWEEP` | completed-game retention sweep |

## Deployment

Primary path is Render (`docs/deploy-render.md`, `render.yaml`), a single web
service plus one Postgres, with migrations run pre-traffic via
`preDeployCommand`. Fallback is a VPS with `docker-compose.prod.yml` and Caddy
(`docs/deploy-vps.md`). Backup and restore for both are in
`docs/backup-restore.md`.

**Rolling back the computer opponent is the `ENABLE_COMPUTER_OPPONENT` flag,
never a down-migration.** Migration `0018` is additive and its `down()` is
unsafe once computer games exist. Any future schema change must be a forward
corrective migration.

## CI

`.github/workflows/ci.yml` — format, lint, typecheck, unit and integration
tests, build, the full Playwright matrix, and a Trivy image scan.

```
docker build -t tile-meld:local .
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.67.0 \
  image --severity HIGH,CRITICAL --ignore-unfixed --scanners vuln tile-meld:local
```
