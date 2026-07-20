# Tile Meld — Implementation Plan: Identity, Room Naming, Auto‑Start, Retention & Layout

> Planning deliverable for later execution by Claude Sonnet. Source of truth is the
> current repository, cross-referenced with `docs/opus-implementation-plan.md` (the
> approved plan) and `docs/changes.md` (the new requirements note). Produced under a
> planning-only pass — no code, migrations, or Git operations were run to create it.
> Last updated: 2026-07-20.

---

## 1. Repository and Git assessment

**Git state (read-only inspection):**

- Current branch: `docs/handoff-guide`, up to date with `origin/docs/handoff-guide`. `main` and this branch are both at `1ba3629`.
- Working tree is clean **except one untracked file: `docs/changes.md`** (the requirements note, dated 2026‑07‑20).
- Branches: `main`, `docs/handoff-guide`, `feature/computer-opponent-v1` (all merged history; Computer Opponent V1 + CI/Trivy repairs shipped).

**Architecture confirmed:** pnpm monorepo — `packages/engine` (pure), `packages/bot` (pure), `packages/shared` (Zod DTOs), `apps/server` (Fastify + Socket.IO + PostgreSQL/Kysely, 18 forward-only migrations), `apps/web` (React 19 + react-router + dnd-kit), `e2e` (Playwright, 5 projects). Deploy: single Render web service + one Postgres, migrations run pre-traffic.

**Exact files/modules the requested changes touch** (established by subsystem inspection):

| Area | Key files |
|---|---|
| Identity/username | `db/migrations/0002_create_players.ts`, `0018_*`, `db/repositories/players.ts`, `db/botIdentity.ts`, `http/routes/identity.ts`, `packages/shared/src/schemas/identity.ts`, `packages/shared/src/schemas/rooms.ts` (`DisplayNameSchema`) |
| Rooms/naming/join | `db/migrations/0004_create_rooms.ts`, `0005`, `0006`, `db/repositories/rooms.ts`, `roomMembers.ts`, `http/routes/rooms.ts`, `packages/shared/src/schemas/rooms.ts`, `security/hashing.ts` (`generateRoomCode`) |
| Auto-start/rematch | `http/routes/rooms.ts` (`/start`, `/rematch`, `dealAndTransitionRoom`), `db/repositories/games.ts` (`dealNewGame`), `db/transactions.ts`, `realtime/gateway.ts`, `game/botTurn.ts` |
| Retention/cleanup | `game/deadlineSweep.ts` (`startBackgroundSweeps`), `src/index.ts` (wiring), all game-subtree migrations, `db/repositories/games.ts`, `roomScores.ts` |
| Web UI | `App.tsx`, `layout/RootLayout.tsx`, `pages/HomePage.tsx`, `CreateRoomPage.tsx`, `JoinRoomPage.tsx`, `PublicLobbyPage.tsx`, `WaitingRoomPage.tsx`, `pages/TabletopPage.tsx` + `tabletop/*`, `state/recentRooms.ts` |

---

## 2. Requirements restatement

### Confirmed requirements

1. **Global unique human username.** Server rejects a taken username; recovered identity keeps its own; computer excluded; clean seam for future accounts (but no login/passwords/email/Google now).
2. **Friendly room names** derived from creator username: private `John`/`John 1`/`John 2`; public `public_John`/`public_John 1`. Numbered per creator; displayed consistently on dashboard, lobby, room.
3. **Auto-start:** remove/disable user-facing Ready & Start; auto-start when the room has the required players; **do not delete the backend** readiness/start functions.
4. **Dashboard status colors:** open-not-started = white, active = green, completed/ended/resigned = grey; must not rely on color alone.
5. **4-hour retention:** completed/ended/resigned games available 4 h, then **permanently deleted**.
6. **Home/dashboard hierarchy:** nav (Public Lobby / Create Room / Join by Code / Recovery) → large "Tile Meld" title → "Create a Game" section (Play vs Computer / New Game / Join Room by Name / Browse Public Lobby) → "Your Games" section. Relabel: "Create a room"→"New Game", "Join room by Code"→"Join Room by Name", "Browse Public"→"Browse Public Lobby".
7. **Tabletop:** remove extraneous info, adopt the layout from a Tile Meld artwork reference (**not** a graphics upgrade). Artwork not yet available.

### Inferred recommendations (need approval)

- Auto-start interpretation for 3/4-player rooms; vs-computer auto-start; rematch replacement control; join-by-name privacy model; retention scope (game vs room); username normalization rules; using the username as the per-room display name.

### Contradictions & unresolved decisions

- **C1 — Retention vs approved plan.** New 4 h deletion **directly contradicts `D-RETAIN`** (detail purged at 90 days; results + cumulative `room_scores` kept "long-term/indefinite"). The 4 h rule, taken literally with room deletion, **destroys the room's cumulative score ledger** after 4 h.
- **C2 — Auto-start vs `D-CAP`.** `D-CAP` says "capacity is a maximum; host may Start at ≥2; unfilled seats close on start." Auto-start-on-fill for 3/4 makes capacity the **exact required count** — a 3/4 room that never fills never starts. Conflict for 3/4; consistent for 2p.
- **C3 — Remove Ready/Start vs `D-REMATCH`.** `D-REMATCH` is explicitly opt-in (members mark ready, host starts). Removing the Ready/Start UI removes the rematch staging area; rematch needs a new minimal control.
- **C4 — `changes.md` says "when the second person enters"** (2p-centric); the prompt generalizes to 3/4. Needs an explicit rule for 3/4.
- **C5 — Join by name vs private-room security.** Private rooms today are protected **only** by an unguessable 8-char `code`. Human-readable, enumerable names (`John 2`) as a join key would eliminate that protection. Major risk (see §5/§9).

---

## 3. Decision register (recommended default + alternatives)

> Format: **ID — recommendation** ‖ alternatives/tradeoffs. Items marked ⚠ override or conflict with the approved plan and need explicit sign-off.

**DR‑1 Username storage & uniqueness.** Add `players.username text NULL` + `players.username_canonical text NULL`, with a **partial unique index on `username_canonical WHERE kind='human'`** (bot's `kind='computer'` is naturally excluded). Keep display form (original case) + canonical form (normalized). ‖ *Alt:* reuse the existing unused `display_name_default` column — rejected: it's already used for the bot's "Computer" label and mixing concerns is messy. A dedicated column is a cleaner future-accounts seam.

**DR‑2 Normalization rules (recommended V1).**
- **Case:** case-insensitive uniqueness; canonical = NFKC + casefold (lowercase). Display preserves entered case.
- **Whitespace:** trim ends; **disallow internal whitespace** (avoids ambiguity with the ` N` numbering suffix used in room names).
- **Charset:** conservative ASCII set `[A-Za-z0-9_-]` for V1 (avoids Unicode homoglyph/confusable collisions that would undermine "globally unique"). ‖ *Alt:* full Unicode letters/numbers — defer; higher impersonation risk.
- **Length:** min 3, max 24. ‖ *Alt:* align with existing `max(40)`; 24 is friendlier and keeps room names short.
- **Reserved:** `computer`, `system`, `admin`, `moderator`, `null`, `undefined`, anything beginning `public_` or `public` (would collide with the public-room prefix), and reserved-lookalikes. Checked against a small denylist at claim time.

**DR‑3 Duplicate-name migration (existing production).** There is **no global username today** (human `display_name_default` is always NULL; names live per-room only), so there is nothing to reconcile globally. Make `username` **nullable**; **do not force a backfill**. Legacy identities claim a username lazily (prompted on next room create/join). Two different players who both used "John" in different rooms → first to claim wins, second picks another. ‖ *Alt:* backfill from each player's latest `room_members.display_name` with numeric de-dup — optional convenience, more migration risk on accountless identities that may never return.

**DR‑4 Reservation lifetime.** Username held **indefinitely** by its recovery identity (handle semantics; no login to reclaim yet). ‖ *Alt:* release after long total inactivity (all sessions expired + no active rooms) — more complex, defer. Note: accountless identities are cheap to mint, so squatting is a minor, acknowledged risk.

**DR‑5 Username = per-room display name (simplification).** At create/join, **default `room_members.display_name` to the username** and drop the per-room name input. Because username is globally unique, the per-room `lower(display_name)` uniqueness is automatically satisfied. ‖ *Alt:* keep an optional per-room alias field — more flexible, but reintroduces name-entry friction and weakens the "rooms named after the user" model. **Needs approval — changes Create/Join forms.**

**DR‑6 Friendly room name format & numbering.** Add `rooms.name text NULL` + **global unique index on `lower(name)`**. Derive at creation: private → `username`, `username 1`, `username 2`…; public → `public_username`, `public_username 1`… "Open" for numbering = the creator's rooms in a **non-terminal** state (`open`/`in_game`/`between_games`) of the same visibility. Numbering uses **smallest available integer** (reused after deletion — desirable given 4 h retention). Names are **immutable** after creation. Legacy rooms (no name) **display fallback `Room {code}`** (already the current UI text); no backfill. ‖ *Alt:* monotonic never-reused counter — avoids transient reuse confusion but grows unbounded and looks odd with aggressive retention.

**DR‑7 Numbering race-safety.** DB-enforced: unique `lower(name)` index + insert-and-retry-on-`23505` (increment suffix), mirroring the existing room-code uniqueness convention. Because username is globally unique and the prefix is deterministic, only the same creator can produce `John 2`, so cross-user collisions don't occur.

**DR‑8 Join-by-name privacy model (⚠ safety).** **Friendly name is the user-facing lookup for PUBLIC rooms only.** For **private** rooms the opaque `code` remains the authoritative join credential; the friendly name is display-only. "Join Room by Name": if the name resolves to a public room → join; if it resolves to a private room → require the room's code (invite). ‖ *Alt A:* allow private join by name with rate-limit + lockout + optional PIN — adds friction, still weaker. ‖ *Alt B (do not recommend):* private join by name outright — eliminates the only access control private rooms have (enumeration of `John 1/2/3…`). **This preserves current private-room security while delivering by-name UX for public rooms.**

**DR‑9 Auto-start behavior (⚠ conflicts `D-CAP`, resolves C2/C4).** Capacity 2 → auto-start when the 2nd human joins. Capacity 3/4 → auto-start when **filled to capacity**. vs-Computer → **auto-start at room creation** (human + bot are both seated immediately). Trigger lives **inside the join transaction under `SELECT … FOR UPDATE` on the room row**. Preserve `/ready` and `/start` backend endpoints unchanged for compatibility/testing/rollback. ‖ *Alt:* auto-start 3/4 at ≥2 after a short grace timer — keeps `D-CAP` spirit but adds timing complexity; **not recommended** (ambiguous "who's missing"). Consequence to accept: a 3/4 room that never fills never auto-starts (the retained manual `/start` can still force it in tests/admin).

**DR‑10 Rematch (⚠ conflicts `D-REMATCH`, resolves C3).** Replace the Ready/Start rematch staging with a **single "Rematch" button on the Game Over card**, calling the existing `/rematch` backend, re-dealing the human members currently present (≥2; disabled otherwise). `room_scores` continue to accumulate across rematches (same `room_id`). ‖ *Alt:* auto-rematch on all members returning — surprising, risky. ‖ *Alt:* rematch = brand-new room — simpler but loses the cumulative room ledger.

**DR‑11 Retention scope (⚠ conflicts `D-RETAIN`, resolves C1).** At `completed_at + 4 h`, delete the **game detail subtree** (seats, racks, turns, table_sets, game_events, chat, idempotency_keys). Delete the **room** (+ `room_scores`, `room_members` via cascade) **only when it has no surviving/active game** and its last game aged out. A rematch within the 4 h window keeps the room alive (new active game). **Push subscriptions are player-scoped and untouched.** Authoritative timestamp: **`games.completed_at`** (there is no `ended_at`; "resigned/ended" games are simply `status='completed'`). ‖ Accept: cumulative `room_scores` die with the room after 4 h — consistent with "no accounts/lifetime stats," but a real change from `D-RETAIN`.

**DR‑12 Retention mechanism & safety.** Reuse `startBackgroundSweeps` — add `runRetentionSweepOnce` on a **longer interval** (e.g. every 5–10 min), single-process, **no Redis/queue/worker**. Gate behind env **`RETENTION_COMPLETED_GAME_HOURS`** (default `4`, `0` = disabled) + ship **OFF by default first**, verify in staging, then enable — mirroring the `ENABLE_COMPUTER_OPPONENT` kill-switch pattern. `FOR UPDATE SKIP LOCKED` on `games` rows (consistent with the codebase's "only lock `games`" convention); room deletion re-checks under a room `FOR UPDATE` to avoid racing a concurrent rematch. **Flag: destructive & irreversible past the backup window** (Render PITR 3–7 days).

**DR‑13 Dashboard status mapping (no new states).** Derive one `statusTone(room)`: **white "Open"** = `status='open'`; **green "In play"** = `status='in_game'`; **grey "Completed"** = `between_games` / `closed` / `abandoned` / latest game `completed`. Redundant encoding: text label + icon/shape (○ / ▶ / ✓) + accessible name + a left-border stripe; white cards get a visible outline; grey text meets 4.5:1 contrast. Tokens from `styles/global.css`.

**DR‑14 Nav labels vs route URLs.** **Keep existing route paths** (`/rooms/new`, `/rooms/join`, `/lobby`) — change **labels only**. Zero risk to `recentRooms` deep links; no redirects needed. ‖ *Alt:* rename routes + add redirects — unnecessary churn.

**DR‑15 Tabletop retain/remove (blocked on artwork).** Categorization in §7.6. Artwork-dependent exact layout is a **later, isolated phase**; all repo/component prep that doesn't need the art happens earlier.

---

## 4. Current-system impact analysis

**Database/migrations.** New additive, forward-only migrations: `0019` players.username(+canonical)+partial unique index; `0020` rooms.name + unique `lower(name)`; `0021` (optional) index `games(status, completed_at)` for the retention sweep. All expand-compatible (`D-MIGRATE`). `players.display_name_default` stays as-is (bot label).

**Identity/recovery.** `POST /api/identity` currently takes **no name** and returns `{playerId, recoverySecret}`; recovery returns `{playerId}` only. Add a username claim step (either on identity creation or a dedicated `POST /api/identity/username`). Recovery already re-associates by `playerId`, so the username on that row **persists automatically**; the uniqueness check must **exclude self** (an UPDATE that leaves the value unchanged won't trip the index).

**Room creation/joining.** `createRoom` already runs a transaction (insert room → insert host member → set host); extend to (a) compute+store the friendly name with retry-on-conflict, (b) default display_name to username. `findRoomByCode` (uppercased exact match) stays authoritative; add `findRoomByName` (canonical) for **public** lookups. `join` gains `FOR UPDATE` on the room + auto-deal-on-fill.

**Lobby/quick-join.** `GET /api/rooms/public` and `findQuickJoinableRoom` unchanged structurally; surface `name` in `PublicRoomSummary`. Quick Join keeps working.

**Realtime.** Gateway is **game-scoped only; there is no room channel and no "game started" event.** Auto-start does **not** require a new socket event: `WaitingRoomPage` already polls `GET /api/rooms/:id` every 3 s and navigates when `status='in_game'` + `latestGameId`. The filling join deals the game; other clients' next poll carries them in. (Optional later: room-scoped socket event for snappier transitions.)

**Auto-start transactions.** Today: `/start` reads members **outside** the txn, deals **inside** a txn, with **no `FOR UPDATE` on the room**; duplicate-start is only backstopped by unique `(room_id, seq)`. Auto-start **must** add the room lock to be race-safe (this is the core correctness change).

**Game/room cleanup.** Only cascade in the whole schema is `room_members → rooms`. **Everything in the game subtree is `NO ACTION`** — deletes must be **bottom-up** and must first `UPDATE games SET current_turn_id=NULL` (games↔turns cycle). Room deletion requires deleting its games + `room_scores` first.

**Dashboard/tabletop UI.** No server "list my games" endpoint — dashboard is **client-side `localStorage` (`recentRooms`) + per-room GET**, and **already prunes 404s silently**, so purged rooms drop off gracefully. Tabletop deep-links to purged games will 403/404 (seats gone) — needs a friendly "game ended / no longer available" state.

**Deployment/rollback.** All schema changes additive/forward-only; retention gated by env kill-switch; auto-start/rematch behavior is code + preserved backend endpoints (rollback = revert code, no down-migration). Render preDeploy migration flow unchanged.

**Privacy/security.** Redaction chokepoint (`redactGameFor`) untouched. New surfaces: username enumeration, room-name enumeration, join-by-name authorization (§9).

---

## 5. Proposed data and API changes

**Schema (additive, forward-only):**

- `players`: `username text NULL`, `username_canonical text NULL`; `CREATE UNIQUE INDEX players_username_human_uk ON players(username_canonical) WHERE kind='human'`.
- `rooms`: `name text NULL`; `CREATE UNIQUE INDEX rooms_name_uk ON rooms(lower(name))`.
- Optional `games`: `CREATE INDEX games_status_completed_at_idx ON games(status, completed_at)`.

**Shared schemas (`packages/shared`):**

- New `UsernameSchema = z.string().trim().min(3).max(24).regex(/^[A-Za-z0-9_-]+$/)` + reserved-name refinement; canonicalization helper (NFKC + casefold).
- `rooms.ts`: add `name` to `GetRoomResponseSchema`, `PublicRoomSummarySchema`, and the create response; add a `JoinByNameRequestSchema {name, code?}`.

**API:**

- `POST /api/identity` → optionally accept `{username}`, or add `POST /api/identity/username {username}` (claim/change-once); returns `409 username_taken` on conflict (DB-arbitrated, not pre-checked).
- `POST /api/rooms` → response gains `{name}`; body drops required `displayName` (defaults to username) — **backward-compat:** keep accepting `displayName` optionally.
- `POST /api/rooms/join-by-name` → resolves public room by name (join); private → require `code`.
- `GET /api/rooms/public`, `GET /api/rooms/:id` → include `name`.
- Preserved unchanged (compat/rollback): `/rooms/:id/ready`, `/start`, `/rematch`.

**Backward compatibility & internal IDs.** `rooms.id` (UUID PK, all FKs) and `rooms.code` remain the **authoritative internal identifiers**; the friendly `name` is display + public-lookup only. Legacy rooms with `name IS NULL` render as `Room {code}`. Legacy players with `username IS NULL` are prompted to claim one before creating/joining.

---

## 6. Concurrency and lifecycle design

- **Username claims:** DB partial-unique index is the arbiter; wrap claim in a transaction, catch `23505` → "username taken." Never rely on a pre-check `SELECT` (racy). Self-recovery is an idempotent no-op (same row/value).
- **Friendly-name allocation:** compute candidate → insert → on `23505` increment suffix and retry (bounded, e.g. ≤ capacity²). Global `lower(name)` unique index guarantees correctness under concurrent creates.
- **Simultaneous joins & auto-start:** `SELECT … FOR UPDATE` on the room at join start; re-check `status='open'` and current member count under the lock; insert member; if the room is now full, deal the game (`dealNewGame`) + set `in_game` + reset readiness **in the same transaction**. Serializes concurrent joins; exactly one "filling join" deals.
- **Duplicate-start prevention:** room lock + status recheck + unique `(room_id, seq)` backstop. Preserved `/start` also gains the room lock for consistency.
- **Bot-first-turn (correctness check):** if auto-start deals a vs-computer game where the bot holds the starting seat, ensure the first bot turn is scheduled (today the gateway schedules bots off `broadcastTurnActionResult`; `dealNewGame` emits no socket event). Either schedule on deal or settle-on-`game:join`; the deadline sweep is the backstop. **Must be tested.**
- **Retention races:** `FOR UPDATE SKIP LOCKED` per game; each game deleted in its own transaction after re-checking `status='completed' AND completed_at ≤ now()-Nh`; idempotent (gone = skip). Room deletion re-checks "no active/newer game" under a room `FOR UPDATE` to avoid racing a rematch.
- **Open pages observing deletion:** dashboard prunes 404 rooms silently (already). Tabletop must catch 403/404 + socket `unauthorized` on a purged game and show "This game has ended and is no longer available," then route home.

---

## 7. UX plan

**7.1 Home/dashboard hierarchy.** Nav row (labels only; routes unchanged per DR‑14): Public Lobby → Create Room → Join by Code → Recovery. Large **"Tile Meld"** title. **"Create a Game"** section: Play vs Computer / **New Game** (`/rooms/new`) / **Join Room by Name** (`/rooms/join`) / **Browse Public Lobby** (`/lobby`). **"Your Games"** section below (existing `recentRooms` list, restyled as status cards).

**7.2 Game cards / status (DR‑13).** Each card: friendly room name (or `Room {code}`), players `n/capacity`, and a **status pill** = white "Open" (○, outlined) / green "In play" (▶) / grey "Completed" (✓), text + icon + accessible name, contrast-checked.

**7.3 New Game & Join-by-Name flows.** Create form: drop the display-name input (defaults to username), keep capacity/visibility/turn-limit. Join-by-Name: name field; public → join; private → also request the invite code (DR‑8). Username claim prompt appears for legacy/nameless identities.

**7.4 Public lobby.** Show friendly `name` alongside/instead of `code`; Quick Join unchanged.

**7.5 Waiting-room simplification.** Remove the Ready toggle and host Start/Rematch button; the room screen becomes a **seated-players + auto-transition** view (keeps the existing `status==='in_game'` → navigate effect). Show "waiting for N more player(s)" and the shareable invite (code for private).

**7.6 Tabletop inventory & proposed hierarchy** (full inventory captured):

*Essential during play:* turn indicator/ownership, deadline countdown, your rack + tiles, table sets + validity labels, actions (Draw/Pass/Commit/Reset/Undo/Resign + confirm), initial-meld progress, validation hint, opponent rack **counts**, pool count.

*Required for a11y/safety/correctness:* announcer region, connection-state indicator, error/action-error banners, warning toast.

*Useful but secondary/collapsible:* chat panel, opponent detail rows.

*Removable from primary view:* static "Tabletop" title (replace with room/game name or drop), always-on penalty paragraph (make contextual/first-time), redundant explanatory copy; Game-Over can become a modal.

*Proposed hierarchy* — **Desktop:** top bar (room name · turn owner + deadline · connection) → table (center) → rack + sticky action bar (bottom) → chat (collapsible side). **Mobile:** stacked; chat behind a toggle; actions in a sticky bottom bar. Preserve all warnings, turn ownership, validation, a11y announcements, connection state, opponent counts, and actions.

**7.7 Artwork contract (prep now, apply later).** Reserve `apps/web/src/assets/tabletop/` (or `public/`) and define a **layout contract**: named region slots (table, rack, action bar, status bar, opponent strip) with aspect ratios/safe areas the artwork fills. Keep this **layout** phase separate from any later **visual-theme** redesign. Do not copy commercial Rummikub art.

---

## 8. Testing strategy

- **Migration tests:** username partial-unique index (bot excluded); `rooms.name` unique `lower(name)`; legacy `NULL` name/username rendering; existing per-room duplicate display names don't block the migration.
- **Username:** normalization (case/whitespace/charset/length), reserved names, **concurrent claims** (two txns, one 409), recovery retains username (self-exclusion), computer never claims.
- **Room naming:** numbering `John`/`John 1`/`John 2`, `public_` prefix, **concurrent creation** by same user, case-insensitive uniqueness, smallest-available reuse after deletion, legacy fallback.
- **Join authorization:** public join-by-name succeeds; **private-by-name rejected without code**; enumeration attempts don't join private rooms.
- **Auto-start races:** capacity 2/3/4 fill; **simultaneous joins → exactly one game, no double, no incomplete start**; vs-computer auto-start; preserved `/start` still works; bot-first-turn scheduled.
- **Rematch:** Game-Over button re-deals present members; `room_scores` accumulate; works with Ready/Start UI removed.
- **Retention (controlled time):** inject a clock/`now` param so 4 h is testable without waiting; correct bottom-up cascade (all 8 child tables gone); room deleted only when no surviving game; push_subscriptions untouched; **idempotency** (double-run safe); **concurrent-rematch guard**; purged-game deep-link → graceful 404 state.
- **Dashboard component tests:** `statusTone` mapping + labels + a11y names; nav labels/routes.
- **Playwright (desktop + Pixel 7 + iPhone 14):** new home layout & nav; New Game / Join-by-Name; auto-start replaces manual start in `two-player-smoke`, `multi-player`, `vs-computer`, `full-lifecycle`; rematch; regression for human-vs-human and vs-computer. Respect the per-IP rate-limit / patient-helper conventions in `e2e/tests/helpers.ts` (do **not** loosen prod rate limits).
- **CI:** existing gate (format/lint/typecheck/unit+integration/build + full Playwright matrix + Trivy) must stay green; expected unit/integration baseline is 366 passing — update counts as tests are added.

---

## 9. Privacy & security (explicit risk flags)

- **⚠ Join-by-name on private rooms** would replace an unguessable ~10¹² code space with enumerable names (`John 1/2/3…`) → unauthorized joins. **Mitigation (DR‑8): private rooms keep code-based access; by-name is public-only.** Do not weaken this without accepting the consequence.
- **Username enumeration / homoglyphs:** the conservative ASCII charset + NFKC/casefold canonical (DR‑2) prevents confusable-collision impersonation in V1.
- **`public_John` reveals a username↔activity link** — inherent to the requested public naming; acceptable for public rooms, minor privacy note.
- **"Permanent deletion" vs backups:** hard-deleted data persists in Render PITR/backups for 3–7 days; document that "permanent" means removed from the live DB, not instantly from backups.
- **Redaction unchanged:** no new hidden-state leakage; opponents still get rack counts only.

---

## 10. Phased Sonnet implementation plan

Each phase: one reviewable change, engine/bot stay pure, server authoritative, **stop at a manual Git checkpoint**, and **save a completion summary under `docs/`** (e.g. `docs/phase-XX-<slug>.md`). Identity/data-model prerequisites first; artwork-dependent tabletop last.

**Phase 1 — Global username identity.** *Goal:* claimable, globally-unique human username. *Files:* migration `0019`, `players.ts`, `identity.ts`, `shared/schemas/identity.ts`, web claim UI. *Migration:* players username(+canonical)+partial unique index. *Acceptance:* claim/reject/recover-retains/bot-excluded/reserved. *Tests:* §8 username+migration. *Risks:* legacy NULL handling. *Commit:* `feat(identity): globally unique human usernames`. *Checkpoint.*

**Phase 2 — Friendly room names.** *Goal:* names derived from username with race-safe numbering. *Files:* migration `0020`, `rooms.ts` repo, `http/routes/rooms.ts`, `shared/schemas/rooms.ts`, web display (dashboard/lobby/room). *Acceptance:* numbering, `public_` prefix, unique `lower(name)`, legacy fallback. *Tests:* §8 naming. *Risks:* concurrent create. *Commit:* `feat(rooms): human-readable room names`. *Checkpoint.*

**Phase 3 — Join by name (public) + privacy model.** *Files:* `rooms.ts` repo (`findRoomByName`), route `join-by-name`, `JoinRoomPage.tsx`, schemas. *Acceptance:* public by-name join; private requires code. *Tests:* §8 join authorization. *Risks:* enumeration. *Commit:* `feat(rooms): join public rooms by name`. *Checkpoint.*

**Phase 4 — Auto-start + retire Ready/Start UI.** *Files:* `http/routes/rooms.ts` (join `FOR UPDATE` + auto-deal), `games.ts`, `transactions.ts`, `WaitingRoomPage.tsx`, `gateway.ts`/`botTurn.ts` (bot-first-turn), vs-computer path. *Acceptance:* 2/3/4 + vs-computer auto-start, atomic, no double/incomplete; `/ready`,`/start`,`/rematch` preserved. *Tests:* §8 auto-start races. *Risks:* concurrency, bot-first-turn. *Commit:* `feat(rooms): auto-start games on room fill`. *Checkpoint.*

**Phase 5 — Rematch control.** *Files:* Game-Over card in `TabletopPage.tsx`, `rooms.ts` `/rematch` reuse. *Acceptance:* one-click rematch re-deals present members; scores persist. *Tests:* §8 rematch. *Commit:* `feat(web): one-click rematch`. *Checkpoint.*

**Phase 6 — Home/dashboard layout + status colors.** *Files:* `RootLayout.tsx`, `HomePage.tsx`, `CreateRoomPage.tsx`, `global.css`. *Acceptance:* nav relabels (routes unchanged), Create-a-Game + Your-Games sections, white/green/grey status pills with text+icon+contrast. *Tests:* §8 dashboard + Playwright nav. *Commit:* `feat(web): dashboard layout and game-status treatment`. *Checkpoint.*

**Phase 7 — 4-hour retention sweep.** *Files:* `game/deadlineSweep.ts` (`runRetentionSweepOnce`), `index.ts` wiring, migration `0021` (index), `env.ts` (`RETENTION_COMPLETED_GAME_HOURS`), tabletop purged-game state, `.env.example`/`render.yaml`/docs. *Acceptance:* bottom-up delete, room-deletion rule (DR‑11), idempotent, concurrent-rematch-safe, flag-gated (OFF first). *Tests:* §8 controlled-time retention. *Risks:* **irreversible data loss** — ship OFF, verify in staging. *Commit:* `feat(server): 4-hour completed-game retention`. *Checkpoint.*

**Phase 8 — Tabletop layout prep (no artwork).** *Files:* `TabletopPage.tsx` + `tabletop/*`, new `assets/tabletop/` + layout-contract doc. *Acceptance:* extraneous elements removed, essentials/a11y preserved, desktop+mobile hierarchy, slot contract defined. *Tests:* tabletop essentials + accessibility specs still pass. *Commit:* `refactor(web): tabletop information hierarchy`. *Checkpoint.*

**Phase 9 — Apply artwork layout (BLOCKED on artwork).** Do not start until the reference is supplied; then map the defined slots to the artwork layout only (no theme/graphics upgrade). *Commit:* `feat(web): adopt tabletop artwork layout`. *Checkpoint.*

---

## 11. Deployment and rollback plan

- **Migration order:** `0019` (username) → `0020` (room name) → `0021` (retention index). All additive/expand-compatible, run pre-traffic via Render `preDeployCommand`.
- **Feature flags:** `RETENTION_COMPLETED_GAME_HOURS` (default `4`; `0`=off) — **deploy OFF**, verify in staging, then enable. Auto-start/rematch are code + preserved endpoints (no flag needed, but `/start` remains a manual fallback).
- **Safe rollout:** ship Phases 1–2 (data model) first and confirm green before behavior changes; retention last and gated.
- **Existing-room compatibility:** legacy rooms → `Room {code}`; legacy players prompted to claim username; preserved `/ready`,`/start` keep old flows working.
- **Cleanup activation:** flip the env flag after staging verification; monitor logs (the sweep `.catch()`-logs like the existing sweeps).
- **Render verification:** `/api/health`, one two-browser game end-to-end, confirm a completed game/room disappears after the window in staging.
- **Rollback limitations:** forward-only migrations (`D-MIGRATE`) — rollback behavior via reverting app code + disabling the retention flag, **never** a destructive down-migration. **Retention deletions are irreversible past the 3–7 day backup/PITR window** — this is the one change with permanent data-loss risk.

---

## 12. Sonnet handoff — first phase

**Start with Phase 1 (Global username identity).** Checklist for Sonnet:

1. Branch (human runs the command); confirm clean tree + green baseline gate.
2. Add migration `0019`: `players.username` + `username_canonical` + partial unique index `WHERE kind='human'`.
3. Add `UsernameSchema` + canonicalization (NFKC + casefold) + reserved-name denylist to `packages/shared`.
4. Add the claim endpoint/logic in `identity.ts`/`players.ts`; DB-arbitrated uniqueness (catch `23505`); recovery retains username (self-exclusion); computer excluded.
5. Minimal web claim UI for nameless identities.
6. Tests per §8 (normalization, concurrent claims, recovery-retains, reserved, bot-excluded, migration).
7. Full gate + relevant server/web tests; write `docs/phase-01-username.md`; **stop and print the exact inspect/commit/push commands rooted at `~/git/tile-meld`.** Do not start Phase 2.

---

## Decisions to approve before Sonnet starts

1. **Username rules (DR‑2/3/4/5):** case-insensitive, no internal whitespace, `[A-Za-z0-9_-]`, 3–24 chars, reserved list, **held indefinitely**, and **username defaults as the per-room display name** (drops the name input on Create/Join).
2. **Room naming (DR‑6/7):** `John`/`John 1`; `public_John`; smallest-available numbering, immutable, unique `lower(name)`, legacy → `Room {code}`.
3. **⚠ Join-by-name privacy (DR‑8):** public rooms join by name; **private rooms keep code-based access** (name is display-only).
4. **⚠ Auto-start (DR‑9, conflicts `D-CAP`):** 2p on 2nd human; 3/4 on full capacity; vs-computer at creation; a 3/4 room that never fills won't auto-start.
5. **⚠ Rematch (DR‑10, conflicts `D-REMATCH`):** single "Rematch" button on Game Over, re-deals present members.
6. **⚠ Retention (DR‑11/12, conflicts `D-RETAIN`):** delete game detail at `completed_at + 4 h`; delete room + `room_scores` when no surviving game; env-gated, OFF first; **irreversible past the backup window; cumulative room scores die with the room.**
7. **Dashboard status (DR‑13) & nav labels keep routes (DR‑14).**

**Recommended first Sonnet phase:** Phase 1 — Global username identity (prerequisite for everything else).
