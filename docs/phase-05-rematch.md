# Phase 5 — One-Click Rematch Control

> Completion summary for Phase 5 of `docs/next-changes-implementation-plan.md`
> (Identity, Room Naming, Auto-Start, Retention & Layout). Implemented on
> branch `feature/identity-room-lifecycle-v2`, on top of Phase 1 (`13b8323`),
> Phase 2 (`17cdb0a`), Phase 3 (`779f55d`), and Phase 4 (`aae2c05`). Later
> phases (48-hour retention, dashboard/tabletop redesign) were **not
> started**.

## Goal

Give the room host a clear, one-click **Rematch** control on the
completed-game screen that immediately seats every eligible current room
member into a fresh game in the same room — without requiring anyone to
mark Ready first, without losing the completed game's history, and without
resetting cumulative room scores. Only the completed-game/rematch
experience changed; the rest of the tabletop, Home, and Waiting Room UI are
untouched.

## Files changed

**Server**

- `apps/server/src/game/roomStart.ts` — `manualRematchRoom` rewritten:
  seats every *current* room member (`listRoomMembers`, which already
  excludes anyone who left) instead of only ready members; the eligibility
  floor changes from "≥2 ready" to "≥2 current members" (`MIN_REMATCH_
  MEMBERS`, a new constant, replacing `insufficient_ready` with
  `insufficient_members` in its outcome type). No other function in this
  module changed — `manualStartRoom`'s ready-gated behavior for the
  *initial* Start Game action is untouched, per the "Ready/Start
  compatibility" requirement.
- `apps/server/src/http/routes/rooms.ts` — `POST /api/rooms/:id/rematch`'s
  error-message mapping updated to match the renamed outcome kind; the
  route itself (URL, host-only auth, response shape, rate limit) is
  unchanged.
- `apps/server/src/db/repositories/games.ts`, `apps/server/src/db/redact.ts`,
  `packages/shared/src/schemas/game.ts` — plumbing-only change: `roomId` is
  now threaded from `loadGameState` through `PersistedGameView` /
  `RedactedGameView` / `RedactedGameViewSchema` and exposed on the wire
  (`GET /api/games/:id` and the `game:join`/`game:state` socket payloads).
  This was necessary because `TabletopPage` previously only had a `gameId`
  in scope — with no way to reach the room the game belongs to, it could
  not call the rematch endpoint or poll room status. `roomId` is
  identifier data, not a redaction concern (same class of field as
  `gameId`), so it's safe to expose to every seat holder.

**Web**

- `apps/web/src/tabletop/RematchPanel.tsx` (new) — the completed-game
  rematch control, mounted by `TabletopPage` only while `view.status ===
  "completed"`.
- `apps/web/src/pages/TabletopPage.tsx` — the Game Over card now renders
  `<RematchPanel roomId={view.roomId} gameId={gameId} />` in place of the
  old static "Return to the room to ready up for a rematch." line; "Back to
  your rooms" remains as a secondary link.

**Tests** (see "Tests added" below)

**No shared-schema changes** beyond the `roomId` addition above (`{gameId}`
request/response shapes for start/rematch are unchanged). **No migration.**

## Previous rematch behavior vs. new one-click behavior

| | Before Phase 5 | After Phase 5 |
| --- | --- | --- |
| Where | Only from the Waiting Room (`/rooms/:id`), after navigating away from the completed game | Directly on the completed-game (Game Over) screen, **plus** the Waiting Room's control still works unchanged |
| Who gets seated | Only members who had marked themselves Ready | **Every current room member** (`left_at IS NULL`), regardless of readiness |
| Host action required | Host also had to mark Ready, then click "Start rematch" | Host clicks **Rematch** once — no Ready step |
| Non-host members | Had to mark Ready themselves for the host's rematch to seat them, then relied on the Waiting Room's own poll to be carried into the new game | Do nothing — they're seated automatically and carried into the new game by the completed-game screen's own poll |
| Minimum members | ≥2 *ready* members | ≥2 *current* members |

The Waiting Room's own Ready toggle, Start Game button, and its
`between_games` "Start rematch" button are all **still present and
functional** — `WaitingRoomPage.tsx` was not touched. Since `manualRematchRoom`
no longer depends on readiness at all, clicking that older button now also
seats every current member rather than only the ready ones; its `canStart`
gate (`readyCount >= 2`) still guards the button's enabled state, but has no
further effect on who actually gets seated once dealt. Both entry points
call the identical server-side transaction, so they can never disagree
about who's eligible or produce two different games.

## Eligible-member definition

Sourced from the existing `listRoomMembers(db, roomId)` repository
function — no new query was needed:

- **Included**: every `room_members` row for the room with `left_at IS
  NULL`, in join order. This covers human members regardless of their old
  `is_ready` flag, and the computer member of a Play vs Computer room
  (which is always "ready" but that fact is now irrelevant to rematch
  eligibility).
- **A player who resigned from the just-completed game remains eligible.**
  `game_seats.status = "resigned"` is a per-game historical record, entirely
  separate from `room_members.left_at` — resigning ends that one game, it
  does not remove the player from the room. Verified directly (`roomStart.
  test.ts`: "a player who resigned from the completed game remains
  eligible").
- **Excluded**: anyone with `left_at` set (explicitly left, or removed) —
  never silently resurrected. Verified directly ("excludes a member who
  explicitly left the room").
- **Floor**: at least `MIN_REMATCH_MEMBERS = 2` eligible members, or the
  rematch is rejected outright (a human + the Play vs Computer bot counts
  as two).

Seat ordering is unchanged from every other deal path in this codebase:
`listRoomMembers`' `joined_at ASC` order is passed straight through to
`dealForRoom`, which assigns seat indices in that order — the same
convention `joinRoomAndMaybeAutoStart` and `manualStartRoom` already use.
There is no separate "rematch order" concept.

## Authoritative transaction and lock behavior

`manualRematchRoom` reuses the exact transaction shape every other entry
point in `roomStart.ts` follows (`lockRoomForUpdate` → recheck under lock →
decide → deal ≤1 game → transition → commit), now with the eligibility
check replaced:

```
lock room row (SELECT ... FOR UPDATE)
  → require status === "between_games"
  → list current members (left_at IS NULL)
  → require members.length >= MIN_REMATCH_MEMBERS
  → next seq = (latest game's seq ?? 0) + 1
  → dealForRoom: deal exactly one new game, transition room to in_game, reset readiness
  → commit
```

`dealForRoom`, `dealNewGame`, the unique `(room_id, seq)` constraint, and
`resetReadiness` (clears only human `is_ready` flags — the computer member
stays intrinsically ready) are all unchanged, inherited directly from
Phase 4. A second concurrent rematch request either loses the row lock and
observes `status !== "between_games"` once it acquires it (the winner has
already flipped the room to `in_game`), or — if it somehow reached the
check first — loses the race on the unique `(room_id, seq)` backstop. Both
outcomes were verified directly with real `Promise.all` concurrency, not a
simulated approximation (see "Concurrency tests" below): two simultaneous
`manualRematchRoom(db, roomId)` calls against the same room always produce
exactly one new `games` row, and a rematch request arriving after the room
has already transitioned to `in_game` is safely rejected.

The room's prior completed game and its `game_seats` rows are never
touched by this transaction — `dealForRoom` only ever `INSERT`s a new
`games`/`game_seats`/`racks`/`turns` row set, it never updates or deletes
an existing game.

## Host authorization

Unchanged: `POST /api/rooms/:id/rematch` still requires an authenticated
session (`requireSession`) and host-only authorization (`requireRoomHost`,
an unlocked read against `room.host_room_member_id`, exactly as before)
*before* the locked transaction runs. A non-host caller gets `403`, exactly
as before Phase 5.

## Web: host experience

`RematchPanel` (rendered only while `view.status === "completed"`) polls
`GET /api/rooms/:roomId` every 3000ms — the same interval and pattern
`WaitingRoomPage` already uses, per the explicit instruction to reuse the
established waiting-room polling approach rather than add new Socket.IO
infrastructure (there is no room-scoped realtime channel, only
game-scoped). Once that poll resolves and `room.hostPlayerId` matches the
signed-in player, a **Rematch** button renders. Clicking it:

1. Disables the button and swaps its label to "Starting rematch…"
   (`busy` state) — prevents a duplicate request from a double-click.
2. Calls the existing `POST /api/rooms/:id/rematch` endpoint exactly once.
3. On success, navigates the host directly to the returned `gameId`.
4. On failure, shows the server's error message in an inline banner and
   re-enables the button so the host can retry immediately (no page reload
   needed).

## Web: non-host experience and auto-navigation

A non-host viewing the same completed game sees "Waiting for the host to
start a rematch." instead of an active button — never a disabled- or
placeholder-Rematch button, an actual absence of one (verified in both the
component tests and the E2E spec). The **same polling effect** that shows
the host their room context also drives auto-navigation for everyone:
whenever the polled room's `latestGameId` differs from the game currently
being viewed, every client (host included, as a safety net) navigates
there via `navigate(..., { replace: true })`.

This satisfies every requirement for the "all clients" following logic:

- Runs only while mounted — i.e., only while the current game is displayed
  as completed; `TabletopPage` unmounts `RematchPanel` the instant `view.
  status` is no longer `"completed"`.
- Stops polling on unmount (the effect's cleanup clears the interval) —
  verified directly with fake timers (`RematchPanel.test.tsx`: "stops
  polling once unmounted").
- Never re-navigates to the game already on screen (`latestGameId !==
  gameId` guard) — verified ("does not navigate while latestGameId still
  matches the game being viewed").
- Only ever targets a `gameId` the room itself reported via `GET /api/
  rooms/:id`, keyed by the `roomId` prop — never an arbitrary value, so
  this can't be steered anywhere else.
- A `404` from the room poll (room no longer exists) renders "This room no
  longer exists." instead of crashing, mirroring `WaitingRoomPage`'s
  existing `notFound` handling.
- Any other transient poll failure just leaves the previous room state in
  place for the next tick, rather than erroring out — the same tolerance
  `WaitingRoomPage`'s poll already has.

## Play vs Computer behavior

One-click rematch works identically for a Play vs Computer room: the human
host clicks Rematch, `manualRematchRoom` seats the human member and the
computer member (both are current room members; the computer's readiness
is irrelevant to the new eligibility rule), and the game starts
immediately with no second human and no Ready interaction required. Bot
seat metadata (`controller_type`, `bot_kind`) is set by the same unchanged
`dealNewGame`/`dealForRoom` path every other deal uses, so bot-first-turn
scheduling (`realtime/gateway.ts`'s `maybeScheduleBotTurn`) and durable
recovery (`game/deadlineSweep.ts`, untouched) work exactly as before.
Verified directly at the repository level (`roomStart.test.ts`: "Play vs
Computer: one-click rematch reseats the human and the computer, no
readiness needed") and end-to-end (`e2e/tests/rematch.spec.ts`: "play vs
computer: one-click rematch from Game Over reseats the human and the bot
immediately"). `packages/bot`'s strategy, move generation, and difficulty
were not touched.

## Cumulative score preservation

`manualRematchRoom`/`dealForRoom` never reference the `room_scores` table
at all — cumulative scoring is written exclusively by `game/turnActions.
ts`'s `applySideEffects` when a game actually *ends* (`recordGameResult`),
which is a completely separate code path from dealing a new one. This
means score preservation across a rematch was already structurally
guaranteed before this phase; Phase 5 only needed to verify it, not
implement it — confirmed directly (`roomStart.test.ts`: "does not touch
room_scores -- cumulative scores survive a rematch untouched", asserting
`room_scores` is byte-for-byte identical before and after a rematch) and
that the prior completed game and its `game_seats` remain untouched in the
database ("preserves the prior completed game and its result untouched").
No lifetime statistics, rankings, or cross-room totals were added — out of
scope, per the plan.

## API/schema changes

- `RedactedGameViewSchema` (`packages/shared/src/schemas/game.ts`) gained
  one field: `roomId: z.string()`. This is the only wire-format change in
  this phase; `{gameId}` request/response shapes for `/start` and
  `/rematch` are unchanged, and no new endpoint was added (`POST /api/
  rooms/:id/rematch` is the same route from Phase 4, with only its
  internal error-message mapping updated).

## Tests added

Server (**+21 net**, up from 249):

- `apps/server/test/game/roomStart.test.ts` — the old ready-based rematch
  test was replaced with Phase 5's one-click rule; new coverage: seating
  every current member regardless of readiness; 2-/3-/4-player full-room
  rematch; excluding a member who left; a resigned-but-still-present
  member remaining eligible; rejecting fewer than `MIN_REMATCH_MEMBERS`
  eligible members; readiness reset after dealing; the prior completed
  game and its seats surviving untouched; `room_scores` surviving
  untouched; Play vs Computer rematch; two simultaneous rematch requests
  producing exactly one new game; a rematch request after the room already
  transitioned to `in_game` being safely rejected.
- `apps/server/test/http/rooms.test.ts` — the existing rematch test
  rewritten to assert every current member is seated (not just the
  previously-ready ones); new HTTP-level coverage: non-host rejection
  (`403`); fewer-than-2-eligible-members rejection (`409`); two concurrent
  `app.inject` rematch requests over the same room producing exactly one
  `200` and one `409`, with the database queried afterward as the final
  arbiter (not just the HTTP status codes).
- `apps/server/test/db/redact.test.ts` — its `PersistedGameView` test
  fixture updated for the new required `roomId` field.

Shared (**+0 net new test, 1 fixture fix**): `packages/shared/test/
schemas.test.ts`'s `RedactedGameViewSchema` fixture updated for the new
required `roomId` field.

Web (**+14 net**, up from 90):

- `apps/web/test/RematchPanel.test.tsx` (new, 10 tests) — host sees an
  active, enabled Rematch button; the button disables and the endpoint is
  called exactly once even across a second click while busy; success
  navigates to the returned game; an API failure shows a useful inline
  error and allows an immediate retry (which succeeds); a non-host never
  sees an active Rematch button and instead sees the waiting message;
  polling navigates once `latestGameId` differs from the game being
  viewed; polling does *not* navigate while it still matches; polling
  stops once the component unmounts; a missing room renders a graceful
  message instead of crashing.
- `apps/web/test/TabletopPageRematch.test.tsx` (new, 2 tests) — the Game
  Over card and `RematchPanel` mount only when the game is completed,
  never while it's still active.
- `apps/web/test/TabletopComputerTurn.test.tsx` — its `RedactedGameView`
  fixture updated for the new required `roomId` field (both existing
  tests continue to pass unmodified otherwise).

## Quality-gate results

Run from the existing local Postgres 16 (`tile-meld-db-1`, already
migrated — no new migration in this phase):

| Step | Result |
| --- | --- |
| `pnpm run format:check` | **Pass** |
| `pnpm run lint` | **Pass** — 0 issues |
| `pnpm run typecheck` (all 6 workspace projects, incl. `e2e`) | **Pass** |
| `pnpm run test` | **Pass — 543/543** (shared 38, engine 115, bot 36, web 90 — up from 78, server 264 — up from 249) |
| `pnpm run build` | **Pass** (web + server) |

## Chromium E2E results

| Spec | Tests | Result | Covers |
| --- | --- | --- | --- |
| `rematch.spec.ts` (new) | 2 | **2/2 pass** | one-click rematch from the Game Over screen, host + automatic non-host navigation to the same new game; Play vs Computer one-click rematch |
| `full-lifecycle.spec.ts` | 1 | **1/1 pass** | the older Waiting-Room-based rematch path (Ready + "Start rematch"), unchanged regression |
| `multi-player.spec.ts` | 3 | **3/3 pass** | 3-/4-player auto-start + manual early-start regression, unaffected by this phase |
| `vs-computer.spec.ts` | 2 | **2/2 pass** | Play vs Computer manual-start regression, unaffected by this phase |

9/9 pass. Not run: the full five-project matrix (Firefox/WebKit/mobile) —
per the plan, that runs before merge, not during implementation.

### A note on `rematch.spec.ts`'s wait conditions

Both new specs resign immediately (the deterministic way to reach
`game:over`, since the random deal makes a natural game conclusion
unscriptable) — meaning neither seat has drawn or committed anything, so
the just-completed game and the fresh rematch both show a 14-tile rack.
Waiting on "Your rack (14)" alone can't distinguish "still viewing the
completed game" from "already on the new one" the way it safely can in
tests that navigate through an intermediate page (e.g. `full-lifecycle.
spec.ts`, which detours through the Waiting Room in between). Every wait in
`rematch.spec.ts` is anchored on the extracted `gameId` actually changing
(`expect.poll`) or the "Game over" heading disappearing, not on rack
content alone.

## Known limitations

- **The Waiting Room's own "Start rematch" button's enabled state is still
  gated on `readyCount >= 2`**, even though the server no longer requires
  readiness to actually seat members. This is intentional — the plan
  explicitly required preserving the existing Ready control and Start
  Game button unmodified — but it does mean that page's button can be
  briefly *disabled* in a state where a rematch would actually succeed
  (e.g. between_games with 2 current-but-unready members). The new
  Game Over Rematch button has no such gate and is the primary one-click
  path this phase was asked to add.
- **`RematchPanel`'s polling interval (3000ms) means a real non-host user
  can see up to a ~3-second delay** between the host starting a rematch
  and their own client auto-navigating — an inherent property of reusing
  the existing poll-based mechanism rather than adding a new realtime
  channel, and consistent with the identical delay `WaitingRoomPage` and
  Phase 4's auto-start already have.
- **No UI surfaces cumulative room scores yet** (`GetRoomResponseSchema`
  has no score field, and the socket `game:over` payload's `roomCumulative`
  data is still received but not rendered by the web client). This was
  explicitly scoped as "if already available" by the phase instructions
  — since it wasn't available before this phase and adding it was not
  requested, no score display was added; the data's continued correctness
  across a rematch was verified at the database level instead (see
  "Cumulative score preservation").

## Confirmation: Phase 6+ not started

No work was done on 48-hour retention, dashboard status styling, Home page
hierarchy redesign, tabletop information-hierarchy/visual-theme redesign,
room search/autocomplete, login accounts, or lifetime statistics.
`packages/engine` and `packages/bot` were not modified. The Ready UI and
Start Game button remain fully present, visible, and functional in the web
client — nothing was removed or hidden.
