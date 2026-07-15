# Deploying to a VPS (Option B -- documented fallback)

Decision D-HOST (`docs/opus-implementation-plan.md` §12.3) picked Render (`docs/deploy-
render.md`) as the primary path. This is the cost-optimized fallback: a single VPS running
Docker Compose, with Caddy handling automatic TLS. Same Docker image as Option A -- the
app doesn't change, only how it's hosted.

You own more here than on Render: OS patching, backups, monitoring, and the restart
policy that keeps things running across a reboot. `restart: unless-stopped` (already set
on every service in `docker-compose.prod.yml`) covers the last one; the rest are on you,
covered below.

## 1. Prerequisites

- A VPS with Docker Engine + the Compose plugin installed (e.g. Hetzner CX22, DigitalOcean
  Basic Droplet -- any small instance with at least 1GB RAM is enough to start). Docker's
  own install docs (`docs.docker.com/engine/install/`) cover this per-distro; nothing
  project-specific here.
- A domain (or subdomain) with an A record pointed at the VPS's public IP. Caddy's
  automatic TLS (below) can't obtain a certificate until this resolves correctly.
- SSH access to the VPS.

## 2. Firewall

Only these ports need to be reachable from the internet:

- `22` (SSH)
- `80`, `443` (Caddy -- HTTP is needed too, for the Let's Encrypt HTTP-01 challenge and to
  redirect to HTTPS)

`docker-compose.prod.yml` deliberately does **not** publish Postgres's `5432` or the web
container's `3000` to the host at all -- they're reachable only from other containers on
the compose network, never from outside the VPS, regardless of firewall rules. If you're
using `ufw` or similar, default-deny inbound and only allow 22/80/443.

## 3. Get the code and configure secrets

```bash
git clone <your fork/remote of this repo> tile-meld
cd tile-meld
cp .env.example .env
```

Edit `.env` and fill in:

- `POSTGRES_PASSWORD` -- a real password, not the `.env.example` placeholder.
- `SESSION_TOKEN_HMAC_SECRET` -- generate with `openssl rand -hex 32`.
- `DOMAIN` -- the domain from step 1 (not in `.env.example`; Caddy reads this to know what
  certificate to request -- see `Caddyfile`).
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` -- optional, Web Push is a
  progressive enhancement (plan §8.4); leave blank to skip it. Generate a keypair with
  `npx web-push generate-vapid-keys` if you want it.
- `CORS_ORIGIN` -- leave blank. Everything sits behind Caddy on one origin (same as the
  Render deploy), so the default (CORS disabled, same-origin only) is correct.

`docker-compose.prod.yml`'s `POSTGRES_PASSWORD` and `SESSION_TOKEN_HMAC_SECRET` fields use
Compose's `${VAR:?message}` syntax -- if either is missing from `.env`, `docker compose
up` refuses to start with a clear error rather than silently falling back to a guessable
default.

## 4. Bring the stack up

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This builds the image, starts Postgres, waits for it to be healthy, runs the one-shot
`migrate` service (the pre-traffic release step, Decision D-MIGRATE, plan §12.4) and only
starts `web` once that exits successfully, then starts `caddy` once `web` reports healthy.
First run takes a few minutes (image build + Caddy's first certificate request).

Check it came up clean:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs migrate   # should show each migration's name
docker compose -f docker-compose.prod.yml logs caddy | grep -i certificate
```

Then open `https://<your-domain>` and confirm the same things the Render doc does: the
page loads, `/api/health` returns `{"ok":true}`, and a real two-browser game works end to
end.

## 5. Redeploying

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

`migrate` re-runs every time (it's a one-shot service, not long-running) -- for a deploy
with no new migrations, it just exits immediately with no output, same as running
`pnpm run migrate` locally against an already-migrated database.

## 6. Ops responsibilities (the part Option A does for you)

- **OS patching:** enable your distro's unattended/automatic security updates (e.g.
  `unattended-upgrades` on Debian/Ubuntu). Nothing project-specific -- this is baseline VPS
  hygiene regardless of what's running on it.
- **Backups:** see `docs/backup-restore.md` -- Option B's backup step is a script you run
  (or cron), not a dashboard toggle.
- **Monitoring:** `docker compose -f docker-compose.prod.yml logs -f web` for live
  structured JSON logs (same secret-redacted pino output as Render -- see
  `apps/server/src/app.ts`). No dedicated metrics/alerting stack is part of this MVP (plan
  §12.4 scopes that as "basic metrics," not a requirement); the `web` service's Docker
  `HEALTHCHECK` (visible in `docker compose ps`) is the cheapest signal that something's
  actually wrong.
- **Restart across a reboot:** every service already has `restart: unless-stopped`, so a
  VPS reboot (planned or not) brings the whole stack back on its own, including Docker
  itself if it's enabled as a system service (the default on most distro installs).
