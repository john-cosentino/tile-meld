# Phase 1 — Global Username Identity

> Completion summary for Phase 1 of `docs/next-changes-implementation-plan.md`
> (Identity, Room Naming, Auto-Start, Retention & Layout). Implemented on
> branch `feature/identity-room-lifecycle-v2`. Later phases (room naming,
> join-by-name, auto-start, rematch UI, retention, dashboard/tabletop
> redesign) were **not started**.

## Goal

Add a safe, globally unique, claim-once username to existing human recovery
identities without disrupting current gameplay or room flows. Room names,
joining, auto-start, retention, and layout are out of scope for this phase.

## Files changed

**Server**

- `apps/server/src/db/migrations/0019_add_player_usernames.ts` (new) —
  additive migration: `players.username`, `players.username_canonical`, two
  CHECK constraints, one partial unique index.
- `apps/server/src/db/types.ts` — `PlayersTable` gains `username` /
  `username_canonical` (`string | null`).
- `apps/server/src/db/repositories/players.ts` — new `claimUsername()` with
  a typed outcome union (`claimed` / `already_claimed_same` /
  `already_claimed_different` / `not_human` / `taken`); local
  `isUniqueViolation()` helper (mirrors the existing pattern in
  `http/routes/rooms.ts`, not shared/exported to avoid touching an
  out-of-scope file).
- `apps/server/src/http/routes/identity.ts` — new `POST
  /api/identity/username`; `POST /api/identity` and `POST
  /api/session/recover` responses now include `username`.
- `apps/server/src/http/rateLimits.ts` — new `usernameClaimLimit` (10/min,
  matches the existing `identityCreateLimit`/`recoveryLimit` tightness for a
  security-sensitive, low-frequency action).

**Shared**

- `packages/shared/src/schemas/identity.ts` — `UsernameSchema`,
  `canonicalizeUsername()`, `isReservedUsername()`,
  `ClaimUsernameRequestSchema`/`ClaimUsernameResponseSchema`; `username:
  string | null` added to `CreateIdentityResponseSchema` and
  `RecoverSessionResponseSchema`.

**Web**

- `apps/web/src/api/client.ts` — `api.claimUsername(username)`.
- `apps/web/src/auth/AuthProvider.tsx` — `AuthState` (ready) gains
  `username: string | null`; new `claimUsername()` context action. Also
  fixes a pre-existing latent bug where the bootstrap effect discarded
  `/api/session/recover`'s response entirely (it now reads `username` from
  it); and narrows `writeStoredIdentity` to only persist
  `{playerId, recoverySecret}` to `localStorage`, not the full API response.
- `apps/web/src/pages/RecoveryPage.tsx` — new minimal `UsernameSection`:
  claim form when unclaimed, read-only display once claimed.

**Tests**

- `packages/shared/test/schemas.test.ts` — `UsernameSchema`,
  `canonicalizeUsername`, `isReservedUsername` (+14 tests).
- `apps/server/test/db/username.test.ts` (new) — `claimUsername()` repository
  behavior + migration/CHECK/index constraints (11 tests).
- `apps/server/test/http/username.test.ts` (new) — `POST
  /api/identity/username` endpoint behavior, including a real concurrent
  claim (11 tests).
- `apps/server/test/http/identity.test.ts` — one existing exact-equality
  assertion updated for the new `username` field.
- `apps/web/test/AuthProvider.test.tsx` — mocks/`Probe` updated for
  `state.username`; new `claimUsername` test (+1 test).
- `apps/web/test/RecoveryPage.test.tsx` (new) — claim form, success,
  client-side validation error, server error, already-claimed read-only
  view, and recovery retention (6 tests).

No changes to `packages/engine` or `packages/bot`.

## Migration details

`0019_add_player_usernames.ts`, purely additive:

- `players.username text NULL`, `players.username_canonical text NULL`.
- `players_username_pair_ck`: both columns null, or both populated together
  — never just one.
- `players_username_human_only_ck`: `kind = 'human' OR username_canonical IS
  NULL` — a computer identity can never have a username (in addition to the
  application-level guard in `claimUsername()`).
- `players_username_canonical_human_uk`: **partial unique index** on
  `username_canonical` `WHERE kind = 'human'` — the actual concurrency
  arbiter for global uniqueness.

Unlike migration `0018` (the computer-opponent model), nothing else in the
schema references these two columns, so there is no dependent data for
`down()` to protect — it drops the index, both CHECK constraints, and both
columns unconditionally. Verified by the existing `migrations.test.ts`
"supports one down step and re-applying up again" test, which now exercises
this migration as the latest one. Per `D-MIGRATE`, production migrations
remain forward-only regardless; `down()` is for local/test use only.

No backfill: existing/legacy human identities keep `username = NULL` and
claim lazily. The (single, fixed-id) computer identity is structurally
excluded from the human namespace by the CHECK constraint and by the
`kind = 'human'` filter in `claimUsername()`'s own `UPDATE ... WHERE`.

## API behavior

**`POST /api/identity/username`** (new, session-authenticated,
`usernameClaimLimit` = 10/min)

Request: `{ "username": string }` (`ClaimUsernameRequestSchema`).
Response: `200 { "username": string }` (returns the entered casing, not the
canonical form).

| Condition | Result |
| --- | --- |
| Valid, unclaimed identity, name available | `200 { username }` |
| Reserved name (`computer`, `system`, `admin`, `moderator`, `null`, `undefined`, or `public_*` prefix) | `400 invalid_request` |
| Malformed (length/charset) | `400` (Fastify/Zod body-schema validation, before the handler runs) |
| Reclaiming the identity's own current username (any case) | `200 { username }` — idempotent, no write |
| Attempting to change an already-claimed username | `409 conflict` |
| Canonical name already claimed by a different identity | `409 conflict` |
| Computer identity (defense-in-depth; unreachable via HTTP since the computer can never hold a session) | `403 forbidden` |
| No session cookie | `401 unauthorized` |

**`POST /api/identity`** and **`POST /api/session/recover`** — both response
bodies gain `username: string | null` (backward-compatible additive field;
`null` for every identity that hasn't claimed one yet, including all
pre-existing production identities).

## Validation and normalization rules

- **Length:** 3–24 characters (after trim).
- **Characters:** ASCII `[A-Za-z0-9_-]` only — no spaces or other
  punctuation, so no internal-whitespace ambiguity.
- **Case:** entered casing is preserved for display (`username`); a
  lowercased, trimmed canonical form (`username_canonical`) is the sole
  uniqueness key, so `Alice` / `ALICE` / `alice` collide.
- **Canonicalization:** deliberately simple (`trim()` + `toLowerCase()`) —
  no Unicode casefold/normalization, matching the ASCII-only charset
  restriction.
- **Reserved:** `computer`, `system`, `admin`, `moderator`, `null`,
  `undefined` (exact, case-insensitive), plus any name starting with
  `public_` (reserved for the future auto-generated public-room-name
  prefix).
- **Uniqueness:** global among `kind = 'human'` identities; case-insensitive;
  enforced by the database's partial unique index, not by an application
  pre-check — every claim path (including the two-concurrent-claims tests)
  exercises the real index via a caught `23505`.
- **Lifetime:** claimed once, held indefinitely by that recovery identity;
  changing an already-claimed username is rejected, not silently ignored.
- The server is authoritative throughout; the client's `UsernameSchema`
  check in `RecoveryPage.tsx` is a same-rules pre-check purely for fast
  feedback (avoids a round-trip for an obviously invalid entry) and never
  substitutes for server validation.

## Tests added

43 new/changed tests across four packages (409 total, up from the prior
366-test baseline):

- **shared (+14):** `UsernameSchema` boundaries/charset/whitespace,
  `canonicalizeUsername` case-folding, `isReservedUsername` (exact names +
  `public_` prefix).
- **server (+22):** repository-level `claimUsername()` outcomes (claim,
  case-insensitive collision, idempotent reclaim, reject-change, computer
  exclusion, real concurrent claim via `Promise.all`); migration/constraint
  tests (columns exist, both CHECK constraints, partial unique index at the
  raw-SQL level); HTTP-level coverage of every response in the table above,
  including a real concurrent-claim race over `app.inject`, and recovery
  retaining the claimed username end-to-end.
- **web (+7):** `AuthProvider` surfaces and updates `state.username`
  correctly on create/recover/claim; `RecoveryPage` claim form, success →
  read-only transition, client-side validation error, server error (taken),
  already-claimed direct read-only view, and username retention through a
  recovered session.

## Quality gate results

Run from a clean local Postgres 16 (`tile-meld-db-1`, migrated to latest
including `0019`):

| Step | Result |
| --- | --- |
| `pnpm run format:check` | **Pass** (four new/changed files needed one `pnpm run format` pass — applied, no manual formatting decisions) |
| `pnpm run lint` | **Pass** — 0 issues |
| `pnpm run typecheck` (all 6 workspace projects) | **Pass** |
| `pnpm run test` (`DATABASE_URL=postgres://tilemeld:tilemeld@localhost:5432/tilemeld`) | **Pass — 409/409** (shared 29, engine 115, bot 36, web 52, server 177) |
| `pnpm run build` | **Pass** (web + server) |
| E2E: `two-player-smoke.spec.ts` (chromium) | **Pass — 3/3** |
| E2E: `reconnect-recovery.spec.ts` (chromium) | **Pass — 2/2** (directly exercises the changed `/api/session/recover` response shape) |

The two E2E specs above were chosen because they exercise the identity
bootstrap path (`AuthProvider` → `/api/identity` / `/api/session/recover`)
that this phase changed; the full cross-browser matrix was not run, per the
instruction to keep this phase's testing scoped to what the username claim
flow needs.

Two pre-existing issues surfaced and were fixed while getting the gate
green (both are corrections to code this phase touches, not scope creep):

1. `AuthProvider`'s bootstrap effect called `api.recoverSession(...)` but
   discarded its response, so a recovered session's `username` would never
   have been visible — fixed by reading the response.
2. `writeStoredIdentity(created)` was persisting the entire `/api/identity`
   response object to `localStorage`; now that the response includes
   `username`, that would have started storing it there too, unnecessarily.
   Narrowed to persist only `{playerId, recoverySecret}`.

## Known limitations

- **No Unicode usernames.** ASCII-only by design for this phase (per the
  approved decision); broadening this later requires real Unicode
  normalization work the plan explicitly deferred.
- **Minimal discoverability.** The claim UI lives only on the Recovery page;
  there is no home-page nudge/banner prompting a legacy identity to claim a
  username (matches "do not redesign the home page in this phase").
- **Reserved-name list is a hardcoded set + one prefix**, not
  configurable/admin-managed.
- **No independent test of `usernameClaimLimit`'s rate-limit behavior** —
  consistent with the existing codebase convention (`identityCreateLimit`
  isn't separately tested either; only the strictest limit,
  `recoveryLimit`, has a dedicated test in `http/security.test.ts`).
- **Username is not yet used anywhere** beyond the claim/read-model itself —
  room creation/join, the dashboard, and per-room display names are
  unchanged and still ask for a separate display name. Wiring the username
  into room naming and defaulting it as the per-room display name is Phase 2
  (DR‑5/DR‑6 in `docs/next-changes-implementation-plan.md`).
- **Full Playwright matrix not run** — only the two directly-relevant specs
  above were exercised; a pre-commit full run is recommended before merging
  to `main`, per the project's standard gate.

## Confirmation: later phases not started

No work was done on friendly room names, join-by-name, automatic game
start, Ready/Start UI changes, rematch behavior, 48 hour retention, dashboard
redesign, or tabletop layout. `packages/engine` and `packages/bot` were not
modified. All changes are additive and backward-compatible; every existing
route, schema, and UI flow outside the identity/recovery path is untouched.
