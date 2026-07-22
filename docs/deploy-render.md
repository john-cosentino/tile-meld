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

## 8. Play vs Computer (the computer opponent)

The single-player computer opponent ships **enabled** in the deployed configuration.
`render.yaml` sets `ENABLE_COMPUTER_OPPONENT=true` and `BOT_TURN_DELAY_MS=1000` on the web
service; see `docs/computer-opponent.md` for the full feature/architecture summary.

- **Operational kill switch.** To disable it, Service dashboard -> **Environment** -> set
  `ENABLE_COMPUTER_OPPONENT` to `false` -> save (auto-redeploys). That blocks only *new*
  "Play vs Computer" room creation (the endpoint returns 404); games already in progress
  keep running and their bot turns still recover. Flip it back to `true` to re-enable. No
  code change or migration is involved either way.
- **Rollback.** Because the feature flag is the disable path, a true rollback of the
  *feature* is the flag, not a schema down-migration: migration `0018` (the
  controller/computer-player model) is additive and its `down()` is deliberately **not**
  safe once any computer game exists (it would drop historical rows / violate FKs). If a
  schema change is ever genuinely required, ship a forward corrective migration
  (`0019_…`), never `migrate:down` in production -- consistent with the forward-only
  migration policy (§5 above / Decision D-MIGRATE).
- **Recovery after a restart/deploy.** A bot turn is driven server-side by a durable timer
  plus the embedded recovery sweep (`apps/server/src/game/deadlineSweep.ts`), not by the
  ~1s browser-facing delay. A Render restart or deploy between the human's move and the
  bot's move cannot strand a game: the sweep picks up the pending computer turn within one
  interval. No new infrastructure (no Redis/queue/worker) is added for this.
- **No new services.** The single web service + one Postgres remain sufficient.
- **Post-deploy verification (do this on both a desktop and a phone browser):** from the
  home screen, tap **Play vs Computer (beta)**, mark ready, and start. Confirm the computer
  opponent is clearly identified (a "BOT" badge / "Computer" name), draw or commit a turn,
  watch the **"Computer is playing…"** state appear and the turn come back to you, and
  confirm the computer's rack is never shown (only a tile count). Reload mid-turn and
  confirm the game resumes rather than sticking on the computer's turn. Real Safari
  (desktop macOS + iOS) remains a manual release-gate check -- Playwright's WebKit engine
  is a best-effort proxy only, not a certification (see `e2e/playwright.config.ts`).

## 9. Backups

Covered separately in `docs/backup-restore.md` -- Render's managed Postgres backs up
automatically, but "automatic" and "tested" aren't the same thing, and that doc includes a
real restore drill.

## 10. Completed-game retention

A background sweep (`apps/server/src/game/retentionSweep.ts`) can permanently delete
completed games -- and any room left with no surviving game -- from the live database once
they are **exactly 48 hours** past `games.completed_at`. The 48-hour window is a fixed code
constant, never configurable through an env var (a product rule, not a per-deployment
tuning knob -- do not add one). The sweep itself is gated by a boolean kill switch:

- **Ships OFF.** `render.yaml` sets `ENABLE_RETENTION_SWEEP=false` explicitly (not merely
  left absent) as part of **this phase's rollout** -- retention is implemented and tested,
  but **not enabled in production yet**. Do not flip it to `true` in Render as part of
  deploying this phase.
- **This is genuinely destructive.** Once a game/room is deleted, it is gone from the live
  database; disabling the flag afterward does not bring it back. Only your Postgres
  provider's own backup window can restore deleted rows, and only for as long as that
  window lasts (see "Permanent means live-database-permanent," below).

### Staging verification, before ever enabling this in a real deployment

1. Deploy to a staging environment with its own database (never test destructive retention
   against a database anyone relies on).
2. Set `ENABLE_RETENTION_SWEEP=true` on that staging service only.
3. Create a room, play (or resign) a game to completion, and directly update that one
   game's `completed_at` in the staging database to more than 48 hours in the past (a plain
   `UPDATE games SET completed_at = now() - interval '49 hours' WHERE id = '<id>'` --
   there is no admin UI or backdoor endpoint for this, by design; see "Scope exclusions,"
   `docs/phase-07-retention.md`).
4. Within one sweep interval (roughly 5-10 minutes -- restrained deliberately, this is not
   the 15-second deadline-sweep cadence), confirm in the logs and the database that:
   - the aged game's row, and every row it owned (seats, racks, turns, table sets, events,
     idempotency keys, chat), are gone;
   - the room is also gone **only if** that was its last game -- create a second game in
     the same room first if you want to verify the "room survives because a newer game
     exists" case instead;
   - a *different*, still-recent completed game (and its room) is untouched;
   - an *active* game is untouched, full stop.
5. Confirm the room's friendly name is immediately reusable (create a new room as the same
   username; it gets the base name back, not a numbered suffix).
6. Only once all of the above holds in staging, consider enabling it in production -- and
   even then, this phase's own instruction is to leave it off; re-confirm with whoever owns
   the decision to turn on irreversible data deletion before doing so for real.

### Enabling / disabling in production (once staging verification has passed)

Service dashboard -> **Environment** -> set `ENABLE_RETENTION_SWEEP` to `true` (or back to
`false`) -> save (auto-redeploys, same as any other env var here). No code change or
migration is involved either way -- the sweep function always exists; the flag only
controls whether `startBackgroundSweeps` (`apps/server/src/game/deadlineSweep.ts`) ever
creates its timer.

### Expected sweep logging

When enabled, a non-empty pass logs one structured line per interval:
`"retention sweep removed expired completed games"`, with `gameIdsDeleted`,
`roomIdsDeleted`, and `candidatesSkipped` counts/ids attached -- never tile contents, rack
contents, chat bodies, or any other player-entered content. An empty pass (nothing expired
yet) logs nothing, to keep steady-state logs quiet. A failed pass logs
`"retention sweep failed"` with the error and is retried automatically on the next interval
-- one failure never crashes the server or permanently stops future attempts (same
`.catch()`-and-continue convention as the deadline/warning/bot-turn sweeps).

### Rollback

Disabling the flag (`ENABLE_RETENTION_SWEEP=false`) immediately stops any *future*
deletion. It does **not** undo deletions that already happened -- "permanent deletion"
here means removed from the live database, not necessarily gone from every backup
instantly. Render's own Postgres point-in-time recovery (PITR) window is documented in
`docs/backup-restore.md` (3 days on the Hobby plan, 7 days on Pro or higher) -- a restore
from within that window would bring deleted rows back, at the cost of reverting everything
else in the database to that point in time too, which is a last-resort recovery action, not
routine rollback. A code-level rollback of the *feature* is reverting the application code
that added it, same as the forward-only migration policy already requires for any schema
change (Decision D-MIGRATE, §5 above).
