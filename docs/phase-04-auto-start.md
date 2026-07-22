# Phase 4 — Race-Safe Auto-Start Alongside the Existing Start Game Button

> Completion summary for Phase 4 of `docs/next-changes-implementation-plan.md`
> (Identity, Room Naming, Auto-Start, Retention & Layout). Implemented on
> branch `feature/identity-room-lifecycle-v2`, on top of Phase 1 (`13b8323`),
> Phase 2 (`17cdb0a`), and Phase 3 (`779f55d`). Later phases (rematch
> redesign, 48-hour retention, dashboard/tabletop redesign) were **not
> started**.

## Goal

Keep the existing host-controlled Start Game button and Ready UI exactly as
they are, while **additionally** starting a room automatically the moment
it reaches its selected capacity — per the user-approved correction to the
original DR‑9 recommendation (which would have removed Ready/Start
entirely). Both triggers must be race-safe and unable to create two games
for the same room.

## Files changed

**Server**

- `apps/server/src/game/roomStart.ts` (new) — the one authoritative,
  transaction-safe path for every way a room can deal a game:
  `joinRoomAndMaybeAutoStart`, `manualStartRoom`, `manualRematchRoom`, all
  built on a shared internal `dealForRoom` primitive.
- `apps/server/src/http/routes/rooms.ts` — `POST /api/rooms/join`,
  `/join-by-name`, and `/quick-join` now delegate their member-insertion
  and possible auto-start to `joinRoomAndMaybeAutoStart`; `POST
  /api/rooms/:id/start` and `/:id/rematch` now delegate to
  `manualStartRoom`/`manualRematchRoom`. The old inline `dealAndTransitionRoom`
  helper and the direct `addRoomMember`/lock calls in the join routes are
  gone, replaced by calls into `game/roomStart.ts`. `MIN_READY_TO_START` is
  now defined once, in `roomStart.ts`, and imported here.

**Tests** (see "Tests added" below)

**E2E** — `e2e/tests/helpers.ts`, `multi-player.spec.ts`,
`public-lobby.spec.ts` updated deliberately for the new auto-start timing
(see "Chromium E2E results" for why).

No shared-schema changes, no web source changes, no migration — see "API
behavior" and "Waiting-room and realtime behavior" below for why neither
was needed.

## Authoritative transaction design

`game/roomStart.ts` exports three entry points, each opening exactly one
transaction and following the same ten-step shape the plan specified:

```
lockRoomForUpdate → re-check status → re-check capacity → decide → deal (≤1 game) → transition to in_game → commit
```

**`joinRoomAndMaybeAutoStart(db, roomId, playerId, displayName)`** — the
single path every human join route calls:
1. Locks the room row (`SELECT ... FOR UPDATE`, via `lockRoomForUpdate` —
   reused unchanged from Phase 3, not reimplemented).
2. Rechecks `has_computer` (a Play-vs-Computer room can never be joined),
   then `status === "open"`, under the lock.
3. Rechecks `members.length < capacity` under the same lock.
4. Inserts the member (`addRoomMember`, unchanged).
5. If the room has **not** just reached capacity, returns `{kind: "joined",
   gameId: null}` — an ordinary join, no deal.
6. If it **has**, re-reads membership (now including the new member) and
   deals a game seating **every current member, regardless of readiness**
   — capacity, not a Ready toggle, is the trigger.
7. Returns `{kind: "joined", gameId}`.

All of this happens **inside the one transaction**, exactly as required:
the member insertion and the possible auto-start are not two operations
racing each other, they're one atomic unit.

**`manualStartRoom(db, roomId)`** — the host-controlled Start Game action.
Locks the room, rechecks `status === "open"`, rechecks the ready count
against the existing `MIN_READY_TO_START = 2` floor (unchanged), and deals
a game seating **only the currently-ready members** (unfilled seats close
— unchanged behavior). Host authorization itself still happens *before*
this call, against an unlocked read, exactly as before Phase 4 — it needs
no lock, only the deal decision does.

**`manualRematchRoom(db, roomId)`** — same locking discipline applied to
rematch for consistency, with its **business rules completely unchanged**:
`status === "between_games"`, ready-based seating, host-only, next `seq`.
Rematch was explicitly out of scope for redesign this phase; only its
concurrency safety was hardened to match every other path.

All three call a shared private `dealForRoom(trx, room, seatMembers, seq)`
that does the actual `dealNewGame` + `updateRoomStatus("in_game")` +
`resetReadiness` sequence — the literal "deal at most one game" step is
implemented exactly once, not duplicated per caller.

## Lock order

Every room-mutating path in this module locks **only the `rooms` row**,
then either **inserts** fresh `games`/`game_seats`/`racks`/`turns` rows (no
lock needed for inserts) or does nothing further. No code path here ever
locks an existing `games` row. Turn actions (`game/turnActions.ts`,
`persistTransition`) lock `games` rows directly by `gameId` and never touch
a room lock. **The two lock domains are disjoint by construction** — room
locks and game locks never nest inside each other in either order — so
there is no room-then-game vs. game-then-room ordering to conflict, and no
new deadlock surface was introduced. This is a structural guarantee (rooms
are locked before any game row for that room exists yet, in every path
here), not a convention that has to be remembered.

## Behavior of every join path

| Route | Change |
| --- | --- |
| `POST /api/rooms/join-by-name` | Now calls `joinRoomAndMaybeAutoStart`. Every non-`"joined"` outcome (`computer_room`, `not_open`, `full`) collapses to the same generic `404 not_found` — Phase 3's uniform-failure privacy design is preserved unchanged. |
| `POST /api/rooms/join` (legacy code) | Now calls the same function, but **keeps its three distinct existing messages** (`"this room cannot be joined"`, `"room is not open for joining"`, `"room is full"`) — a room code isn't a privacy-sensitive lookup the way a name is, so there was never a reason to collapse them, and doing so would have been an unrequested behavior change to a route explicitly preserved for compatibility. |
| `POST /api/rooms/quick-join` | Now calls the same function; any non-`"joined"` outcome reuses the existing `"no eligible public room to join"` message (the only failure mode this route ever had) — a race between `findQuickJoinableRoom`'s own unlocked read and the lock below is rare but now handled safely instead of silently over-filling a room. |

`display_name_taken` (a `(room_id, lower(display_name))` unique violation)
is caught once, inside `joinRoomAndMaybeAutoStart`, and surfaced by every
caller with their existing `"that display name is already taken in this
room"` message.

The pre-existing "is this player already a member" reconnect check stays
exactly where it was in every route — **before** `joinRoomAndMaybeAutoStart`
is ever called, unlocked — so reconnecting to an already-started room
remains a trivial, idempotent `200` regardless of current room state,
unchanged from before this phase.

## Manual Start behavior

`POST /api/rooms/:id/start` is otherwise unchanged: same URL, same host
authorization (`requireRoomHost`, unlocked read), same three response
shapes (`{gameId}` / `409 "room is not open"` / `409 "at least 2 ready
members are required"`). The only change is that its deal decision now
happens inside `manualStartRoom`'s locked transaction instead of an
unlocked read-then-write — closing the exact race the plan called out
("if manual Start wins first, the joining request must fail safely because
the room is no longer open" — verified directly, see "Race handling"). The
Start Game button and the Ready toggle are both **untouched** in the web
client; nothing needed to change there (see "Waiting-room and realtime
behavior").

## Capacity rules for 2/3/4 players

- **Capacity 2**: auto-starts the instant the second player joins (the 1st
  and only possible non-host join always fills the room).
- **Capacity 3**: stays `open` at 2 members; auto-starts on the 3rd join.
- **Capacity 4**: stays `open` at 2 and 3 members; auto-starts on the 4th
  join.
- **Manual early start**: a host can still call `/start` for a 3- or
  4-player room with only `MIN_READY_TO_START` (2) ready members, seating
  only those and closing the rest — exactly as before Phase 4, now just
  additionally race-safe against a concurrent auto-start attempt.
- **Play vs Computer**: `createComputerRoom` inserts both the human and the
  bot member directly, in its own transaction, and never calls
  `joinRoomAndMaybeAutoStart` at all — so a freshly-created 2-seat bot room
  has both seats filled but stays `open` until the human manually readies
  and starts, exactly as required. Verified directly
  (`test/game/roomStart.test.ts`: "createComputerRoom leaves the room open
  despite both seats being filled immediately").

## Race handling

Every scenario the plan asked for is covered by a real concurrent test
(`Promise.all` of two genuine calls against the same room), not a
simulated/serialized approximation:

- **Two simultaneous joins for the last seat** → exactly one `"joined"`,
  one `"not_open"` (the winner's auto-start already flipped the room's
  status before the loser's lock is granted, so the loser sees `not_open`,
  not `full` — the status check runs first) → room never exceeds capacity
  → exactly one `games` row.
- **Manual Start racing the final join** → whichever wins deals the game;
  the other observes `not_open` and deals nothing — verified in both
  directions (the test doesn't assume which side wins, it asserts
  correctness for either outcome) → exactly one `games` row.
- **Two simultaneous manual Start requests** → exactly one `"started"`, the
  other `"not_open"` → exactly one `games` row.
- **Legacy code join racing exact-name join** for the final seat → exactly
  one `200`, the other the appropriate failure for its own route → exactly
  one member row added, one game dealt.
- **Quick Join racing an exact-name join** for the same room → exactly one
  succeeds → room never over capacity, one game dealt.
- **Reconnect/repeated join** after auto-start → still idempotent `200`,
  no new member row (unaffected by the lock, since the reconnect check
  never reaches it).
- **The unique `(room_id, seq)` constraint remains a secondary backstop**,
  not the primary mechanism — proven directly by calling `dealNewGame`
  twice at the same `seq` **while bypassing the room lock entirely**: the
  first succeeds, the second is rejected by the database constraint alone.
  In normal operation, this constraint is never even exercised under
  contention, because the room lock already serializes every path that
  could attempt seq 1 for a given room — the test demonstrates what would
  catch a *future* bug that skipped the lock, not what currently prevents
  the race day to day.

## Play vs Computer behavior

Unaffected beyond gaining the same underlying locked `manualStartRoom`
transaction as every other manual start. Bot seating, readiness (the bot
is intrinsically ready from `addRoomMember`, unchanged), computer-room
authorization (`has_computer` check, unchanged), the initial deal, bot-turn
scheduling, and the durable recovery sweep (`game/deadlineSweep.ts`,
untouched) are all exactly as they were. A dedicated regression test
confirms manual Start still deals a mixed human/computer game correctly
end-to-end (`test/http/autoStart.test.ts`), and the existing
`botTurn.test.ts`/`botRealtime.test.ts`/`deadlineSweep.test.ts` suites
(untouched, still passing) continue to cover bot-first-turn recovery.

## API/schema changes

**None.** Every join response stays `{roomId}`; every start/rematch
response stays `{gameId}`. Per the plan's explicit instruction not to
expand schemas speculatively: `WaitingRoomPage` already polls `GET
/api/rooms/:id` every 3 seconds and auto-navigates once it observes
`status === "in_game"` with a `latestGameId` — this existing mechanism
picks up an auto-started game exactly the same way it already picks up a
manually-started one, with zero client changes required. Verified directly
at the HTTP level (`test/http/autoStart.test.ts`: "a private room
auto-starting still shows every seated player their game via the
waiting-room poll's data source" — confirms host and guest both see
identical `status`/`latestGameId` immediately after the triggering join)
and at the E2E level (every auto-start flow below navigates through the
real polling UI, not a special-cased response field).

## Waiting-room and realtime behavior

No web source files changed in this phase. `WaitingRoomPage.tsx`'s
existing poll-and-navigate `useEffect` needed no modification — it was
already written to react to *any* `status === "in_game"` transition,
regardless of what caused it. No new Socket.IO subsystem was added or
needed. The one genuinely new risk — a client's Ready/Start buttons
becoming stale mid-click if auto-start fires between render and click —
only matters for E2E test scripts driving the real UI at speed (see
"Chromium E2E results"); a real user simply sees their Waiting Room replace
itself with the Tabletop within the next 3-second poll, same as they
already did for a manual Start.

## Tests added

Server (**+33**, 249 total, up from 216):

- `apps/server/test/game/roomStart.test.ts` (new, 18 tests) — direct,
  repository-level coverage of `joinRoomAndMaybeAutoStart` (2/3/4-player
  auto-start, readiness-independent seating, exactly-one-game, no
  post-start joins, the `full` branch), `manualStartRoom` (early start
  below capacity, insufficient-ready rejection, not-open rejection), the
  four required concurrency scenarios (all via real `Promise.all`),
  `manualRematchRoom` (unchanged rules, now locked), the unique-`seq`
  backstop proof, and the Play-vs-Computer non-auto-start proof.
- `apps/server/test/http/autoStart.test.ts` (new, 15 tests) — HTTP-level
  auto-start via all three join routes, the 3-/4-player "correct waiting
  count below capacity, auto-starts at capacity" flow, manual-Start
  regression (host-only, insufficient-ready, Ready endpoint), cross-route
  concurrency (legacy-code vs. exact-name, Quick Join vs. exact-name,
  reconnect-after-auto-start), and Play-vs-Computer manual-start
  regression.
- `apps/server/test/http/chat.test.ts`, `games.test.ts` — local
  `startTwoPlayerGame` test helpers updated: the capacity-2 join now
  auto-starts, so the old manual ready+`/start` round trip (which would
  now fail with `409 "room is not open"`) was replaced with reading
  `latestGameId` off `GET /api/rooms/:id` after the join.
- `apps/server/test/http/rooms.test.ts` — two pre-existing tests updated:
  "returns room details..." now uses capacity 3 (was 2) so the room stays
  `open` for its manual ready+Start assertions; the rematch test now uses
  capacity 4 (was 3) so all 3 joining members don't themselves trigger an
  unwanted auto-start before the test's own ready/Start sequence runs.
  Neither test's actual assertions changed, only the room size needed to
  keep exercising manual control deliberately.

Shared: no changes (no new schemas).

Web: no changes (no new components; existing 78 tests all still pass
unmodified).

## Quality-gate results

Run from a clean local Postgres 16 (`tile-meld-db-1`, already migrated —
no new migration in this phase):

| Step | Result |
| --- | --- |
| `pnpm run format:check` | **Pass** |
| `pnpm run lint` | **Pass** — 0 issues |
| `pnpm run typecheck` (all 6 workspace projects, incl. `e2e`) | **Pass** |
| `pnpm run test` | **Pass — 516/516** (shared 38, engine 115, bot 36, web 78, server 249 — up from the Phase‑3 baseline of 483) |
| `pnpm run build` | **Pass** (web + server) |

## Chromium E2E results

| Spec | Tests | Result | Covers |
| --- | --- | --- | --- |
| `two-player-smoke.spec.ts` | 3 | **3/3 pass** | 2-player auto-start (via `startTwoPlayerGame`), exact-name private-room join regression |
| `multi-player.spec.ts` | 3 | **3/3 pass** | 3-/4-player auto-start at capacity (via `startNPlayerGame`) + new "3-player room: host manually starts early with only 2 of 3 seats filled" |
| `vs-computer.spec.ts` | 2 | **2/2 pass** | Play vs Computer manual-start regression (unchanged Ready/Start flow) |
| `public-lobby.spec.ts` | 1 | **1/1 pass** | public-lobby/Quick Join regression |
| `accessibility.spec.ts` | 7 | **7/7 pass** | broad UI regression, incl. Waiting Room a11y |
| `full-lifecycle.spec.ts` | 1 | **1/1 pass** | manual rematch regression (unchanged) |
| `reconnect-recovery.spec.ts` | 2 | **2/2 pass** (1 transient rate-limit flake on a combined run, passed cleanly in isolation — see below) | reconnect/reload regression, since `helpers.ts` changed |

19/19 pass. One `reconnect-recovery.spec.ts` test failed once when run
immediately after 8 other specs in one long batch (`element not found`
waiting for a rack heading after a direct `goto` to a known game URL) and
passed cleanly when the file was re-run in isolation — consistent with the
suite's own documented per-IP rate-limit characteristics (`HANDOFF.md`:
"the recovery endpoint (5/min) is the tightest" bucket, hit hardest by
this specific test's two recovery round trips), not a Phase 4 regression.

### Why `helpers.ts` and two specs needed deliberate updates

Auto-start firing **the instant** the last seat fills broke a real,
pre-existing assumption in `e2e/tests/helpers.ts`: `startTwoPlayerGame`
and `startNPlayerGame` both used to click "Mark ready" then "Start game"
*after* every seat had joined. For a capacity-2 room (or the last join of
a 3-/4-player room), the room now auto-starts **before** those clicks would
land — the buttons can already be gone (the page redirected via its own
3-second poll) by the time Playwright tries to click them. Both helpers
were rewritten to drop the now-unnecessary-and-unsafe manual round trip
entirely and rely on the same robust "wait for `/games/` URL, falling back
to a direct `goto` if the poll lags" pattern the code already used for the
*host* side. The join-click's own wait target was widened
(`.or(...)`) to tolerate landing on either the (possibly momentary) Waiting
Room or an already-redirected Tabletop.

`public-lobby.spec.ts` had the identical latent race in its own inline
lobby-join and Quick-Join steps (both against capacity-2 public rooms) —
fixed by giving both test rooms extra capacity headroom (4 and 3
respectively) instead of widening their wait targets, since this test's
actual purpose (verifying the lobby/Quick-Join UI mechanics) doesn't need
auto-start to fire at all, and keeping the rooms deliberately `open`
throughout preserved every original assertion (heading, "Room code:" line
re-verification, "Leave room" landing signal) without weakening them.

Not run: the full five-project matrix (Firefox/WebKit/mobile) — per the
plan, that runs before merge, not during implementation.

## Known limitations

- **The legacy code-based join route's distinct error messages required
  keeping a richer outcome type** (`computer_room` / `not_open` / `full` /
  `display_name_taken` / `joined`) than a simpler boolean would need. This
  is intentional — collapsing it to match join-by-name's uniform failure
  would have been an unrequested behavior change to a route explicitly
  preserved for compatibility — but it does mean `JoinRoomOutcome` carries
  cases some callers (join-by-name, quick-join) treat as equivalent. This
  is documented in `roomStart.ts` itself, not a surprise for a future
  reader.
- **`findQuickJoinableRoom`'s own room-selection read stays unlocked** (it
  only picks a *candidate*; the actual join is what's now locked). A race
  between two Quick Joiners picking the *same* candidate room is safe (the
  second one simply loses the lock race and gets the existing "no eligible
  room" message), but two Quick Joiners could theoretically pick *different*
  candidate rooms when a single shared one would have been more efficient
  to fill — a minor efficiency note, not a correctness gap.
- **E2E auto-start timing is inherently sensitive to the 3-second poll
  interval.** The widened `.or()` wait targets handle both "still on the
  Waiting Room" and "already redirected" outcomes correctly, but a real
  production user experiences the same up-to-3-second delay between a
  triggering join and their own client noticing the game exists — this was
  already true before Phase 4 (manual Start has the identical polling
  delay for the non-clicking player) and is unchanged, not a new
  limitation this phase introduces.
- **No change to `findQuickJoinableRoom`'s selection algorithm** (oldest
  `last_activity_at` first, unchanged) — auto-start doesn't alter which
  room Quick Join picks, only what happens once the pick is joined.

## Confirmation: Phase 5 and later phases not started

No work was done on rematch redesign (its business rules are explicitly
unchanged, only its locking discipline was hardened for consistency), 48-hour
retention, dashboard status styling, Home page hierarchy redesign, or
tabletop layout. `packages/engine` and `packages/bot` were not modified.
The Ready UI and Start Game button remain fully present, visible, and
functional in the web client — nothing was removed or hidden.
