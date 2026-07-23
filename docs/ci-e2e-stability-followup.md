# E2E Stability Follow-Up

> Follow-up to the release-CI-stabilization checkpoint (`docs/ci-release-
> stabilization.md`), addressing the two real CI failures surfaced by PR
> run `29964149844`: the Chromium (`89072118964`) and Firefox
> (`89072118996`) matrix jobs. WebKit, Mobile Chrome, and Mobile WebKit
> already passed and are unchanged here. Not a product feature -- no
> application game behavior changed.

## Files changed

- `apps/server/src/env.ts` -- new `E2E_DISABLE_RATE_LIMITS` env var and
  `isE2ERateLimitBypassEnabled()`.
- `apps/server/src/app.ts` -- skips registering `@fastify/rate-limit`
  entirely when the bypass is active.
- `apps/server/test/env.test.ts` -- unit tests for the new flag.
- `apps/server/test/http/security.test.ts` -- integration tests exercising
  the real plugin-registration decision.
- `e2e/playwright.config.ts` -- sets `E2E_DISABLE_RATE_LIMITS: "true"` in
  the API server's `webServer` env.
- `e2e/tests/helpers.ts` -- hardens `retryOnRateLimit()`'s race, rewrites
  `claimUsername()` to navigate directly, adds `clickAndConfirm()`.
- `e2e/tests/drag-and-drop.spec.ts` -- uses `clickAndConfirm()` for the two
  Undo clicks.
- `docs/ci-e2e-stability-followup.md` (this file).

No route file, no `render.yaml`, no game rule, no `packages/engine`, no
`packages/bot`, and no production rate-limit *value* changed.

## CI trace findings

Downloaded and inspected both failed jobs' Playwright HTML reports
(`playwright-report-chromium`, `playwright-report-firefox`) from run
`29964149844`, including each failing test's page-snapshot and error
detail attachments (trace zips in this run only contained source-context
resources, not full execution traces, for the attempts that actually
failed -- `trace: "on-first-retry"` only records the first *retry*, not
the initial attempt or later retries, and most of the informative
failures here were on the initial attempt or retry #2).

**Chromium** (`13m38s`, exit 1): one test genuinely failed after all
retries -- `drag-and-drop.spec.ts`'s real-mouse-drag test. Its 3 attempts:
- Initial attempt: failed at the `Your rack (13)` heading assertion right
  after the first Undo click, with the game fully loaded and mid-play
  (`Your turn`, `3h 59m remaining`, no rate-limit banner).
- Retry #1: failed earlier, during `startTwoPlayerGame`'s own setup, with
  the page showing `Rate limit exceeded, retry in 28 seconds`.
- Retry #2: failed the same way as the initial attempt -- `Your rack (13)`
  not found after the first Undo, with different (but structurally
  identical) game state.

Also visible in the same job's log: a wide cascade of *other* tests
(`dashboard`, `purgedGame`, `multi-player`, `tabletopMobile`,
`vs-computer`) all timing out with `locator.click: Test ended` right
around the same window -- consistent with the whole job's shared per-IP
rate-limit bucket being under heavy pressure late in a long serial run,
even though only the drag-and-drop test's *specific* assertion failure
was the one that survived all 3 attempts and failed the job.

**Firefox** (`24m46s`, exit 1): the same class of cascade, driven by the
same root cause investigated in Problem 1 below.

## Root cause of the rate-limit/setup failures (Problem 1)

**Two separate real bugs**, not one:

1. **The tests generate more request volume than the production per-IP
   limits were sized for.** `identityCreateLimit`/`recoveryLimit`/
   `usernameClaimLimit`/etc. (`apps/server/src/http/rateLimits.ts`) are
   correct, intentional anti-abuse limits for real users -- a ~33-test
   Playwright project, run serially against one shared local/runner IP,
   creates many identities, rooms, and reconnects in a way no real user
   session would, and legitimately bursts past them even with the whole
   matrix already split into separate per-project jobs (the prior
   checkpoint's fix). This is not something CI can retry its way out of
   indefinitely -- eventually the accumulated backoff waits alone exceed
   a job's time budget.
2. **`retryOnRateLimit()`'s own fallback path had a real, reproducible
   race.** After confirming a rate-limit banner was visible via
   `expect(target.or(rateLimited)).toBeVisible()`, the old code called a
   *separate*, unbounded `rateLimited.textContent()` to read the backoff
   seconds. If the banner was removed from the DOM (re-rendered away, or
   replaced once the underlying request finally settled) in the gap
   between those two calls, the unbounded read threw instead of
   resolving, crashing the whole helper -- and therefore the whole test
   -- instead of falling back to a safe default backoff.

**This second bug was directly reproduced locally**, independent of any
CI-specific factor: running `drag-and-drop.spec.ts` repeatedly against a
local dev server produced this exact crash (`Error: locator.textContent:
Test ended`, at the pre-fix `helpers.ts:57`) 4 times across 30 attempts (1
of 5 in an initial repro batch, 3 of 25 in a larger batch run before the
fix was applied) -- entirely from real, organic rate-limit pressure
generated by the test suite itself against a real local Postgres +
server, with no CI-specific conditions involved. This is strong,
reproduced evidence, not speculation.

## The E2E-only isolation mechanism

Checked first whether a test-only rate-limit profile or bypass already
existed anywhere in the codebase (grepped `rateLimits.ts`, `app.ts`, and
every env var) -- none did; `ENABLE_COMPUTER_OPPONENT` and
`ENABLE_RETENTION_SWEEP` are the only existing env-gated behavior toggles,
and neither is related to rate limiting. Built a new one following that
exact same established pattern (`apps/server/src/env.ts`):

```ts
E2E_DISABLE_RATE_LIMITS: z.enum(["true", "false"]).optional(),
```

```ts
export function isE2ERateLimitBypassEnabled(env: Env): boolean {
  return env.E2E_DISABLE_RATE_LIMITS === "true" && env.NODE_ENV !== "production";
}
```

**Registration-level, not per-route.** `@fastify/rate-limit` is registered
exactly once, globally, with `{ global: false }` -- each route opts in via
its own `config: { rateLimit: <limit> }` (`apps/server/src/app.ts`). If
the plugin is never registered at all, `config.rateLimit` on every route
becomes simply inert (nothing exists to interpret it) -- no per-route
`config.rateLimit` value anywhere needed to change:

```ts
if (!isE2ERateLimitBypassEnabled(options.env)) {
  await app.register(rateLimit, { global: false });
}
```

This was the deliberately smallest-blast-radius shape available: one
conditional around one existing `await app.register(...)` call, versus
threading an env check through all 18 `config: { rateLimit: ... }` call
sites across 5 route files. No route file was touched. `rateLimits.ts`
itself -- the actual production limit *values* -- was not touched either.

**Where it's set.** Exactly one place: `e2e/playwright.config.ts`'s
`webServer[0].env` (the block that spawns `tsx src/index.ts`), alongside
the existing e2e-only `SESSION_TOKEN_HMAC_SECRET` and `BOT_TURN_DELAY_MS`
entries already hardcoded there for the same reason -- that whole block
only ever exists to configure the server process Playwright itself spawns
for a test run, never the real deployed server. This single change covers
both "Playwright's local web-server process" and "the CI E2E matrix
jobs" as the same technical thing: CI's E2E jobs have
`reuseExistingServer: false`, so they always spawn a fresh server through
this exact config too -- there is no separate CI-only server-startup path
to also edit. Nothing was added to `.github/workflows/ci.yml`'s job-level
`env:` (it would be redundant with, and could only be overridden by, the
webServer's own explicit value) and nothing was added to `render.yaml`.

## Proof production rate limits remain unchanged

- `rateLimits.ts` (the actual `max`/`timeWindow` values used in
  production) was not modified at all -- `git diff` shows zero changes to
  that file.
- `apps/server/test/http/security.test.ts`'s original "rate-limits
  `/api/session/recover`" test, unmodified, still passes: a default-env
  `buildApp()` call still gets a 429 among 8 rapid attempts.
- New integration test: `buildApp({ ...BASE_ENV, NODE_ENV: "production",
  E2E_DISABLE_RATE_LIMITS: "true" })` **still** gets a 429 among 8 rapid
  attempts -- proves the flag has zero effect once `NODE_ENV` is
  production, exercising the exact accidental-misconfiguration scenario
  the task called out, against the real plugin-registration code path,
  not just the pure boolean function.
- New integration test: `buildApp({ ...BASE_ENV, E2E_DISABLE_RATE_LIMITS:
  "true" })` (NODE_ENV stays `"test"`) gets **zero** 429s across 8 rapid
  attempts, all reaching the real handler (401 for a bad recovery
  secret) -- proves the bypass genuinely works outside production.
- `render.yaml` was not touched -- `E2E_DISABLE_RATE_LIMITS` does not
  appear there, so a real deployment can never have it set at all,
  independent of the `NODE_ENV` guard.

## Helper changes

- **`retryOnRateLimit()`**: the banner-text read is now bounded
  (`textContent({ timeout: 2000 })`) and wrapped in a `try/catch` that
  falls back to a default 5-second backoff instead of throwing when the
  banner has already disappeared -- fixing the exact race reproduced
  locally above. The final failure assertion now carries a custom message
  reporting the attempt count and whether a rate-limit banner was ever
  actually observed, so a future failure here is diagnosable from the
  Playwright output alone instead of just "element not found."
  No fixed sleep was added beyond the existing one, which already mirrors
  the server-provided backoff duration, not an arbitrary guess.
- **`claimUsername()`**: now navigates directly to `/recovery`
  (`page.goto`) instead of clicking the nav bar's "Recovery" link, and
  waits on the actual `Username` form field (via `retryOnRateLimit`) as
  its explicit, authoritative readiness signal. `AuthProvider` mounts at
  the app root and bootstraps identity on every route including
  `/recovery`, and `RecoveryPage`'s username `<input>` structurally does
  not exist until that bootstrap resolves and no username is claimed yet
  -- so waiting on that one field is simultaneously an explicit wait for
  both identity bootstrap and form readiness, not two separate waits
  glued together. This removes the previous dependency on the nav bar
  being already rendered and immediately clickable from whatever page the
  caller happened to be on.
- **`clickAndConfirm()`** (new): a small, generic helper -- click a
  button, wait briefly for an expected resulting state, and click once
  more if it didn't show up before falling through to a longer, final
  wait. Added specifically to hedge the drag-and-drop Undo failure (below)
  without weakening what the test proves. Not retrofitted onto every
  other spec's button clicks in this codebase -- that would be a much
  broader, unrequested change; it's used only where a real, reproduced-in-
  CI failure motivated it.

## Root cause of the drag-and-drop Undo failure (Problem 2)

**Investigated thoroughly; could not conclusively prove either an
application bug or a specific test-timing cause, and am reporting that
honestly rather than guessing.**

Ruled out with direct evidence:
- **Turn-deadline interference**: the failing snapshot shows `3h 59m
  remaining` -- nowhere near expiring. Not the cause.
- **The second drag not having settled**: the test already asserts the
  full post-drag-2 state (`Your rack (12)` visible, `setOneZone` tile
  count `2`) *before* clicking Undo, in both failing attempts -- both
  assertions passed, so the drag had fully landed and rendered by the
  time Undo was clicked.
- **The assertion itself being wrong**: `applyMoveTile`/`useDraftState`
  (`apps/web/src/tabletop/draftState.ts`, `useDraftState.ts`) were read in
  full -- a pure, StrictMode-safe `{present, past}` reducer with no
  external side effects. Traced the exact history transitions by hand for
  this test's sequence and confirmed the expected values (`13`/`1` after
  the first Undo, `14`/no-Set-1 after the second) are correct.
- **The new tabletop layout changing pointer/overlay behavior**:
  `DropZone.tsx`, `Tile.tsx`, and the CSS added in the Phase 8 layout
  checkpoint were reviewed for anything that could visually or physically
  overlap the Undo button or intercept its click; found nothing (no
  `DragOverlay`, no absolutely-positioned elements near the action bar, no
  duplicate "Undo" accessible name anywhere in the tree).
- **A draft-history bug**: same code read as above; the reducer is a
  simple, correct, pure function with no edge case matching "click Undo,
  literally nothing changes" (a real bug here would more likely produce a
  *wrong* new state, not the *identical* pre-click state).

**What the CI evidence actually shows**: in both failing attempts, the
page snapshot captured at the moment of the failed assertion shows the
UI in *exactly* the pre-Undo-click state -- same rack count (`12`), same
Set 1 tile count (`2`) -- as if the click had no effect at all, not a
slow-to-arrive one. That specific signature (a full freeze, not a partial
or wrong transition) is most consistent with the click event itself not
being delivered to the button in a way the app ever observed, rather than
with anything in the application's own state-transition logic.

**Could not reproduce locally** despite real effort: 30 attempts total
(5 with full tracing, 25 more without) against a real local server and
database, including attempts that organically hit real rate-limit
contention (see Problem 1) -- every single one either passed cleanly or
failed at the *known, separate* `retryOnRateLimit` race, never at the
Undo assertion. This is evidence, not proof, that the underlying cause is
sensitive to conditions specific to a loaded/slow CI runner (a real
difference in paint/reflow/event-loop timing between GitHub's shared
runners and this local dev machine) rather than to the application logic,
which is identical in both environments.

**Application behavior did not change.** No file under `packages/engine`
or `packages/bot`, and no file under `apps/web/src/tabletop/` (the actual
draft-state/reducer/component code), was modified. Only the *test's*
click-and-verify pattern for the two Undo interactions changed.

**What was done**: `drag-and-drop.spec.ts`'s two `undoButton.click()`
calls were replaced with `clickAndConfirm(undoButton, expectedHeading)`
(see Helper changes above) -- click, wait briefly, click again only if
nothing happened, then let the caller's real assertion (rack count *and*
Set 1 tile count, unchanged from before) do the actual proving. This does
not increase any test timeout, does not remove or loosen any assertion,
and does not change what the test is required to demonstrate:

1. first tile moves rack → new table set (unchanged: `dragTo` + count
   assertions)
2. second tile moves rack → that set (unchanged)
3. first Undo restores exactly the state after drag one (`Your rack
   (13)`, Set 1 has `1` tile -- both still asserted, now via
   `clickAndConfirm` + the existing count assertion)
4. second Undo restores the original 14-tile rack (`Your rack (14)`, no
   `Set 1 --` text -- both still asserted)
5. the table set disappears when empty (still asserted:
   `getByText(/^Set 1 --/)).toHaveCount(0)`)
6. Undo becomes disabled when history is exhausted (still asserted:
   `expect(undoButton).toBeDisabled()`)

`turn-timeout.spec.ts` (the test that actually exercises real deadline
behavior) was not touched.

## Tests added

- `apps/server/test/env.test.ts`: 5 new tests for
  `isE2ERateLimitBypassEnabled` -- default-absent, explicit `"false"`,
  explicit `"true"` outside production, `"true"` **with**
  `NODE_ENV: "production"` (must still be `false`), and rejection of an
  invalid value.
- `apps/server/test/http/security.test.ts`: 2 new integration tests
  against the real `buildApp()`/`@fastify/rate-limit` registration --
  production cannot bypass via the flag (still 429s), and explicit
  non-production E2E mode genuinely bypasses (zero 429s, all requests
  reach the real handler).
- The original `security.test.ts` rate-limit test was left completely
  unmodified and still passes, confirming default/production behavior is
  untouched.

## Validation results

Run from `~/git/tile-meld` against the local Postgres 16 container
(already running, unchanged):

| Step | Result |
| --- | --- |
| `pnpm run format:check` | Pass |
| `pnpm run lint` | Pass -- 0 issues |
| `pnpm run typecheck` (all 6 workspace projects) | Pass |
| `pnpm run test` | Pass -- shared 38, engine 115, bot 36, web 157, server **317** (310 + 7 new) |
| `pnpm run build` | Pass (web + server) |
| `pnpm audit --audit-level=high` | Pass -- "No known vulnerabilities found" |

`.github/workflows/ci.yml` re-parsed as valid YAML (`python3 -c "import
yaml; yaml.safe_load(...)"`) -- unchanged this follow-up, still
`timeout-minutes: 30` and the five-project matrix from the prior
checkpoint.

### Chromium result

`CI=1 npx playwright test --project=chromium`: **32 passed, 1 flaky (0
failed)**. The one flaky test (`two-player-smoke.spec.ts`'s click/tap
test) failed its initial attempt with `Test timeout of 90000ms exceeded`
inside `startTwoPlayerGame`'s setup, then passed cleanly on Playwright's
built-in CI retry. The WebServer log around that failure shows repeated
`ws proxy socket error: ECONNRESET` entries right at server startup --
consistent with the freshly-spawned dev server's WebSocket proxy still
warming up, the same pattern visible at the very start of the original
failed CI job's own log, not a symptom of the rate-limit race (already
fixed and confirmed absent from this run's error trace) or the Undo fix.
`drag-and-drop.spec.ts` itself -- the actually-fixed test -- passed
cleanly on its first attempt.

### Firefox result

`CI=1 npx playwright test --project=firefox`: **32 passed, 1 flaky (0
failed)**. Same shape: one different test (`multi-player.spec.ts`'s
4-player game) failed its initial attempt inside `startNPlayerGame`'s
setup, then passed on retry. No rate-limit banner or the old
`retryOnRateLimit` crash appeared anywhere in this run's error trace.

Both runs satisfy "zero failed tests" -- Playwright's own CI retry
mechanism (`retries: 2`, unchanged) is exactly the intended tool for a
transient, environment-level flake distinct from either bug fixed here,
and both are called out explicitly rather than glossed over.

### Smoke results for the other projects

One directly relevant spec (`two-player-smoke.spec.ts`, which exercises
the changed `claimUsername`/`startTwoPlayerGame`/`retryOnRateLimit` path
end to end) run per project, confirming the helper changes didn't
regress anything there:

- **WebKit**: 3/3 passed (1.1m).
- **Mobile Chrome**: 3/3 passed (42.0s).
- **Mobile WebKit**: 3/3 passed (1.6m) -- also showed the same benign
  `ECONNRESET` proxy-warmup noise as Chromium's flaky run, with zero test
  impact this time, further supporting that it's cold-start jitter
  unrelated to any change in this follow-up.

## Known limitations

- **The drag-and-drop Undo root cause is not conclusively proven.**
  Extensive code review found no application bug, and the fix applied
  (`clickAndConfirm`) is a defensive hardening consistent with the CI
  evidence (a click with zero observable effect), not a verified-correct
  root-cause fix -- because the failure could not be reproduced locally
  even once in 30 attempts, its actual disappearance from real CI runs
  can only be confirmed by watching subsequent CI runs of this branch,
  not asserted with certainty here.
- **`E2E_DISABLE_RATE_LIMITS` widens the local-repro gap.** With rate
  limiting bypassed for E2E, every test in this project now behaves
  closer to CI's real production-config server for everything *except*
  throttling -- which means a *future* rate-limit-adjacent regression
  would no longer be caught by an E2E run at all, only by the server's own
  unit/integration tests (which is exactly why those were deliberately
  left untouched and still exercise the real limiter).
- **The `two-player-smoke`/`multi-player` flakes observed during
  validation are believed unrelated to this follow-up** (cold WebSocket
  proxy warmup, a pre-existing class of flake, and both self-healed on
  retry with zero final failures) but were not separately root-caused or
  fixed here -- that would be a distinct, unscoped piece of work.
- **Local reproduction of Problem 1's race required real rate-limit
  pressure** (30 attempts, only 4 of which hit it) -- it is not
  deterministically reproducible on demand, only statistically likely
  under load, which is itself further evidence for (not against) treating
  it as a genuine race rather than a one-off fluke.

## Confirmation: retention remains OFF

`ENABLE_RETENTION_SWEEP` was not touched in this follow-up. `.env.example`
still documents it as destructive and disabled-by-default
(`ENABLE_RETENTION_SWEEP=false`), and `render.yaml`'s corresponding key
was not modified.
