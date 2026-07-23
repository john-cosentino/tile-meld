# E2E Join-Flow Navigation Stabilization Follow-Up

> Second follow-up to the release-CI-stabilization branch, addressing the
> recurring failure surfaced by PR CI run `29969862715`: Chromium
> (`89089610970`) and Mobile Chrome (`89089610971`). Firefox, WebKit, and
> Mobile WebKit already passed and are unchanged here. Not a product
> feature -- no application behavior changed.

## Files changed

- `e2e/tests/helpers.ts` -- fixes a real race in `retryOnRateLimit()`,
  strengthens `clickUntilSettled()`'s precondition and diagnostics, adds
  `openJoinRoomByNamePage()` and `joinRoomByName()`, and refactors
  `startTwoPlayerGame`/`startNPlayerGame` to use them.
- `e2e/tests/multi-player.spec.ts` -- its own inline 2-of-3-seats test used
  the same fragile nav-link-click join pattern (not routed through
  `startNPlayerGame`); switched to `joinRoomByName()` for consistency.
- `docs/ci-e2e-join-navigation-followup.md` (this file).

No route file, no `render.yaml`, no game rule, no `packages/engine`, no
`packages/bot`, no product room-join or username behavior, and no
dashboard/tabletop layout changed. `dashboard.spec.ts`'s own join flow
(which uses the dashboard's own "Join Room by Name" *button*, deliberately
testing that in-app navigation UX rather than a generic "get to the join
page" utility) was intentionally left untouched -- it isn't a shared
helper, and rewriting it to bypass the button click would have defeated
what that test is actually checking. It still benefits from the
`clickUntilSettled`/`retryOnRateLimit` fix below, transparently.

## Exact CI page-state findings

Downloaded and inspected both failed jobs' Playwright reports, including
the actual execution traces (not just the misleading top-level page
snapshots -- see below) for `tabletopMobile.spec.ts`, one additional
`startTwoPlayerGame` case, and one `startNPlayerGame` case, as required.

**The raw per-test page snapshots in the HTML report are misleading and
were not trusted at face value.** Each failing test's captured "page
snapshot" showed a fully-loaded, actively-playing game (a rack already
dealt, "Waiting on seat N" or "Your turn", sometimes several turns already
in) -- which looks like it directly contradicts the reported error
("waiting for getByRole('button', { name: 'Join room' })"). This is
because Playwright's page-snapshot attachment, for a test using the
`{ browser }` fixture with no single default `page`, isn't guaranteed to
snapshot the specific page that was actually blocked -- it can pick up any
other still-open page in the same browser instance. This was flagged and
not treated as evidence about the guest page's actual state.

**Real execution traces provided the actual proof.** `trace: "on-first-
retry"` in `playwright.config.ts` records a full trace only for a test's
first retry, not its initial attempt. Extracting every trace bundle from
the Chromium report and searching for the `click` action targeting "Join
room" found one genuinely informative case
(`tabletopMobile.spec.ts`'s retry, guest page trace group `1`):

1. `goto /recovery` -> claim username -> wait for "your username is" text
   -- succeeds.
2. Click the "Join Room by Name" nav link -> fill "Room name" -> click
   "Join room" -- **this first click fully succeeds**: `click action
   done`, `navigations have finished`.
3. `retryOnRateLimit`'s combined `expect(target.or(rateLimited)).
   toBeVisible()` -- **succeeds**: `locator resolved to <h2>Your rack
   (14)</h2>`.
4. The very next, separate `target.isVisible()` check -- **returns
   `false`** (`"result": {"value": false}`), even though the trace's own
   `frameUrl` at that exact moment is already
   `http://localhost:5173/games/<id>` -- **the guest was already on the
   Tabletop, mid-way through Phase 4's auto-start redirect**, in a brief
   render gap before "Your rack (14)" had (re-)painted.
5. Because that `isVisible()` returned `false`, the code concluded "must
   be rate-limited," attempted to read the (nonexistent) rate-limit
   banner's text (a bounded 2000ms read -- confirmed the previous
   follow-up's fix was in place and behaving correctly, it just timed out
   because there was genuinely no banner to read), backed off ~6 seconds,
   and **re-clicked "Join room"** -- on a page that had already fully
   navigated to `/games/<id>` and would never show that button again.
6. That second click is exactly what then hung until the test's own
   timeout: `waiting for getByRole('button', { name: 'Join room' })`,
   with the `frameUrl` still `/games/<id>`, confirming the click was never
   going to be satisfied.

**Answering the required question directly**: the guest page, at the
moment of the *real* stall, was **already in a room -- specifically
already on the Tabletop (`/games/<id>`)**, not on Recovery, Home, a
partially loaded Join page, or redirected for a missing username. The
join had already fully succeeded server-side; the test helper's own retry
logic was the thing that got confused and clicked a button that no longer
existed.

The ordered CI log for the Chromium job confirms this wasn't isolated to
`tabletopMobile.spec.ts`: Playwright's own final tally was **1 failed
(`tabletopMobile.spec.ts`) + 5 flaky** (`drag-and-drop.spec.ts`,
`invalid-commit-penalty.spec.ts`, `reconnect-recovery.spec.ts`,
`rematch.spec.ts`, `two-player-smoke.spec.ts`) out of 33 -- every one of
the flaky failures cited the identical `waiting for getByRole('button',
{ name: 'Join room' })` stack through `startTwoPlayerGame`, confirming a
systemic helper bug, not a per-spec fluke. Mobile Chrome's tally (1 failed
+ 8 flaky) included the required second data point: `multi-player.spec.ts`'s
3-player test, whose stack trace runs through `startNPlayerGame`
(`helpers.ts:328`) -- the same root cause via the other start helper.

## Root cause

A real, now-fixed bug in `retryOnRateLimit()` (`e2e/tests/helpers.ts`).
After the previous follow-up's fix (bounding the rate-limit banner's
`.textContent()` read), the function still had a **second, distinct**
race: once the combined `expect(target.or(rateLimited)).toBeVisible()`
succeeded, it re-checked `target.isVisible()` alone to decide whether the
real goal had been reached. That combined `toBeVisible()` only proves
`target` (or `rateLimited`) *was* visible at some point during its own
wait -- not that it *still is* the instant the follow-up `isVisible()`
call runs. For a target that's mid-transition through a fast, multi-step
client-side navigation (Waiting Room -> Tabletop, once Phase 4's
auto-start fires), there can be a genuine, brief render gap where neither
the old nor the new content is on screen yet. Landing in that gap made
`isVisible()` return `false` on a **completely successful** path, which
made the loop wrongly conclude it must be rate-limited, back off, and
**re-click a submit button that had already permanently navigated away**
-- exactly the danger the function's own pre-existing comment already
named ("re-clicking would target a vanished button") but didn't actually
prevent.

## `claimUsername()` completion rule

Already correct from the previous follow-up and unchanged here:
`claimUsername()` only returns once `clickUntilSettled` has confirmed the
"your username is `<name>`" confirmation text is visible -- text rendered
directly from `AuthProvider`'s own `state.username`, the exact shared
context every other page (including the Join Room by Name form) reads.
Seeing that text is proof the authenticated client state has genuinely
updated, not merely that the claim request was sent. Its doc comment was
expanded to state this explicitly, since this follow-up's task
specifically asked for the completion rule to be re-verified. Traced
directly (see above): in the one real failing case examined,
`claimUsername`'s own sequence completed correctly before the actual
failure occurred later, in the join step.

## Join-page readiness rule

New `openJoinRoomByNamePage(page)`:

1. Navigates directly to `/rooms/join` (`page.goto`), never a nav-bar link
   click -- the same fragility class already fixed for `/recovery` in the
   previous follow-up, now applied here (the nav link click depends on
   whatever page the caller happens to be on already having it rendered
   and clickable, one more thing that can transiently fail for reasons
   unrelated to what this helper establishes).
2. Waits for the route URL to actually be `/rooms/join`.
3. Waits for the `Join Room by Name` heading.
4. **Waits for the `Room name` input specifically**, not just the
   heading -- `JoinRoomPage.tsx` renders the *same* `<h1>Join Room by
   Name</h1>` whether or not a username is claimed yet (its `if
   (!username) return ...` branch shows a "you need a username" prompt
   with no form at all). Since a direct `page.goto` is itself a full page
   reload that re-runs identity bootstrap via session recovery, waiting
   only on the heading would not distinguish "still bootstrapping,"
   "bootstrapped but genuinely no username," and "genuinely ready" --
   waiting on the room-name field does, because it only exists in the
   last of those three states.
5. Waits for the `Join room` button to be visible.
6. Waits for it to be enabled.
7. On any failure in the above, throws with `describePageState()`'s
   diagnostics: current URL, the first visible heading's text, whether
   the "you need a username" prompt is present, and a short (300-char)
   body-text excerpt -- so a future failure here is diagnosable directly
   from the Playwright error output.

New `joinRoomByName(page, roomName)` builds on it: fills `Room name`,
verifies the field actually holds `roomName` (`toHaveValue`), verifies the
submit button is visible and enabled, clicks it **once** (no retry loop --
see Root cause above for exactly why a retry loop is the wrong tool
here), and waits for one of the three legitimate outcomes: the Waiting
Room heading (room name), the Tabletop heading ("Your rack (14)"), or a
visible `.error-banner[role="alert"]` (JoinRoomPage's own error
rendering, e.g. "room not found"). A matched server error is itself
turned into a clear, distinct thrown error rather than a generic timeout.

`startTwoPlayerGame` and `startNPlayerGame` (and the equivalent inline
setup in `multi-player.spec.ts`'s 3-player-not-yet-full test) now call
`joinRoomByName(guestPage, hostUsername)` in place of the old three-line
nav-click + fill + `clickUntilSettled` block.

## `clickUntilSettled()` changes

- Still used for cases where the submit element is already known to exist
  (Create Room, Claim username, Start Game, dashboard's own Join Room by
  Name button flow) -- it was not repurposed or removed, only hardened.
- Added an explicit precondition: `expect(submit).toBeVisible({timeout:
  15000})` then `expect(submit).toBeEnabled({timeout: 15000})` *before*
  ever calling `retryOnRateLimit`. A `submit.click()` with no timeout of
  its own would otherwise wait, completely unbounded, until the whole
  test timeout expired if the button never existed at all -- this now
  fails in at most ~30 seconds with a clear message instead.
- On a precondition failure, throws with the same `describePageState()`
  diagnostics (URL, heading, username-prompt presence, body excerpt) used
  by `openJoinRoomByNamePage`, so any future "submit button never showed
  up" failure anywhere this helper is used is immediately diagnosable.
- The underlying `retryOnRateLimit()` race itself (see Root cause) was
  also fixed: it now checks `rateLimited.isVisible()` (the exceptional
  condition) and defaults to success when that's false, instead of
  checking `target.isVisible()` (the happy-path condition) and defaulting
  to "must be rate-limited" when that's momentarily false. This benefits
  every remaining `clickUntilSettled` caller transparently, including
  `dashboard.spec.ts`'s own join flow, without needing to touch that
  file.

## Proof no product behavior changed

Every change in this follow-up is confined to `e2e/tests/helpers.ts` and
`e2e/tests/multi-player.spec.ts` -- test infrastructure only. No file
under `apps/web/src`, `apps/server/src`, `packages/engine`, or
`packages/bot` was modified; `git diff --stat` shows exactly two files
changed, both under `e2e/tests/`. `pnpm run test`'s full suite (which
exercises the real application/server code, not the E2E helpers) reports
the exact same totals as the prior checkpoint -- no test count drift, no
behavior change detected anywhere the app itself is exercised.

## Unit/integration results

| Step | Result |
| --- | --- |
| `pnpm run format:check` | Pass |
| `pnpm run lint` | Pass -- 0 issues |
| `pnpm run typecheck` (all 6 workspace projects) | Pass |
| `pnpm run test` | Pass -- shared 38, engine 115, bot 36, web 157, server 317 (identical to the prior checkpoint -- confirms zero application-code drift) |
| `pnpm run build` | Pass (web + server) |
| `pnpm audit --audit-level=high` | Pass -- "No known vulnerabilities found" |

## Repeated `tabletopMobile.spec.ts` results

Run 5 times each, back to back, against the persistent failing case:

- **Chromium** (`--repeat-each=5`): **5/5 passed**, no retries, 1.8
  minutes total.
- **Mobile Chrome** (`--repeat-each=5`): **5/5 passed**, no retries, 1.7
  minutes total.

All 10 runs finished with zero failures, as required.

## Full Chromium result

`CI=1 npx playwright test --project=chromium`: **33/33 passed, zero
retries** (every test passed on its first attempt -- no `×`/`±` markers in
the run's own progress output), **5.6 minutes total**. For comparison,
the failing CI run this follow-up investigates took 15m53s with 1 failed
+ 5 flaky. The same benign `ECONNRESET` WebSocket-proxy cold-start noise
(documented in the previous follow-up as unrelated startup jitter) still
appeared once in this run's WebServer log, with zero test impact this
time.

## Full Mobile Chrome result

`CI=1 npx playwright test --project=mobile-chrome`: **33/33 passed, zero
retries**, **5.4 minutes total** (versus the failing run's 1 failed + 8
flaky). No flaky tests to report for either project this time.

## Smoke results for Firefox/WebKit/Mobile WebKit

`tests/two-player-smoke.spec.ts` (exercises `claimUsername` ->
`startTwoPlayerGame` -> `joinRoomByName` end to end), one run per project:

- **Firefox**: 3/3 passed (1.3m).
- **WebKit**: 3/3 passed (1.7m).
- **Mobile WebKit**: 3/3 passed (1.8m).

## Audit result

```
$ pnpm audit --audit-level=high
No known vulnerabilities found
```

## Rate-limit bypass status

Confirmed, not assumed: every trace inspected for the actual failure
mechanism shows the rate-limit banner was **never genuinely present** --
the bounded `rateLimited.first().textContent({timeout:2000})` read
(installed in the previous follow-up) consistently timed out because
there was nothing to read, which is exactly the expected behavior with
`E2E_DISABLE_RATE_LIMITS` active. This directly corroborates the task's
own framing ("the E2E rate-limit bypass appears to be working... the
failed logs contain no rate-limit banner"). No change was needed to the
bypass mechanism itself (`apps/server/src/env.ts`,
`apps/server/src/app.ts`, `e2e/playwright.config.ts`'s webServer env),
`NODE_ENV !== "production"` guard, or any server security test -- none of
those files were touched in this follow-up. No additional diagnostic was
added to E2E server startup, since the trace evidence already
conclusively confirms the bypass is active and was never the problem.

## Known limitations

- **Playwright's page-snapshot attachments remain potentially misleading**
  for tests using the `{ browser }` fixture with multiple open pages --
  this follow-up worked around it by reading full execution traces
  directly, but did not change anything about how Playwright itself
  captures failure snapshots (out of scope; it's a Playwright behavior,
  not something this codebase controls).
- **The exact render-gap window that triggered the original
  `isVisible()` race was not independently reproduced locally on demand**
  -- the fix is derived from direct trace evidence of it happening in CI
  (a `frameUrl` already on `/games/...` with `isVisible()` still
  returning `false`), not from a local repro loop. The 10/10 repeated
  `tabletopMobile.spec.ts` runs plus the two full zero-retry project runs
  are the confirmation that the fix resolves the observed failure mode in
  practice.
- **`dashboard.spec.ts`'s own three join-flow test bodies were left
  structurally unchanged** (they still click the dashboard's own "Join
  Room by Name" button, by design, since that's the in-app navigation
  UX those tests are actually verifying) -- they now benefit from the
  `clickUntilSettled`/`retryOnRateLimit` fix transparently, but were not
  converted to use the new `joinRoomByName` helper, since doing so would
  have replaced the very navigation path those tests exist to check.

## Confirmation: retention remains OFF

`ENABLE_RETENTION_SWEEP` was not touched in this follow-up. `.env.example`
still documents it as destructive and disabled-by-default
(`ENABLE_RETENTION_SWEEP=false`), and `render.yaml`'s corresponding key
was not modified.
