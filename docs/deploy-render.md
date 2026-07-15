# Deploying to Render (Option A -- primary path)

This is the deploy target Decision D-HOST picked (`docs/opus-implementation-plan.md`
§12.3): a managed PaaS, lowest ops burden, managed backups, and -- important for a game
with a 4-hour turn deadline -- an always-on instance so the embedded deadline sweep
(`apps/server/src/game/deadlineSweep.ts`) never sits idle waiting for an instance to wake
up. `render.yaml` at the repo root is a Blueprint: Render reads it and provisions
everything below in one pass, instead of you clicking through each setting by hand.

Everything here is provider-specific config, not app behavior -- the app itself doesn't
know or care that it's running on Render. If you ever move to a different host, this is
the file that changes, not the app (see `docs/deploy-vps.md` for the fallback option,
which runs the exact same Docker image).

## 1. Prerequisites

- A Render account (render.com), free to create.
- This repo pushed to GitHub (or GitLab), with Render's GitHub App granted access to it.
  Render's dashboard walks you through connecting a repo the first time.

## 2. Deploy the Blueprint

1. In the Render dashboard: **New** -> **Blueprint**.
2. Select this repo. Render finds `render.yaml` automatically and shows you a preview of
   what it's about to create: one web service (`tile-meld`) and one Postgres database
   (`tile-meld-db`).
3. You'll be prompted for the three env vars marked `sync: false` in `render.yaml` --
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. These are optional (Web Push
   is a progressive enhancement -- plan §8.4); leave them blank to skip push notifications
   for now, or generate a keypair first:
   ```
   npx web-push generate-vapid-keys
   ```
   `VAPID_SUBJECT` is a `mailto:` address (e.g. `mailto:you@example.com`), required by the
   Web Push spec as a contact point for push services, not a real mailing address in the
   in-app sense.
4. Confirm the plans Render pre-selects: `starter` for the web service, `basic-256mb` for
   the database (both set in `render.yaml`; bump either up in the dashboard later if
   needed -- more players, more turns, more chat history). Do **not** switch the web
   service to the `free` plan: it sleeps after 15 minutes idle, which both delays the
   deadline sweep and disables `preDeployCommand` (Render restricts pre-deploy commands to
   paid plans).
5. Click through to create. Render builds the Docker image (using this repo's
   `Dockerfile`), provisions the database, runs the pre-deploy migration step
   (`node dist/migrate-cli.js up`), and only then starts routing traffic to the new
   instance. Everything up to "routing traffic" typically takes a few minutes on the
   first deploy.
6. `SESSION_TOKEN_HMAC_SECRET` is generated automatically (`generateValue: true` in
   `render.yaml`) -- you never type it in, and it's never in this repo.

## 3. Confirm it's live

Render assigns a `*.onrender.com` URL immediately (visible on the service's dashboard
page). Open it and confirm:

- The page loads (this is the built `apps/web` SPA, served by the same Fastify process as
  the API -- see `apps/server/src/app.ts`'s static-file serving).
- `https://<your-service>.onrender.com/api/health` returns `{"ok":true}`.
- Create a private room, open the URL in a second browser (or share it with a friend),
  join, ready up, start a game, and play a turn. This is the same core loop the E2E suite
  exercises (`e2e/tests/`), now for real.

## 4. Custom domain + TLS

Render terminates TLS automatically for both the default `*.onrender.com` URL and any
custom domain you add:

1. Service dashboard -> **Settings** -> **Custom Domains** -> add your domain.
2. Point your domain's DNS at the target Render gives you (a CNAME for a subdomain, or an
   A/ALIAS record for an apex domain -- Render shows you exactly which).
3. Render automatically provisions and renews a Let's Encrypt certificate once DNS
   resolves correctly. No Caddy, no certbot, no manual renewal -- that manual TLS setup is
   specifically an Option B (VPS) concern, not needed here.

## 5. Redeploying

Render redeploys automatically on every push to the branch you connected (default
`main`). Each deploy re-runs the pre-deploy migration step before switching traffic, so a
schema change just needs a new forward migration committed normally (Decision D-MIGRATE,
plan §12.4: forward-only in production, no down-migrations relied on).

## 6. Logs and monitoring

The service dashboard's **Logs** tab streams the structured JSON logs `apps/server`
already emits (pino via Fastify, with secret redaction -- see `apps/server/src/app.ts`).
The **Metrics** tab covers CPU/memory/request-rate out of the box; no separate APM setup
is part of this MVP (plan §12.4 lists this as a "basic metrics" bar, not a requirement for
a dedicated observability stack).

## 7. Rotating a secret

`SESSION_TOKEN_HMAC_SECRET` or the VAPID keypair leaked or need rotating: Service
dashboard -> **Environment** -> edit the value -> save (triggers a redeploy
automatically). Rotating `SESSION_TOKEN_HMAC_SECRET` invalidates every existing session
cookie at once (players get bumped back to the identity-recovery flow, not a broken
state -- recovery secrets are hashed independently, see `apps/server/src/db/repositories`)
-- expected fallout for a deliberate rotation, not a bug.

## 8. Backups

Covered separately in `docs/backup-restore.md` -- Render's managed Postgres backs up
automatically, but "automatic" and "tested" aren't the same thing, and that doc includes a
real restore drill.
