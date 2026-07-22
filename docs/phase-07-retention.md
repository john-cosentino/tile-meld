# Phase 7 — Fixed 48-Hour Completed-Game Retention

> Completion summary for Phase 7 of `docs/next-changes-implementation-plan.md`
> (Identity, Room Naming, Auto-Start, Retention & Layout), corrected to the
> **fixed 48-hour** window (superseding the plan document's original
> 4-hour proposal — see the amendment at the top of that plan). Implemented
> on branch `feature/identity-room-lifecycle-v2`, on top of Phase 1
> (`13b8323`), Phase 2 (`17cdb0a`), Phase 3 (`779f55d`), Phase 4 (`aae2c05`),
> Phase 5 (`d23e7ce`), and Phase 6 (`7e90449`). Later phases (tabletop
> layout/artwork) were **not started**.

## Goal

Add a bounded, flag-gated background sweep that permanently deletes
completed-game data — and any room left with no surviving game — from the
live PostgreSQL database once a game is exactly 48 hours past
`completed_at`. Ship it **disabled**: implemented, tested, documented, but
`ENABLE_RETENTION_SWEEP` stays `false` everywhere, including `render.yaml`.

## Files changed

**Server**

- `apps/server/src/db/migrations/0021_add_games_retention_index.ts` (new) —
  the retention candidate-query index (see "Migration and index details").
- `apps/server/src/env.ts` — `ENABLE_RETENTION_SWEEP` (boolean-style,
  default disabled) + `isRetentionSweepEnabled(env)`.
- `apps/server/src/db/repositories/retention.ts` (new) — the deletion
  primitives: `lockEligibleGameForUpdate`, `deleteGameSubtree`,
  `countGamesForRoom`, `maybeDeleteRoom`.
- `apps/server/src/game/retentionSweep.ts` (new) — `RETENTION_WINDOW_MS`
  (the fixed 48-hour constant) and `runRetentionSweepOnce`, the bounded
  orchestration pass.
- `apps/server/src/game/deadlineSweep.ts` — `startBackgroundSweeps` gained
  a second, independent, much slower interval that only exists at all when
  the flag is on.
- `apps/server/src/index.ts` — wires `onRetentionSwept` to a log line with
  aggregate counts only.
- `apps/server/src/game/roomStart.ts` — `manualRematchRoom` hardened
  against the new race retention introduces (a room deleted between the
  route's own existence check and the transaction's lock) — see
  "Concurrent-rematch behavior."
- `apps/server/src/http/routes/rooms.ts` — maps the new `not_found`
  rematch outcome to the same `404 "no such room"` response the route's
  earlier existence check already used.
- `apps/server/src/realtime/gateway.ts` — **bug fix, not new behavior**:
  the `game:join` socket handler's "not a seat holder" and "malformed
  payload" branches now also send the ack, not only the separate `error`
  broadcast. See "Known limitations" for why this was in scope for this
  phase specifically.

**Config/docs**

- `.env.example`, `render.yaml` — document `ENABLE_RETENTION_SWEEP`,
  explicitly `false`.
- `docs/deploy-render.md` — new "§10 Completed-game retention" operational
  section (staging verification steps, enable/disable, expected logging,
  rollback).

**Tests** (see "Tests added" below)

**No web source changes were needed** for the purged-game web-behavior
requirements — `TabletopPage.tsx`'s existing `notFound` state (from an
earlier phase) and `HomePage.tsx`'s existing 404-pruning (from Phase 2)
already satisfied every requirement once the gateway.ts ack bug above was
fixed. New web *tests* were added to prove this directly (see below).

## Actual game/room foreign-key deletion graph

Derived by inspecting every `.references(...)` / `.addForeignKeyConstraint(...)`
across `apps/server/src/db/migrations/*.ts` (none of it `ON DELETE CASCADE`
unless noted):

```
games.current_turn_id  -> turns.id                                  (reverse edge)
game_seats.game_id     -> games.id
turns.game_id          -> games.id
turns(game_id, seat_index)  -> game_seats(game_id, seat_index)      (composite)
racks(game_id, seat_index)  -> game_seats(game_id, seat_index)      (composite)
table_sets.game_id     -> games.id
game_events.game_id    -> games.id
idempotency_keys.game_id -> games.id                                 (nullable)
chat_messages.game_id  -> games.id

room_members.room_id   -> rooms.id                                   (CASCADE — the only cascade in the schema)
games.room_id          -> rooms.id
room_scores.room_id    -> rooms.id
game_seats.room_member_id -> room_members.id
rooms.host_room_member_id -> room_members.id
```

Consequences for deletion order (`deleteGameSubtree`,
`apps/server/src/db/repositories/retention.ts`):

1. `games.current_turn_id` must be cleared **before** `turns` rows can be
   deleted (the reverse edge — deleting a `turns` row while a `games` row
   still points at it violates the FK immediately, since these are
   separate `DELETE`/`UPDATE` statements, not one cascading operation).
2. `racks` and `turns` both depend on `game_seats` via a composite FK and
   must be deleted before it.
3. `table_sets`, `game_events`, `idempotency_keys`, `chat_messages` each
   depend on `games` directly and can be deleted in any order relative to
   each other and to steps 1–2, as long as all of them are gone before the
   final `games` row delete.
4. The `games` row itself is deleted last.

For room deletion (`maybeDeleteRoom`): `room_members` cascades
automatically. `room_scores` does **not** cascade and is deleted
explicitly, in the same transaction, before the room row. `games.room_id`
and `game_seats.room_member_id` are never actually hit by the room
delete in practice, because room deletion only ever happens after
confirming (under the room lock) that **zero** games remain for that
room — by that point nothing in the game subtree references the room or
its members anyway.

The one genuinely delicate edge — `rooms.host_room_member_id ->
room_members.id` (no cascade) pointing at a row that is *itself* about to
cascade-delete via `room_members.room_id -> rooms.id ON DELETE CASCADE`
when the room row is deleted — was **verified directly against real
Postgres**, not just reasoned about: `retentionSweep.test.ts`'s "deletes
the room, its members, and its scores when its only game expires" test
deletes a room whose `host_room_member_id` still points at a live member
row, and it succeeds without an FK violation. (Postgres resolves this
correctly because the FK check is evaluated at the end of the statement,
by which point the referencing `rooms` row is gone too, along with the
`room_members` row it pointed at.)

## Migration and index details

`0021_add_games_retention_index.ts` adds one **partial** index:

```sql
CREATE INDEX games_completed_retention_idx ON games (completed_at)
  WHERE status = 'completed';
```

Serves the sweep's candidate query directly —
`WHERE status = 'completed' AND completed_at <= ? ORDER BY completed_at ASC LIMIT ?`
— both the filter and the ascending scan order, and (being partial) is
smaller than an unconditional index since it excludes every `active` game.
No column changes, no data rewrite, no `Database` type changes (an
index-only migration changes no Kysely row shape). `down()` drops the
index; production migration policy remains forward-only regardless (a
conventional `down()` exists for local dev/testing only, per every prior
phase's migrations).

## Exact eligibility rule and boundary

A game is eligible for deletion only when **all** of:

- `games.status = 'completed'`
- `games.completed_at IS NOT NULL`
- `games.completed_at <= now - 48 hours`

`now` is always an explicit parameter (`RetentionSweepOptions.now`,
defaulting to the real current time only outside tests) — every test
injects a fixed instant, never a wall-clock sleep. Verified at the exact
boundary (`retentionSweep.test.ts`, "eligibility boundary" describe
block): a game completed 1 second short of 48 hours is retained; a game
completed at **exactly** 48 hours is deleted (the boundary is inclusive);
an active game (however old) and a completed game with a null
`completed_at` are both retained regardless of age. `created_at`,
`updated_at`, room activity time, turn deadlines, and browser-local time
are never consulted for eligibility — only `games.completed_at`.

## Fixed 48-hour constant

`RETENTION_WINDOW_MS = 48 * 60 * 60 * 1000` (`apps/server/src/game/
retentionSweep.ts`). A literal code constant, not read from any
environment variable — `env.test.ts` includes an explicit test asserting
`loadEnv` never surfaces a `RETENTION_COMPLETED_GAME_HOURS`-shaped value,
documenting (not merely by omission) that no such configuration point
exists. Changing the window is a code change and a new deploy, exactly
like any other product rule, never a per-deployment setting.

## Feature-flag behavior

`ENABLE_RETENTION_SWEEP` (`apps/server/src/env.ts`): `z.enum(["true",
"false"]).optional()`, interpreted by `isRetentionSweepEnabled(env)` as
`env.ENABLE_RETENTION_SWEEP === "true"` — **opposite polarity** from
`ENABLE_COMPUTER_OPPONENT` deliberately: absent, `"false"`, or any other
value all mean disabled; only the literal `"true"` enables it. An invalid
value (anything other than `"true"`/`"false"`, including an empty string)
is rejected by `loadEnv` the same way `ENABLE_COMPUTER_OPPONENT` already
rejects one — consistent with existing env-validation behavior, not a new
pattern. Ships `false` everywhere: `.env.example`, `render.yaml`, and the
schema's own default all agree.

## Sweep interval and batch behavior

`startBackgroundSweeps` (`apps/server/src/game/deadlineSweep.ts`) creates
the retention timer **only** when `isRetentionSweepEnabled(app.env)` is
true — when it's false, no timer is created at all (not a no-op tick), so
calling `startBackgroundSweeps` repeatedly with the flag off can never
accumulate stray retention timers. When enabled, it runs on its own
interval — `DEFAULT_RETENTION_SWEEP_INTERVAL_MS = 5 * 60 * 1000` (5
minutes; the phase's "approximately every 5-10 minutes" instruction),
entirely separate from the 15-second deadline/warning/bot-turn interval,
since retention has no latency requirement anywhere near that cadence. A
failed pass is caught and logged (`"retention sweep failed"`) exactly like
the other three sweeps' `.catch()` convention — it never crashes the
server or permanently stops future attempts; the next interval simply
tries again. Each pass processes at most `batchSize` games (default 25) —
bounded work per run, never scanning or holding a lock across the whole
table.

## Transaction and lock sequence

```
1. Plain (non-locking) SELECT: up to `batchSize` completed games with
   completed_at <= cutoff, oldest first (served by the migration-0021 index).
2. For EACH candidate, its OWN transaction:
   a. SELECT ... FOR UPDATE SKIP LOCKED, re-checking status/completed_at
      under the lock (never trusting step 1's read as final).
   b. If skipped (locked by another sweep, or no longer eligible): move on.
   c. Otherwise: deleteGameSubtree (bottom-up, see the FK graph above),
      commit.
3. For every DISTINCT room touched by a deletion in step 2, a SEPARATE
   room-locked transaction (maybeDeleteRoom):
   a. SELECT ... FOR UPDATE on the room row (lockRoomForUpdate's exact
      convention, reused).
   b. Re-query games for that room_id UNDER the lock.
   c. Delete room_scores + the room only if the count is zero.
```

No step ever holds a lock across more than one row's own transaction, and
the whole pass does bounded work. This mirrors `runDeadlineSweepOnce`'s
existing shape (plain candidate scan, then per-candidate `FOR UPDATE SKIP
LOCKED`) exactly, so it reads as "the same kind of sweep," not a new
pattern to learn.

## Concurrent-rematch behavior

The room lock in step 3 above is the **same** `lockRoomForUpdate` helper
(`apps/server/src/db/transactions.ts`) that `manualRematchRoom`
(`apps/server/src/game/roomStart.ts`, Phase 5) already takes before
dealing a new game — this is what makes the two race-safe against each
other without any new coordination mechanism:

- **Rematch commits first**: by the time retention's room-check
  transaction acquires the lock, the fresh game already exists, so the
  re-query under the lock finds a survivor and the room is retained. The
  expired old game is still deleted (it was handled in its own, earlier,
  per-game transaction — entirely independent of the room-level race).
  Verified directly: "a rematch that commits before retention's room
  check preserves the room and the new game."
- **Retention deletes the room first**: a rematch attempt racing in after
  calls `lockRoomForUpdate`, which throws (`NoResultError`) if the room
  row no longer exists. Before this phase, that exception was unhandled
  and would have surfaced as a raw `500`. **Fixed as part of this phase**
  (this race did not exist before retention could delete rooms):
  `manualRematchRoom` now catches `NoResultError` and returns a new
  `{kind: "not_found"}` outcome, which the HTTP route maps to the same
  `404 "no such room"` response its own earlier existence check already
  produces. No partial state is ever created — the transaction that would
  have dealt a new game simply never ran. Verified directly: "a rematch
  racing a room retention already deleted fails safely, with no partial
  state."
- **No deadlock**: both sides take exactly one lock (the room row) via the
  identical helper, in the identical order (room, then nothing else) —
  there is no second resource either side locks afterward that could
  invert.
- **The newly-created rematch game is never a retention candidate itself**
  — it starts `status = 'active'`, `completed_at = NULL`, which fails the
  eligibility check outright regardless of timing.

## Game-subtree deletion details

See "Actual game/room foreign-key deletion graph" above for the exact
order; `deleteGameSubtree` is a single function, called with the game
already locked by its caller, that performs all nine statements (the
`current_turn_id` clear plus eight deletes) and opens no transaction of
its own — every statement either all commits together (the caller's
transaction succeeds) or all rolls back together (any failure). Verified
directly against a fixture populated with representative rows in **every**
game-owned table (game_seats/racks/turns from a real deal, plus
table_sets/game_events/idempotency_keys/chat_messages inserted
explicitly): after one sweep pass, every one of those tables has zero rows
for that `gameId`, and the `games` row itself is gone — "deletes every row
in every game-owned table, leaving no orphans." A separate test proves the
rollback guarantee directly: calling `deleteGameSubtree` inside a
transaction that then deliberately throws leaves every row exactly as it
was.

## Room-deletion rule

A room is deleted **only** when, under a fresh room-lock recheck, zero
`games` rows (of any status) remain for it — not just zero *expired*
games, zero games at all, so an active game, a still-within-window
completed game, or a brand new rematch all equally prevent deletion. When
deleted: `room_members` (cascade) and `room_scores` (explicit delete, no
cascade) go with it, releasing the room's friendly name for reuse
immediately (verified directly: creating a new room for the same username
right after gets the un-suffixed base name back, not `"Name 1"`). If any
game survives, the room, its members, its scores, its friendly name, its
code, and every surviving game are all left completely untouched.

## Preserved player/session/push data

Retention never touches `players`, `sessions`, or `push_subscriptions` —
none of the deletion logic references any of these tables at all, by
construction (the FK graph above has no edge from the game/room subtree
into any of them in the deleting direction). Verified directly: a test
records a claimed username, an active session, and a push subscription
before running a sweep that deletes both the room and its expired game,
then confirms the player row (with its username and `recovery_hash`
unchanged), the session row (still unrevoked), and the push subscription
row all still exist afterward, byte-for-byte.

## Purged-game web behavior

**No web source changes were needed for `TabletopPage.tsx`/`useGame.ts`/
`HomePage.tsx` themselves** — every required behavior already existed from
earlier phases:

- `useGame.ts`'s `game:join` ack handler already treats `code === "not_found"`
  and `code === "forbidden"` identically, setting `notFound`.
- `TabletopPage.tsx` already renders a dedicated, generic "This game
  doesn't exist, or you're not seated in it." message with a "Back home"
  link the instant `notFound` is true — checked **before** the "Loading
  table…" fallback, so a purged game never gets stuck loading.
- `HomePage.tsx`'s room-list effect already prunes (via `removeRecentRoom`)
  any recent-room id whose `GET /api/rooms/:id` call now 404s or 403s,
  silently, with no error banner.

**One real bug was found and fixed** (`apps/server/src/realtime/
gateway.ts`, see "Files changed"): the `game:join` socket handler's "not a
seat holder in this game" branch — the exact path a purged game's now-gone
`game_seats` rows take — only ever emitted a separate `error` event and
never invoked the ack callback. Since `useGame.ts`'s `notFound` logic lives
entirely inside that ack callback, this meant a purged (or simply
nonexistent) game left the client on `game.notFound === false` forever
with `view` never set — the exact endless "Loading table…" spinner this
phase's instructions explicitly rule out. This was caught by the new
end-to-end Playwright test (`e2e/tests/purgedGame.spec.ts`), not by this
repository's own unit-level `useGame.test.tsx` mocks, which had (wrongly)
assumed the ack always fires and so could not have caught a bug in that
exact assumption by construction — the unit tests remain useful for
*useGame*'s own ack-handling logic, but this class of bug only a real
socket round trip against the real server could surface. Fixed by also
sending the ack (`{ok:false, code:"forbidden", message:...}`) alongside
the existing `error` broadcast, and the same fix applied to the sibling
"malformed payload" branch for consistency. A dedicated server-side test
(`gateway.test.ts`) now asserts both the `error` event and the ack fire
together for this case, against a real Socket.IO connection, not a mock.

No infinite reconnect loop exists: Socket.IO's transport-level
reconnection is unrelated to a `not_found`/`forbidden` **ack**, which
resolves the join attempt once, definitively — a reconnect would simply
re-run `game:join` once more and get the same clean answer, not retry in a
loop. `useGame.test.tsx` verifies `game:join` is emitted exactly once for
a `not_found` ack (no client-side retry either).

The Home dashboard's existing 404/403-pruning was re-verified with a test
framed specifically as "a room retention (or any other cause) has purged,"
covering both status codes.

## Deployment and rollback documentation

See `docs/deploy-render.md` §10 "Completed-game retention" for the full
staging-verification checklist, how to enable/disable the flag, expected
sweep log lines, and the rollback caveat (disabling the flag stops
*future* deletion only; it cannot undo deletions already committed to the
live database — only your Postgres provider's own backup/PITR window,
already documented in `docs/backup-restore.md` as 3 days on Render's
Hobby plan / 7 days on Pro or higher, can restore already-deleted rows,
and only within that window).

## Tests added

Server (**+46 net**, 264 → 310):

- `apps/server/test/game/retentionSweep.test.ts` (new, 24 tests) — every
  eligibility-boundary case; complete-subtree deletion across every table
  plus the `current_turn_id` reverse-FK clear plus a rollback-safety proof;
  room lifecycle (sole-game deletion, name reuse, a newer completed game
  survives, a newer active rematch survives, multiple expired games across
  bounded batches, public/private/Play-vs-Computer parity); preserved
  players/sessions/push subscriptions; an empty sweep, running the sweep
  twice, two concurrent sweeps, `SKIP LOCKED` against a genuinely
  held lock, the batch-size bound, both directions of the concurrent-
  rematch race, and the room-recheck-prevents-deletion case.
- `apps/server/test/game/deadlineSweep.test.ts` — new "startBackgroundSweeps
  -- retention scheduling" describe block (2 tests): no retention timer
  (and no deletion) is ever created with the flag off; a retention timer
  is created and actually deletes an eligible game with the flag on.
- `apps/server/test/env.test.ts` — new describe block (6 tests):
  default-disabled, empty-string rejected (matching `ENABLE_COMPUTER_
  OPPONENT`'s existing convention), explicit `"false"`, explicit `"true"`,
  invalid values rejected, and the "no hours-valued env var exists"
  documentation test.
- `apps/server/test/db/migrations.test.ts` — 2 new tests: the partial
  index exists with the expected definition; migration 0021 changed no
  `games` columns (index-only).
- `apps/server/test/realtime/gateway.test.ts` — 1 new test proving the
  `game:join` ack fix, against a real Socket.IO connection.

Web (**+15 net**):

- `apps/web/test/useGame.test.tsx` (new, 5 tests) — `notFound` set for
  both `forbidden` and `not_found` acks; an unrelated error code leaves
  `notFound` false and sets the recoverable banner instead; `game:join` is
  emitted exactly once (no retry loop); a still-existing game loads
  normally.
- `apps/web/test/TabletopPurgedGame.test.tsx` (new, 5 tests) — the clear
  unavailable message instead of the loading spinner; a working Home link;
  no live table/rack/action controls render; the message never reveals
  *why* the game is gone; the ordinary loading state still shows correctly
  while genuinely waiting (i.e. this phase didn't regress that).
- `apps/web/test/HomePage.test.tsx` — 2 new tests: a 404'd recent room is
  pruned silently (no error banner) while a still-good room renders
  normally; a 403 is pruned the same way.

E2E: `e2e/tests/purgedGame.spec.ts` (new) — direct navigation to a
nonexistent/unavailable game route (no backdoor needed: a never-issued
gameId fails the identical `findGameSeatForPlayer` check a purged game's
gone `game_seats` would) shows the clear message, a working Home link, no
lingering "Loading table…", and passes a 0-serious-violations axe scan.

## Quality-gate results

Run from the existing local Postgres 16 (`tile-meld-db-1`, migrated
through `0021`):

| Step | Result |
| --- | --- |
| `pnpm run format:check` | **Pass** |
| `pnpm run lint` | **Pass** — 0 issues |
| `pnpm run typecheck` (all 6 workspace projects, incl. `e2e`) | **Pass** |
| `pnpm run test` | **Pass** — shared 38, engine 115, bot 36, server 310 (↑ from 264), web 138 (↑ from 126) — **637/637** |
| `pnpm run build` | **Pass** (web + server) |

## Chromium E2E results

| Spec | Result | Covers |
| --- | --- | --- |
| `purgedGame.spec.ts` (new) | **1/1 pass** | direct navigation to an unavailable game — clear message, Home link, no stuck spinner, clean a11y scan |
| `dashboard.spec.ts` | **7/7 pass** | Home dashboard regression, unaffected by this phase |
| `rematch.spec.ts` | **2/2 pass** | one-click rematch regression (human-vs-human and Play vs Computer), including the hardened `manualRematchRoom` |
| `vs-computer.spec.ts` | **2/2 pass** | Play vs Computer regression |
| `reconnect-recovery.spec.ts` | **2/2 pass** | reconnect/recovery regression |
| `full-lifecycle.spec.ts` | **1/1 pass** | full room/game lifecycle regression, including the older Waiting-Room rematch path |
| `accessibility.spec.ts` | **7/7 pass** | axe scans across every existing screen, 0 serious/critical violations |
| `multi-player.spec.ts` | **3/3 pass** | 3-/4-player auto-start + manual early-start regression |
| `two-player-smoke.spec.ts` | **3/3 pass** | core 2-player round-trip regression |

28/28 pass, retention disabled throughout (the default/shipping
configuration) — exactly as instructed, no production configuration was
manipulated to exercise retention itself during E2E; the 48-hour behavior
is verified exclusively by the controlled-time server integration tests
above. Not run: the full five-project matrix (Firefox/WebKit/mobile) — per
the plan, that runs before merge, not during implementation.

## Known limitations

- **The `game:join` ack fix has a wider blast radius than "just
  retention"** — it also fixes the (pre-existing, latent) case of
  navigating to any gameId a player was never seated in at all, and a
  malformed `game:join` payload. Both were silent hangs before this phase;
  both are now clean, immediate `notFound` states. This was judged
  in-scope rather than "unrelated refactoring" because it is the exact
  mechanism this phase's own required web behavior depends on — Phase 7
  cannot claim "no endless loading spinner for a purged game" while this
  bug remains, since a purged game hits precisely this code path.
- **No database migration adds a `deleted_at`/soft-delete marker** —
  deletion is hard and immediate once a game is swept, per the explicit
  scope exclusion against soft-delete columns. There is no "trash" to
  recover from within the app itself; only a provider-level backup restore
  can, within its own window.
- **No admin or user-facing deletion UI, no export/download of old games,
  no notification about upcoming deletion** — all explicitly out of scope
  and not built.
- **The retention interval (5 minutes) means a game can sit up to ~5
  minutes past the exact 48-hour mark before being swept** — this is
  inherent to polling on an interval rather than a precise scheduled
  timer, and is an accepted, deliberately "restrained" cadence per the
  phase's own instruction; it does not affect the eligibility rule itself,
  only how promptly an eligible game is picked up.
- **`findQuickJoinableRoom` and other room-selection reads remain
  unlocked** (pre-existing, Phase 3/4 characteristic, unchanged here) — a
  vanishingly rare race where a candidate room is deleted by retention
  between an unlocked selection read and a subsequent join attempt would
  surface as the join's own existing "no such room"/"room is full"
  handling, not a new failure mode this phase introduces.

## Confirmation: retention remains OFF

`ENABLE_RETENTION_SWEEP` is `false` in `.env.example`'s documented default,
explicitly `"false"` in `render.yaml` (not merely absent), and
`isRetentionSweepEnabled` treats every value other than the literal
`"true"` as disabled. **This phase does not enable retention in any real
deployment.** Enabling it is a distinct, deliberate, future action
requiring the staging verification steps in `docs/deploy-render.md` §10
first.

## Confirmation: Phase 8 and later phases not started

No work was done on tabletop information-hierarchy changes, artwork
placement, the retro Mahjong/Konami theme, tile redesign, room search/
autocomplete, login/social accounts, or lifetime statistics/rankings.
`packages/engine` and `packages/bot` were not modified. Ready/Start were
not removed; rematch business rules (Phase 5) are unchanged aside from the
narrow, necessary hardening described in "Concurrent-rematch behavior"
above; the Phase 6 dashboard is unchanged.
