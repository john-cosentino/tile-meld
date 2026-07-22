# Phase 3 — Join Rooms by Exact Name

> Completion summary for Phase 3 of `docs/next-changes-implementation-plan.md`
> (Identity, Room Naming, Auto-Start, Retention & Layout). Implemented on
> branch `feature/identity-room-lifecycle-v2`, on top of Phase 1 (`13b8323`)
> and Phase 2 (`17cdb0a`). Later phases (auto-start, rematch, 48-hour
> retention, dashboard/tabletop redesign) were **not started**.

## Goal

Replace the normal room-joining experience with exact-name joining for both
public and private rooms, per the user-approved correction to the original
DR‑8 recommendation: private rooms are **unlisted, not secret** — joinable
by exact name, with no invite code required in the normal flow.

## Files changed

**Server**

- `apps/server/src/db/repositories/rooms.ts` — new `findRoomByName()`:
  case-insensitive exact-match lookup (`lower(name) = lower(input)`,
  `name IS NOT NULL`), no LIKE/prefix/broad scan.
- `apps/server/src/db/transactions.ts` — new `lockRoomForUpdate()`, mirroring
  the existing `lockGameForUpdate()` pattern; the critical-section entry
  point for the new endpoint's capacity recheck.
- `apps/server/src/http/routes/rooms.ts` — new `POST /api/rooms/join-by-name`
  route; `POST /api/rooms/quick-join` now requires a claimed username and
  uses it instead of the client-supplied `displayName`; a doc comment marks
  `POST /api/rooms/join` (unchanged) as the preserved legacy/compatibility
  path.

**Shared**

- `packages/shared/src/schemas/rooms.ts` — new `RoomNameSchema` (trim,
  1..`ROOM_NAME_MAX_LENGTH`), `ROOM_NAME_MAX_LENGTH` (derived from
  `USERNAME_MAX_LENGTH` + the `public_` prefix + the numbering suffix, not a
  guessed constant), `JoinRoomByNameRequestSchema` (`{name}` only — no code,
  no display name). `JoinRoomResponseSchema` is reused for the response
  (identical `{roomId}` shape).

**Web**

- `apps/web/src/pages/JoinRoomPage.tsx` — rewritten: titled "Join Room by
  Name," one room-name field, no code field, no free-text display-name
  field, shows the claimed username, gates the form (with a `/recovery`
  link) when the identity has none, submits to `joinRoomByName`, navigates
  to the authoritative `roomId`.
- `apps/web/src/pages/PublicLobbyPage.tsx` — the free-text "Your display
  name" input is gone. The per-room "Join" button now calls
  `api.joinRoomByName({name})` when the room has a friendly name, falling
  back to the legacy code-based route (still with the claimed username, not
  free text) for a legacy nameless room. Quick Join now sends the claimed
  username. Both are disabled, with a `/recovery` prompt, when the identity
  has no username.
- `apps/web/src/api/client.ts` — new `joinRoomByName()`.
- `apps/web/src/layout/RootLayout.tsx`, `apps/web/src/pages/HomePage.tsx` —
  nav link and Home button relabeled "Join by Code" → "Join Room by Name"
  (route `/rooms/join` unchanged).
- `apps/web/src/state/displayName.ts` — **deleted**. Its two consumers
  (`JoinRoomPage`, `PublicLobbyPage`) were the last ones; `CreateRoomPage`
  stopped using it in Phase 2. Confirmed unused across the whole `apps/web`
  source tree before removal.

**Tests** (see "Tests added" below)

No database migration in this phase — `rooms.name` and its unique index
already exist from Phase 2; Phase 3 only adds a new *query* against them.

## API and schema changes

| Endpoint | Change |
| --- | --- |
| `POST /api/rooms/join-by-name` (new) | Body `{name}`; requires session + claimed username; resolves the room by exact name; joins public or private rooms identically; response `{roomId}`. |
| `POST /api/rooms/quick-join` | Now requires a claimed username (`username_required` if missing); `displayName` stays in the wire schema for backward compatibility but is ignored — the stored username is used instead. |
| `POST /api/rooms/join` (code-based) | **Unchanged.** Still trusts the client-supplied `displayName`. Preserved verbatim for backward compatibility, rollback, deep links, older clients, and troubleshooting. |
| `GET /api/rooms/public` | Unchanged (Phase 2 already exposes `name`). |

`RoomNameSchema`'s max length (34) is derived, not guessed: `"public_".length
(7) + USERNAME_MAX_LENGTH (24) + " 50".length (3)` — the longest string the
Phase 2 allocator (`ROOM_NAME_CANDIDATE_WINDOW = 50`) can ever produce.

## Exact lookup behavior

`findRoomByName()` matches only `lower(name) = lower(input)`, with an
explicit `name IS NOT NULL` guard (redundant with SQL's NULL-comparison
semantics, but kept as documentation of the exclusion). No `LIKE`, no
prefix matching, no ranking, no candidate list — a single bounded
equality lookup that structurally cannot enumerate or suggest names. Both
public and private rooms resolve identically; **visibility is never a
lookup filter**, only a listing filter (`GET /api/rooms/public` still
filters on `visibility='public'`, unchanged).

Room-status, capacity, membership, and computer-room restrictions are all
preserved: a Play-vs-Computer room, a full room, and a non-`open` room are
all rejected exactly as they are for the legacy code-based route — the
*mechanism* is the same, only the *outward response* differs (see below).

## Private-room privacy tradeoff

This is the deliberate, user-approved reduction described in the amended
plan: a private room's only remaining protection is that its name isn't
listed anywhere (public lobby, search, autocomplete) — **not** that the
name is a secret. Anyone who already knows (or correctly guesses) an exact
private room name can join it. Two mitigations are implemented:

1. **Exclusion from every discovery surface.** `GET /api/rooms/public` and
   `findQuickJoinableRoom` already filter on `visibility='public'`
   (unchanged); nothing in this phase adds a private room to any listing,
   search, or suggestion path. No such path was created — join-by-name is a
   single exact-match endpoint, not a search endpoint.
2. **Uniform outward failure.** `join-by-name` returns the **identical**
   `404 not_found` response — same status, same message — whether the
   supplied name doesn't exist at all, or resolves to a room that exists
   but isn't joinable (full, not open, or computer-controlled). This
   collapses "no such room" and "found but unavailable" into one outward
   signal, so a guessed private-room name can't be distinguished from a
   typo by its response alone. Verified directly:
   `test/http/joinByName.test.ts` asserts the terminal-room, full-room, and
   computer-room responses are each byte-for-byte identical to the
   nonexistent-name response.

Existing session authentication and the unchanged `roomJoinLimit` (30/min)
rate limit are the only additional friction against guessing — per the
plan, no CAPTCHA, PIN, password, or new access-control mechanism was added.

## Transaction and concurrency behavior

- **`findRoomByName` runs outside any transaction** (a plain read), mirroring
  `findRoomByCode`'s existing pattern — the lookup itself needs no lock
  since it doesn't mutate anything.
- **The membership write is the critical section.** Unlike the legacy
  code-based route (which has no lock around its capacity check — a
  pre-existing gap, left untouched), `join-by-name`'s status+capacity
  recheck and member insert run inside a transaction that takes
  `SELECT ... FOR UPDATE` on the room row first (`lockRoomForUpdate`,
  mirroring `lockGameForUpdate`'s existing convention). This makes "is the
  room still open and under capacity" and "insert the member" atomic
  against a concurrent join for the same room.
- **Two simultaneous joins for the last seat**: verified directly with a
  real `Promise.all` of two `join-by-name` calls against a capacity-2 room
  with one seat free — exactly one returns `200`, the other `404`
  (collapsed into the generic "unavailable" response, consistent with the
  privacy design above), and the room never exceeds capacity.
- **Duplicate membership / reconnect**: the existing-membership check runs
  *before* the lock and status/capacity checks (mirroring the legacy
  route), so a player who is already seated always gets an idempotent `200`
  regardless of current room state — reconnect support is unaffected.
- **The legacy code-based route's own capacity check remains unlocked**,
  exactly as it was before this phase — Phase 3 did not touch its internals,
  only documented its now-secondary role.

## Legacy code-join compatibility

`rooms.code`, `generateRoomCode()`, the code's uniqueness constraint, the
`POST /api/rooms/join` route, and `WaitingRoomPage`'s "Room code: {code}"
line (added in Phase 2) are all **unchanged**. Room codes are now
documented — in code comments and here — as **compatibility/fallback
identifiers**: still fully functional, still internally authoritative
alongside the room's UUID, no longer the *primary* join credential a normal
user is asked for. A dedicated test (`"legacy join-by-code still works
unchanged"`) confirms the old route still accepts and trusts a client
`displayName`, unaffected by the new username-based paths.

## Web-flow changes

- **`/rooms/join`** (route URL unchanged) is now "Join Room by Name": one
  `Room name` field, no code field, no free-text display name. Shows
  "Joining as **{username}**," or a "claim a username first" message
  linking to `/recovery` if the identity has none. Submits to
  `joinRoomByName`, navigates to the returned `roomId`. Errors are
  displayed verbatim from the server, which never distinguishes "no such
  room" from "found but private."
- **Public lobby**: the shared "Your display name" input is gone; a
  "Joining as {username}" line replaces it. The per-room "Join" button and
  "Quick Join" button are both disabled (with the same claim-a-username
  prompt) when the identity has no username.
- **Nav/labels**: "Join by Code" → "Join Room by Name" in the top nav and on
  the Home page's button row. No other Home-page layout change.
- **Waiting room / room creation / Ready / Start**: untouched.

## Tests added

Server (**+23**, 216 total, up from 193):

- `apps/server/test/http/joinByName.test.ts` (new, 17 tests) — public-room
  join, private-room join, case-insensitivity, whitespace trimming,
  partial/prefix rejection, nonexistent name, terminal room ⇒ identical
  response to nonexistent, full room ⇒ identical response, computer-room
  rejection ⇒ identical response, `username_required`, stored-username
  display name (client override attempt ignored), reconnect idempotency,
  a real concurrent last-seat race, private-room absence from lobby/Quick
  Join while still joinable by name, legacy code-join regression, plus a
  small `describe` block for Quick Join's username behavior and its own
  `username_required` case.
- `apps/server/test/db/roomNames.test.ts` — new `findRoomByName` describe
  block (+6 tests): exact match, case-insensitivity, prefix/substring
  rejection, NULL-name exclusion, public/private resolving identically,
  nonexistent name.

Shared (**+6**, 38 total, up from 32): `RoomNameSchema` trimming/length
boundaries, `JoinRoomByNameRequestSchema` shape (name-only, unknown fields
stripped rather than accepted).

Web (**+13**, 78 total, up from 65): `PublicLobbyPage.test.tsx` (+6) —
mocks updated for `joinRoomByName`/`useAuth`, the `state/displayName.js`
mock removed, new assertions for username-based joining (listed-room Join
and Quick Join both use the claimed username), the removed free-text field,
and claim-gating; `apps/web/test/JoinRoomPage.test.tsx` (new, 7) covering
the title, claim-gating, absence of code/display-name fields, the shown
username, successful join + navigation, client-side blank-name validation,
and server-error display without navigation.

## Quality-gate results

Run from a clean local Postgres 16 (`tile-meld-db-1`, already migrated —
no new migration in this phase):

| Step | Result |
| --- | --- |
| `pnpm run format:check` | **Pass** |
| `pnpm run lint` | **Pass** — 0 issues |
| `pnpm run typecheck` (all 6 workspace projects, incl. `e2e`) | **Pass** |
| `pnpm run test` | **Pass — 483/483** (shared 38, engine 115, bot 36, web 78, server 216 — up from the Phase‑2 baseline of 441) |
| `pnpm run build` | **Pass** (web + server) |

## Chromium E2E results

The plan asked for: exact-name private-room join; exact-name public-room
join; public lobby join; Quick Join; two-player setup regression;
computer-opponent regression (since `e2e/tests/helpers.ts` changed). All
run and pass, plus two more specs run as regression given how central
`helpers.ts` is to the whole suite:

| Spec | Tests | Result | Covers |
| --- | --- | --- | --- |
| `two-player-smoke.spec.ts` | 3 | **3/3 pass** | exact-name **private**-room join (via `startTwoPlayerGame`), two-player setup regression |
| `public-lobby.spec.ts` | 1 | **1/1 pass** | exact-name **public**-room join, public lobby join, Quick Join |
| `vs-computer.spec.ts` | 2 | **2/2 pass** | computer-opponent regression (helpers.ts changed) |
| `accessibility.spec.ts` | 7 | **7/7 pass** | Join Room by Name page a11y (relabeled), Waiting Room a11y (Phase 2 flow, regression) |
| `multi-player.spec.ts` | 2 | **2/2 pass** | exact-name join for 3- and 4-player rooms via `startNPlayerGame`, regression |

17/17 pass. `e2e/tests/helpers.ts`'s `startTwoPlayerGame`/`startNPlayerGame`
now use `Join Room by Name` + the known room name instead of `Join by Code`
+ a filled code field, since `JoinRoomPage` no longer has a code field; both
still call the preserved `readRoomCode()` helper once each (against the
host's page) purely to keep exercising the "Room code:" compatibility line's
rendering as a lightweight regression check, even though the guest no
longer needs the code to join. Not run: the full five-project matrix
(Firefox/WebKit/mobile) — per the plan, that runs before merge, not during
implementation.

## Known limitations

- **The legacy code-based join route's capacity check remains unlocked**
  (a pre-existing race, not introduced or fixed by this phase — only the
  *new* join-by-name route got `lockRoomForUpdate`). Retrofitting the old
  route was judged out of scope ("preserve the existing... endpoint," not
  "upgrade" it) and risked masking what "preserved, unchanged" means for a
  compatibility path.
- **Enumeration is reduced, not eliminated.** Collapsing "nonexistent" and
  "unavailable" into one response, plus excluding private rooms from every
  listing, removes the *cheap* enumeration channels (browsing, searching,
  distinguishing found-but-full from not-found). It does not prevent a
  determined attacker from brute-forcing exact names against the rate
  limit — this is the explicitly accepted tradeoff of "unlisted, not
  secret," not a gap introduced by this implementation.
- **`ROOM_NAME_MAX_LENGTH` (34) is derived from the current allocator
  constants** (`USERNAME_MAX_LENGTH`, the `public_` prefix, and
  `ROOM_NAME_CANDIDATE_WINDOW`). If any of those ever change, this constant
  should be revisited — it is computed from them at the type level, not a
  hardcoded duplicate, so a change to `USERNAME_MAX_LENGTH` automatically
  propagates correctly.
- **No dedicated new E2E spec file for join-by-name error paths** (nonexistent
  name, private-room-via-name-only) — these are covered thoroughly at the
  HTTP/unit level (`joinByName.test.ts`); the Chromium E2E pass focuses on
  the golden-path flows explicitly requested, per the phase's own scope
  ("directly relevant... flows," not exhaustive UI coverage).

## Confirmation: Phase 4 and later phases not started

No work was done on automatic game start, room-lock/start transaction
changes for `/start`, Ready UI changes, Start Game button changes, rematch
changes, 48-hour retention, dashboard status styling, Home page hierarchy
redesign, or tabletop layout. `packages/engine` and `packages/bot` were not
modified. The Ready/Start endpoints and UI are exactly as Phase 2 left them.
