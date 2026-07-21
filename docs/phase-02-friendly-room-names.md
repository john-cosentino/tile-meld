# Phase 2 — Friendly Room Names

> Completion summary for Phase 2 of `docs/next-changes-implementation-plan.md`
> (Identity, Room Naming, Auto-Start, Retention & Layout). Implemented on
> branch `feature/identity-room-lifecycle-v2`, on top of Phase 1 (`13b8323`,
> global unique human usernames). Later phases (join-by-name, auto-start,
> Ready/Start removal, rematch changes, retention, dashboard/tabletop
> redesign) were **not started**.

## Goal

Add stable, human-readable room names derived from the room creator's
globally unique username, and require a claimed username to create a room.
Join-by-name, auto-start, retention, rematch, and layout are out of scope
for this phase.

## Files changed

**Server**

- `apps/server/src/db/migrations/0020_add_room_names.ts` (new) — additive
  migration: `rooms.name`, one partial unique index.
- `apps/server/src/db/types.ts` — `RoomsTable` gains `name: string | null`.
- `apps/server/src/http/errors.ts` — new `username_required` error code
  (409).
- `apps/server/src/db/repositories/rooms.ts` — room-name allocation
  (`nextCandidateRoomName`, `roomNameBase`, `isRoomNameUniqueViolation`) and
  an insert-and-retry loop wrapped around both `createRoom` and
  `createComputerRoom`'s existing transactions; `CreateRoomParams.creatorDisplayName`
  → `creatorUsername`; `createComputerRoom`'s `humanDisplayName` →
  `humanUsername`. Both functions now use the resolved username,
  unconditionally, as the host's `room_members.display_name`.
- `apps/server/src/http/routes/rooms.ts` — `POST /api/rooms` and `POST
  /api/rooms/vs-computer` now look up the caller's `players.username` and
  reject with `username_required` if null, before creating anything; both
  responses, `GET /api/rooms/:id`, and `GET /api/rooms/public` now include
  `name`.

**Shared**

- `packages/shared/src/schemas/rooms.ts` — `name: z.string().nullable()`
  added to `CreateRoomResponseSchema`, `VsComputerResponseSchema`,
  `PublicRoomSummarySchema`, `GetRoomResponseSchema`. Request schemas
  (`CreateRoomRequestSchema`, `VsComputerRequestSchema`) are unchanged —
  `displayName` stays for wire backward compatibility but is no longer
  trusted server-side for the host's name.

**Web**

- `apps/web/src/state/roomName.ts` (new) — `formatRoomName(room)`: `room.name
  ?? \`Room ${room.code}\``, the single place every page renders a room's
  identity from.
- `apps/web/src/pages/HomePage.tsx` — recent-rooms cards show
  `formatRoomName`; "Play vs Computer" now sends the claimed username (not a
  free-text display name) and is disabled with a "claim a username" prompt
  (linking to `/recovery`) when the identity has none.
- `apps/web/src/pages/CreateRoomPage.tsx` — the "Your display name" input is
  gone (the field was becoming inert — see below); shows "Creating as
  {username}" and submits `displayName: username` for wire compatibility.
  Renders a "claim a username first" message instead of the form when the
  identity has none.
- `apps/web/src/pages/PublicLobbyPage.tsx` — lobby rows show
  `formatRoomName`. Unchanged otherwise (still a joiner flow).
- `apps/web/src/pages/WaitingRoomPage.tsx` — heading shows `formatRoomName`;
  a new, always-present "Room code: {code}" line was added underneath it,
  since the heading can no longer be relied on to contain the code (see
  "E2E ripple effects" below).

**Tests** (see full breakdown in "Tests added")

## Migration details

`0020_add_room_names.ts`, purely additive:

- `rooms.name text NULL`.
- `rooms_name_lower_uk`: **partial unique index** on `lower(name)` `WHERE
  status IN ('open', 'in_game', 'between_games')` — the actual concurrency
  arbiter. Terminal (`closed`/`abandoned`) rooms keep their `name` value
  forever (immutable, per the plan) but no longer reserve the slot, so a
  later room may reuse the same numbered name (DR‑6). Private `John` and
  public `public_John` never collide with each other, or with a *different*
  creator's `John`, because the `public_` prefix and the globally-unique
  username are both baked into the string itself — no additional
  visibility- or creator-scoping column was needed in the index.

`down()` drops the index and the column unconditionally — like migration
`0019`, nothing else in the schema references `rooms.name`, so (unlike
migration `0018`'s computer-player seed) there is no dependent data for it
to protect. Verified by the existing `migrations.test.ts` "supports one
down step and re-applying up again" test, which now exercises this
migration as the latest one. Per `D-MIGRATE`, production migrations remain
forward-only regardless.

No backfill: existing rooms keep `name = NULL` and render as `Room {code}`
indefinitely (until deleted by a future retention phase).

## Room-name allocation algorithm

For a creator with username `U` and visibility `V`:

1. `base = V === "public" ? \`public_${U}\` : U`.
2. **Fast-path hint** (`nextCandidateRoomName`): build 51 candidate strings
   (`base`, `base 1`, … `base 50`), `SELECT name FROM rooms WHERE status IN
   (open, in_game, between_games) AND lower(name) IN (<candidates,
   lowercased>)`, then return the smallest-index candidate not present in
   that result. This is a single query scoped to the exact candidates (not
   a table scan or a `LIKE`), and it is *only* a hint — see below.
3. **Insert-and-retry** (the actual create): the candidate name is used in
   the room `INSERT` inside the existing atomic transaction (insert room →
   insert host member → point `host_room_member_id` at it). If that insert
   raises Postgres `23505` on constraint `rooms_name_lower_uk`
   specifically (checked via the driver's `err.constraint`, so an unrelated
   violation — e.g. the room `code`'s own unique constraint — is never
   misattributed and is rethrown immediately), the **whole transaction
   attempt is discarded** (Kysely rolls back automatically) and retried
   from step 2 with fresh state, up to 5 attempts.

This means the database's partial unique index is the final arbiter of
uniqueness, not the SELECT — the SELECT only minimizes retries in the
common (non-racing) case. A bounded 50-candidate window and bounded 5-retry
loop are both used, per the plan's "reasonable bounded retry strategy"
requirement; exhausting either raises a clear error rather than looping
forever.

`createComputerRoom` follows the identical algorithm with `visibility`
hardcoded to `"private"` (Play vs Computer rooms are always private), so a
human's vs-computer room and their own manually-created private room share
the same numbering sequence (a deliberate consequence of both deriving from
the same username-based base name, not a special case).

## Transaction and concurrency behavior

- **Atomicity preserved**: room creation is still insert-room →
  insert-host-member → update-host-pointer, all inside one
  `db.transaction().execute(...)` call, exactly as before Phase 2 — the
  name allocation is computed *inside* that same transaction (using the
  transaction handle, not the outer connection), so a name-conflict retry
  discards the entire attempt, never leaving a partially-built room or an
  orphaned member row.
- **Concurrent creations by the same identity** (e.g. a double-click, or two
  browser tabs) racing for the same base name: exactly one wins the
  un-suffixed name; the other's insert 23505s on the partial index, is
  caught, and retries with fresh state — landing on the next free suffix.
  Verified directly with a real `Promise.all([createRoom(...),
  createRoom(...)])` against the same username/visibility (see
  `roomNames.test.ts`).
- **Terminal-room slot release**: no explicit cleanup step is needed — the
  partial index's `WHERE status IN (...)` predicate means a room that
  transitions to `abandoned`/`closed` simply stops being counted, both by
  the SELECT hint and by the index itself, the moment its `status` column
  changes. Verified by flipping a room to `abandoned` mid-test and
  confirming the next room reclaims its exact name.
- **Username-required precondition**: checked (`findPlayerById` +
  `username !== null`) *before* the transaction starts, so a missing
  username never opens a transaction at all — trivially "no partial room or
  membership row," verified directly (room/member table counts stay at
  zero after a rejected attempt).

## API and schema changes

| Endpoint | Change |
| --- | --- |
| `POST /api/rooms` | Rejects with `409 { error: "username_required" }` if the caller has no claimed username. Response gains `name`. `displayName` is still accepted (wire compat) but never used for the host's display name. |
| `POST /api/rooms/vs-computer` | Same `username_required` precondition (checked after the existing feature-flag check, preserving the flag's own 404-when-disabled test). Response gains `name`. |
| `GET /api/rooms/:id` | Response gains `name`. |
| `GET /api/rooms/public` | Each room summary gains `name`. |
| `POST /api/rooms/join`, `POST /api/rooms/quick-join` | **Unchanged** — no username requirement (joining, not creating), no `name` field added (their responses only ever returned `{roomId}` and still do). |

`name` is `nullable`, never `optional`, everywhere it appears — a
just-created room always has one; a legacy room's is `null`, and every
response shape says so explicitly rather than omitting the key.

## Legacy compatibility

- `rooms.name` is nullable; no backfill. A legacy room's `name` stays `null`
  forever unless a future phase decides otherwise.
- Every place a room's identity is displayed (`HomePage`, `PublicLobbyPage`,
  `WaitingRoomPage`) goes through the single `formatRoomName()` helper,
  which falls back to `Room {code}` — the exact string every room showed
  before Phase 2, so a legacy room's presentation is unchanged.
- `rooms.id` (UUID) and `rooms.code` remain the authoritative internal
  identifiers; `name` is display + (future) public-lookup only, never used
  as a key anywhere.

## Web/UX notes beyond the plan's letter

Two changes were necessary consequences of "use the claimed username, not a
caller-supplied display name" that the plan's text didn't spell out but its
intent required:

1. **`CreateRoomPage`'s "Your display name" field was removed**, not just
   ignored. Once the server stopped reading it, leaving the input visible
   would have silently done nothing when filled in — worse than removing
   it. The page now shows "Creating as {username}" instead, and gates the
   whole form behind having a username (with a link to `/recovery`), per
   the plan's "reject creation... provide a minimal web message directing
   the user to the existing Recovery page" instruction, applied
   proactively (no failed round-trip needed) rather than only reactively.
   `HomePage`'s "Play vs Computer" button got the same proactive gate for
   the same reason (it also creates a room directly).
2. **`WaitingRoomPage` gained a standalone "Room code: {code}" line.**
   Before Phase 2, the heading was unconditionally `Room {code}`, which
   doubled as the only place the invite code was shown. Once the heading
   could show a friendly name instead, the code would have disappeared
   from the UI entirely — breaking the ability to actually share a private
   room's invite code. This is a minimal, necessary preservation of
   existing functionality, not new scope.

Both are still within "the smallest reliable design" spirit: no new pages,
no layout redesign, no route changes.

## Tests added

Server (**+37**, 156→193):

- `apps/server/test/db/roomNames.test.ts` (new, 12 tests) — first-room
  naming, numbering (`John`, `John 1`, `John 2`), `public_` prefix and
  independent numbering, private/public namespace separation, Play vs
  Computer naming, terminal-room slot reuse (both `abandoned` and
  `closed`), a real concurrent-creation race, migration column, and two
  raw-SQL constraint tests (case-variant collision rejected among
  non-terminal rooms; the same name accepted once the first room is
  terminal).
- `apps/server/test/http/rooms.test.ts` — new tests for public/private
  naming end-to-end, numbering via the HTTP endpoint, `username_required`
  with a partial-row check; two existing tests (duplicate-display-name
  rejection, per-room-not-global uniqueness) rewritten since a host's
  display name can no longer collide by construction (usernames are
  globally unique) — rewritten to prove the same "per-room uniqueness"
  claim via joiners instead, which remains genuinely true. `newPlayer` now
  claims a username automatically (every room-creating test needs one).
- `apps/server/test/http/vsComputer.test.ts` — `username_required` test;
  the existing creation test now asserts the room/host name comes from the
  username, not the (deliberately different) `displayName` payload value.
- `apps/server/test/http/games.test.ts`, `chat.test.ts`,
  `identity.test.ts` — `newPlayer`/setup helpers updated to claim a
  username before creating a room (these files use room creation only as
  setup for game/chat/auth tests, not as their subject).
- `apps/server/test/db/computer-player.test.ts`, `repositories.test.ts`,
  `game-round-trip.test.ts`, `apps/server/test/setup/game-fixture.ts` —
  mechanical `creatorDisplayName` → `creatorUsername` rename (these call
  the repository directly, bypassing HTTP, so no username-claim ceremony
  was needed — only the parameter name changed).

Shared (**+3**, 29→32): `CreateRoomResponseSchema`/`PublicRoomSummarySchema`/
`GetRoomResponseSchema` accept/require the new `name` field correctly
(present-nullable, not optional).

Web (**+13**, 52→65):

- `apps/web/test/CreateRoomPage.test.tsx` (new) — claim-gated message vs.
  form, "Creating as {username}", submits with `displayName: username`,
  surfaces a server error.
- `apps/web/test/PublicLobbyPage.test.tsx` (new) — friendly name shown,
  legacy `Room {code}` fallback, empty state.
- `apps/web/test/HomePage.test.tsx` — friendly name / legacy fallback in
  the recent-rooms list; Play vs Computer disabled + prompt when no
  username; existing tests updated for the new `useAuth` dependency.
- `apps/web/test/WaitingRoomPage.test.tsx` — friendly-name heading and
  legacy fallback.

## Quality-gate results

Run from a clean local Postgres 16 (`tile-meld-db-1`, migrated to latest
including `0020`):

| Step | Result |
| --- | --- |
| `pnpm run format:check` | **Pass** |
| `pnpm run lint` | **Pass** — 0 issues |
| `pnpm run typecheck` (all 6 workspace projects, including `e2e`) | **Pass** |
| `pnpm run test` | **Pass — 441/441** (shared 32, engine 115, bot 36, web 65, server 193 — up from the Phase‑1 baseline of 409) |
| `pnpm run build` | **Pass** (web + server) |

## E2E results (Chromium)

The plan asked for "private room creation; public room creation/lobby; Play
vs Computer creation; legacy room fallback if practical." All three
explicitly-required flows pass, plus four more specs run as regression
checks because `e2e/tests/helpers.ts`'s `startTwoPlayerGame`/
`startNPlayerGame` — used by most of the suite — needed real, non-mechanical
changes (see "E2E ripple effects" below), so verifying beyond the minimum
was warranted before calling this phase done:

| Spec | Tests | Result |
| --- | --- | --- |
| `two-player-smoke.spec.ts` (private room creation) | 3 | **3/3 pass** |
| `public-lobby.spec.ts` (public room creation/lobby, Quick Join) | 1 | **1/1 pass** |
| `vs-computer.spec.ts` (Play vs Computer creation) | 2 | **2/2 pass** |
| `accessibility.spec.ts` (incl. the new username-claim form on Recovery, since a fresh identity has none) | 7 | **7/7 pass** |
| `multi-player.spec.ts` (3- and 4-player rooms, `startNPlayerGame`) | 2 | **2/2 pass** |
| `reconnect-recovery.spec.ts` (recovery flow, untouched by this phase but exercises `startTwoPlayerGame`) | 2 | **2/2 pass** |

**Legacy room fallback** was not exercised end-to-end via Playwright — doing
so would require seeding a `name IS NULL` room directly into the dev
database before the run (no UI path creates one anymore), which didn't seem
worth the added test-infra complexity given the fallback is already
covered thoroughly at the unit level (`HomePage.test.tsx`,
`PublicLobbyPage.test.tsx`, `WaitingRoomPage.test.tsx`,
`roomNames.test.ts`'s "allows multiple legacy rooms with a null name"). Not
run: the full five-project matrix (Firefox/WebKit/mobile) — per the plan,
that runs before merge, not during implementation.

### E2E ripple effects (why so many files changed)

Making the room-creation flow require a username, and making the
`WaitingRoomPage` heading show a friendly name instead of always `Room
{code}`, broke two assumptions nearly every E2E spec depended on
transitively through `helpers.ts`:

1. Every spec that creates a room needs an identity with a claimed
   username first. `helpers.ts` gained `claimUsername(page, base)`, which
   drives the real Recovery-page claim form and returns the actual claimed
   name (suffixed for uniqueness — see next point) for later assertions.
2. Room-code parsing could no longer read the heading
   (`/^Room /` → `.replace("Room ", "")`) since the heading may now be a
   friendly name. `WaitingRoomPage` gained the dedicated "Room code:" line
   (see above), and `helpers.ts` gained `readRoomCode(page)` to read it.
3. **Usernames are globally unique, and the E2E matrix runs serially
   against one long-lived, never-truncated dev database** (`workers: 1`,
   per `playwright.config.ts`) — unlike the unit-test suite, which
   truncates between every test. A fixed literal username like `"Host"`
   would collide with an identical claim from an earlier spec in the same
   run. `helpers.ts`'s `claimUsername` therefore suffixes every base name
   with a random 6-character tag (`uniqueUsername`), guaranteeing no
   cross-spec collision without needing any shared counter or DB reset.

`helpers.ts`, `public-lobby.spec.ts`, `vs-computer.spec.ts`, and
`accessibility.spec.ts` were updated for these three points;
`reconnect-recovery.spec.ts`, `multi-player.spec.ts`, and
`two-player-smoke.spec.ts` needed no direct edits (they only consume the
now-fixed `startTwoPlayerGame`/`startNPlayerGame`).

## Known limitations

- **Numbering is capped at a 50-suffix search window** per creation
  attempt (`ROOM_NAME_CANDIDATE_WINDOW`). No realistic user will have 50
  simultaneously non-terminal rooms of the same visibility, but if that
  window were ever exhausted, `createRoom`/`createComputerRoom` would throw
  a plain `Error` (500), not a structured client error — acceptable for an
  effectively-unreachable edge case, but worth a structured error code if
  this phase's assumptions ever change.
- **`CreateRoomRequestSchema`/`VsComputerRequestSchema` still require
  `displayName`** on the wire for backward compatibility, even though the
  server ignores it for room creation now. This is exactly what the plan
  asked for ("existing request schemas may continue accepting displayName
  temporarily"); a future phase can drop the field once no client still
  sends it.
- **The join flow is entirely untouched.** A joiner still picks their own
  free-text per-room display name, unrelated to their username (if any).
  This is intentional (Phase 3 scope, per the plan), not an oversight.
- **No dedicated E2E coverage for the legacy `Room {code}` fallback** — see
  the E2E section above for why, and where it's covered instead.
- **Room-name numbering only considers the *global* non-terminal pool**,
  scoped implicitly by the creator's own username being baked into the
  base string — there is no separate `created_by`/owner column on `rooms`.
  This is deliberate (see the migration's doc comment) and matches the
  plan's design, but means a room's "creator" is only ever recoverable by
  reading its immutable `name`, not a dedicated field — acceptable since
  nothing in this phase (or the plan) needs to query "all rooms created by
  X" directly.

## Confirmation: Phase 3 and later phases not started

No work was done on join-by-name, automatic game start, Ready/Start UI
changes, rematch behavior, 48-hour retention, dashboard redesign, or
tabletop layout. `packages/engine` and `packages/bot` were not modified.
The join flow (`JoinRoomPage`, `PublicLobbyPage`'s Quick Join, `POST
/api/rooms/join`, `POST /api/rooms/quick-join`) is unchanged except for
displaying the new `name` field where a room's identity is already shown.
All schema changes are additive and backward-compatible.
