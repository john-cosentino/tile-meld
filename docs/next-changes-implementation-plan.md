# Tile Meld — Implementation Plan: Identity, Room Naming, Auto‑Start, Retention & Layout

> Planning deliverable for later execution by Claude Sonnet. Source of truth is the
> current repository, cross-referenced with `docs/opus-implementation-plan.md` (the
> approved plan) and `docs/changes.md` (the new requirements note). Produced under a
> planning-only pass — no code, migrations, or Git operations were run to create it.
> Last updated: 2026-07-20.

> **Amendment (documentation-only correction, made before the Phase 2 Git
> checkpoint):** three of this plan's original recommendations have been
> superseded by user-approved decisions. Every reference below has been
> updated accordingly:
> 1. **Private-room joining** — private rooms are joined by **exact room
>    name alone**, no invite code required in the normal join UI. "Private"
>    means **unlisted** (excluded from the public lobby, search
>    suggestions, autocomplete, and broad listings), not protected by a
>    secret credential. Supersedes the original DR‑8 (code-required private
>    join). See DR‑8, §9, and Phase 3.
> 2. **Starting games** — the host-controlled **Start Game button stays
>    visible**; the host may start once the existing minimum-player
>    requirement is met. A room **additionally** auto-starts once it
>    reaches its selected capacity — both triggers coexist, race-safely.
>    Supersedes the original DR‑9 (remove/disable Ready & Start,
>    auto-start-only for 3/4p). See DR‑9, §7.5, and Phase 4. This also
>    changes the premise behind DR‑10 (Rematch) — see C3.
> 3. **Retention window** — completed games remain accessible for **48
>    hours (2 days)** after authoritative `completed_at`, not 4 hours. Fixed
>    product rule, not user-selectable; rollout mechanics (destructive,
>    feature-gated/off-initially, forward-only) are unchanged. Supersedes
>    every "4-hour"/"4 h" reference. See DR‑11, DR‑12, and Phase 7.
>
> No application code, migrations, schemas, tests, or dependencies changed
> as part of this amendment — Phases 1–2 are implemented and unaffected;
> Phase 3 onward must follow the corrected decisions below.

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
3. **Starting games (corrected — see Amendment above):** keep the host-controlled Start Game button **visible**; the host may start once the existing minimum-player requirement is met. **Additionally**, a room auto-starts once it reaches its selected capacity — a 3/4-player room can start early via the button or auto-start when full. Preserve backend Ready/Start functionality unconditionally (not merely for rollback — the button ships live), even if the Ready UI is simplified later.
4. **Dashboard status colors:** open-not-started = white, active = green, completed/ended/resigned = grey; must not rely on color alone.
5. **48-hour retention (corrected — see Amendment above):** completed/ended/resigned games available 48 h (2 days), then **permanently deleted**. Fixed product rule, not user-selectable.
6. **Home/dashboard hierarchy:** nav (Public Lobby / Create Room / Join by Code / Recovery) → large "Tile Meld" title → "Create a Game" section (Play vs Computer / New Game / Join Room by Name / Browse Public Lobby) → "Your Games" section. Relabel: "Create a room"→"New Game", "Join room by Code"→"Join Room by Name", "Browse Public"→"Browse Public Lobby".
7. **Tabletop:** remove extraneous info, adopt the layout from a Tile Meld artwork reference (**not** a graphics upgrade). Artwork not yet available.

### Inferred recommendations (need approval)

- Auto-start interpretation for 3/4-player rooms; vs-computer auto-start; rematch replacement control; join-by-name privacy model; retention scope (game vs room); username normalization rules; using the username as the per-room display name.

### Contradictions & unresolved decisions

- **C1 — Retention vs approved plan.** New 48-hour deletion (corrected from an original 4-hour figure — see Amendment) **directly contradicts `D-RETAIN`** (detail purged at 90 days; results + cumulative `room_scores` kept "long-term/indefinite"). The 48 h rule, taken literally with room deletion, **destroys the room's cumulative score ledger** after 48 h.
- **C2 — Auto-start vs `D-CAP` (RESOLVED — no longer a conflict).** `D-CAP` says "capacity is a maximum; host may Start at ≥2; unfilled seats close on start." The approved starting-games decision (DR‑9) keeps that host-start-at-≥2 behavior **exactly as-is** and adds capacity-triggered auto-start as a second, non-exclusive path — `D-CAP`'s host-start guarantee is preserved verbatim, so auto-start is purely additive and no amendment to `D-CAP` is needed.
- **C3 — Rematch staging vs `D-REMATCH` (premise changed — needs re-confirmation, see DR‑10).** `D-REMATCH` is explicitly opt-in (members mark ready, host starts). This contradiction, and DR‑10's "single Rematch button on Game Over" recommendation, were written when the Ready/Start UI was planned for removal (the original requirement #3). The approved correction to starting games keeps the host-controlled Start button visible — **including for rematch** — so DR‑10's premise (replacing a control that was going away) no longer holds. DR‑10 has **not** been re-approved under the corrected decision; treat it as pending re-confirmation before Phase 5, not as settled.
- **C4 — `changes.md` says "when the second person enters"** (2p-centric); the approved starting-games decision generalizes this via capacity-triggered auto-start for 3/4-player rooms too (see DR‑9) — resolved.
- **C5 — Join by name vs private-room security (RESOLVED by approved decision).** Private rooms were originally protected only by an unguessable 8-char `code`. The approved decision explicitly accepts that private rooms are **unlisted, not secret** — joined by exact name alone, with no separate credential required in the normal join UI. This is a deliberate, user-approved reduction in the original protection model, not an oversight; see DR‑8 and §9.

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

**DR‑6 Friendly room name format & numbering.** Add `rooms.name text NULL` + **global unique index on `lower(name)`**. Derive at creation: private → `username`, `username 1`, `username 2`…; public → `public_username`, `public_username 1`… "Open" for numbering = the creator's rooms in a **non-terminal** state (`open`/`in_game`/`between_games`) of the same visibility. Numbering uses **smallest available integer** (reused after deletion — desirable given the 48-hour retention window). Names are **immutable** after creation. Legacy rooms (no name) **display fallback `Room {code}`** (already the current UI text); no backfill. ‖ *Alt:* monotonic never-reused counter — avoids transient reuse confusion but grows unbounded and looks odd with aggressive retention.

**DR‑7 Numbering race-safety.** DB-enforced: unique `lower(name)` index + insert-and-retry-on-`23505` (increment suffix), mirroring the existing room-code uniqueness convention. Because username is globally unique and the prefix is deterministic, only the same creator can produce `John 2`, so cross-user collisions don't occur.

**DR‑8 Private-room join model (✅ approved — supersedes the original code-required recommendation).** Private rooms are joined by **exact room name alone** — no invite code required in the normal join UI. "Private" means **unlisted** (excluded from the public lobby, search suggestions, autocomplete, and any broad listing), **not** protected by a secret credential; the room's opaque `code` and UUID remain the authoritative internal identifiers and stay available as an internal/fallback identifier, but the normal private-room join flow no longer requires the code. "Join Room by Name" therefore works uniformly for both visibilities via **exact-name lookup** (case-insensitive), gated only by the existing session authentication and per-endpoint rate limiting — no new access-control mechanism is introduced. Private room names must never be surfaced by search suggestions, autocomplete, public listings, or any broad search — the mitigation is **exclusion from discovery, not secrecy of the join credential**. ‖ *Original recommendation (superseded, kept for context):* friendly name as the public-only lookup, private rooms gated by the code — rejected by the user in favor of unlisted-not-secret private rooms. ‖ *Alt (not chosen):* rate-limit + lockout + optional PIN on top of name-based private join — unnecessary given the approved exclusion-based model; existing rate limiting is sufficient.

**DR‑9 Starting games (✅ approved — supersedes the auto-start-only recommendation).** The host-controlled **Start Game button stays visible** in the shipped UI; the host may start once the existing minimum-player requirement (`MIN_READY_TO_START = 2`) is met, exactly as today. **Additionally**, a room auto-starts once it reaches its **selected capacity** (2, 3, or 4) — capacity is the auto-start trigger uniformly, not a 3/4-only special case. A 3- or 4-player room can therefore start **early** via the host's button (once ≥2 are ready) **or** auto-start the moment it fills — whichever happens first. For a 2-player room the two triggers coincide (capacity = minimum = 2). vs-Computer rooms keep their existing manual-start flow (seats filled at creation). The auto-start trigger still lives **inside the join transaction under `SELECT … FOR UPDATE` on the room row**, and the preserved `/start` endpoint gains the same lock, so the manual-button path and the auto-fill path can never double-deal a game (see §6). Preserve `/ready` and `/start` backend endpoints unconditionally — not merely for rollback, since the button is a permanent, shipped UI element, not a fallback. ‖ *Original recommendation (superseded, kept for context):* remove/disable the user-facing Ready & Start controls entirely, auto-start-only for 3/4p — rejected by the user. Ready-UI simplification (if it ever happens) is a separate, later, not-yet-approved decision that must not remove Start.

**DR‑10 Rematch (⚠ conflicts `D-REMATCH`; premise changed by DR‑9 — PENDING RE-CONFIRMATION, do not implement as-is).** *This recommendation was written when the Ready/Start UI was planned for removal (see C3). The approved starting-games correction (DR‑9) keeps the host-controlled Start/Rematch button visible for rematch too, so the replacement described below may no longer be wanted or needed. Left below for reference only — re-confirm with the user before Phase 5.* Original recommendation: replace the Ready/Start rematch staging with a **single "Rematch" button on the Game Over card**, calling the existing `/rematch` backend, re-dealing the human members currently present (≥2; disabled otherwise). `room_scores` continue to accumulate across rematches (same `room_id`). ‖ *Alt:* auto-rematch on all members returning — surprising, risky. ‖ *Alt:* rematch = brand-new room — simpler but loses the cumulative room ledger. ‖ *Alt (now likely correct, pending confirmation):* no change — the existing, preserved Start/Rematch button already serves this role once DR‑9 keeps it visible.

**DR‑11 Retention scope (✅ approved at 48 hours — corrects an original 4-hour recommendation; ⚠ still conflicts `D-RETAIN`, resolves C1).** At `completed_at + 48 h` (2 days), delete the **game detail subtree** (seats, racks, turns, table_sets, game_events, chat, idempotency_keys). Delete the **room** (+ `room_scores`, `room_members` via cascade) **only when it has no surviving/active game** and its last game aged out. A rematch within the 48 h window keeps the room alive (new active game). **Push subscriptions are player-scoped and untouched.** Authoritative timestamp: **`games.completed_at`** (there is no `ended_at`; "resigned/ended" games are simply `status='completed'`). The 48-hour figure is a **fixed product rule, not user-selectable**. ‖ Accept: cumulative `room_scores` die with the room after 48 h — consistent with "no accounts/lifetime stats," but a real change from `D-RETAIN`.

**DR‑12 Retention mechanism & safety (✅ approved at 48 hours, fixed).** Reuse `startBackgroundSweeps` — add `runRetentionSweepOnce` on a **longer interval** (e.g. every 5–10 min), single-process, **no Redis/queue/worker**. The **48-hour window is a fixed constant in code**, not an env-configurable number — the period is a product rule, not a per-deployment tuning knob. Gate behind a **boolean** env flag **`ENABLE_RETENTION_SWEEP`** (default `false`/OFF) + ship **OFF by default first**, verify in staging, then enable — mirroring the `ENABLE_COMPUTER_OPPONENT` kill-switch pattern (renamed from an hours-value to a boolean specifically to match "fixed, not user-selectable"). `FOR UPDATE SKIP LOCKED` on `games` rows (consistent with the codebase's "only lock `games`" convention); room deletion re-checks under a room `FOR UPDATE` to avoid racing a concurrent rematch. **Flag: destructive & irreversible past the backup window** (Render PITR 3–7 days). Rollout mechanics (destructive, feature-gated/off-initially, forward-only) are otherwise unchanged from the original plan.

**DR‑13 Dashboard status mapping (no new states).** Derive one `statusTone(room)`: **white "Open"** = `status='open'`; **green "In play"** = `status='in_game'`; **grey "Completed"** = `between_games` / `closed` / `abandoned` / latest game `completed`. Redundant encoding: text label + icon/shape (○ / ▶ / ✓) + accessible name + a left-border stripe; white cards get a visible outline; grey text meets 4.5:1 contrast. Tokens from `styles/global.css`.

**DR‑14 Nav labels vs route URLs.** **Keep existing route paths** (`/rooms/new`, `/rooms/join`, `/lobby`) — change **labels only**. Zero risk to `recentRooms` deep links; no redirects needed. ‖ *Alt:* rename routes + add redirects — unnecessary churn.

**DR‑15 Tabletop retain/remove (blocked on artwork).** Categorization in §7.6. Artwork-dependent exact layout is a **later, isolated phase**; all repo/component prep that doesn't need the art happens earlier.

---

## 4. Current-system impact analysis

**Database/migrations.** New additive, forward-only migrations: `0019` players.username(+canonical)+partial unique index; `0020` rooms.name + unique `lower(name)`; `0021` (optional) index `games(status, completed_at)` for the retention sweep. All expand-compatible (`D-MIGRATE`). `players.display_name_default` stays as-is (bot label).

**Identity/recovery.** `POST /api/identity` currently takes **no name** and returns `{playerId, recoverySecret}`; recovery returns `{playerId}` only. Add a username claim step (either on identity creation or a dedicated `POST /api/identity/username`). Recovery already re-associates by `playerId`, so the username on that row **persists automatically**; the uniqueness check must **exclude self** (an UPDATE that leaves the value unchanged won't trip the index).

**Room creation/joining.** `createRoom` already runs a transaction (insert room → insert host member → set host); extend to (a) compute+store the friendly name with retry-on-conflict, (b) default display_name to username. `findRoomByCode` (uppercased exact match) stays authoritative internally; add `findRoomByName` (canonical) for lookups on **both public and private rooms** — private rooms are unlisted (excluded from search/autocomplete/public listings) but still resolvable by their exact name, per the approved DR‑8 correction. `join` gains `FOR UPDATE` on the room + auto-deal when the room reaches capacity (DR‑9).

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
- `POST /api/rooms/join-by-name` → resolves **either** a public or private room by exact name (case-insensitive) and joins it directly — no separate code required (DR‑8, corrected). Private rooms are unlisted from `GET /api/rooms/public` and any future search/autocomplete, not gated by an additional credential; gated only by existing session auth + rate limiting.
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
- **Retention races:** `FOR UPDATE SKIP LOCKED` per game; each game deleted in its own transaction after re-checking `status='completed' AND completed_at ≤ now() - 48h` (48 hours is a fixed product constant, not configurable — DR‑12); idempotent (gone = skip). Room deletion re-checks "no active/newer game" under a room `FOR UPDATE` to avoid racing a rematch.
- **Open pages observing deletion:** dashboard prunes 404 rooms silently (already). Tabletop must catch 403/404 + socket `unauthorized` on a purged game and show "This game has ended and is no longer available," then route home.

---

## 7. UX plan

**7.1 Home/dashboard hierarchy.** Nav row (labels only; routes unchanged per DR‑14): Public Lobby → Create Room → Join by Code → Recovery. Large **"Tile Meld"** title. **"Create a Game"** section: Play vs Computer / **New Game** (`/rooms/new`) / **Join Room by Name** (`/rooms/join`) / **Browse Public Lobby** (`/lobby`). **"Your Games"** section below (existing `recentRooms` list, restyled as status cards).

**7.2 Game cards / status (DR‑13).** Each card: friendly room name (or `Room {code}`), players `n/capacity`, and a **status pill** = white "Open" (○, outlined) / green "In play" (▶) / grey "Completed" (✓), text + icon + accessible name, contrast-checked.

**7.3 New Game & Join-by-Name flows.** Create form: drop the display-name input (defaults to username), keep capacity/visibility/turn-limit. Join-by-Name: a **single name field works for both public and private rooms** via exact-name lookup (DR‑8, corrected) — no separate code field in the normal flow. Username claim prompt appears for legacy/nameless identities.

**7.4 Public lobby.** Show friendly `name` alongside/instead of `code`; Quick Join unchanged. Private rooms are never listed here or in any future search/autocomplete (DR‑8).

**7.5 Waiting room (corrected — Start button stays, see Amendment/DR‑9).** **Keep the host-controlled Start Game button visible.** The host may start once the existing minimum-player requirement is met; the room additionally auto-starts once it reaches its selected capacity, whichever happens first. The Ready toggle may still be simplified later (a separate, not-yet-approved decision — see DR‑10/C3), but its removal is no longer assumed here, and Start itself is not being removed. Show the shareable invite code alongside the friendly name — still useful as an internal/fallback identifier even though the normal join path no longer requires it (DR‑8).

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
- **Join authorization (corrected — DR‑8):** exact-name join succeeds for **both** public and private rooms; private room names never appear in search suggestions, autocomplete, or `GET /api/rooms/public`; existing session auth + per-endpoint rate limiting are exercised on the join-by-name endpoint.
- **Auto-start races (corrected — DR‑9):** host can still start manually once the existing minimum (≥2 ready) is met; a room additionally auto-starts on reaching its selected capacity (2/3/4) — verify **both** triggers are race-safe against each other (host clicks Start the instant the room also auto-fills → exactly one game, never two, never an incomplete start); vs-computer keeps its existing manual-start flow; preserved `/start`/`/ready` continue to work exactly as today; bot-first-turn scheduled.
- **Rematch (⚠ pending re-confirmation — see DR‑10/C3):** if a new Game-Over "Rematch" control is still built after re-confirming it's wanted, it must re-deal present members and `room_scores` must accumulate; otherwise, exercise the existing preserved `/rematch` + Start/Rematch button flow, which already works today and is not being removed.
- **Retention (controlled time, corrected to 48 h — DR‑11/12):** inject a clock/`now` param so 48 h is testable without waiting; correct bottom-up cascade (all 8 child tables gone); room deleted only when no surviving game; push_subscriptions untouched; **idempotency** (double-run safe); **concurrent-rematch guard**; purged-game deep-link → graceful 404 state.
- **Dashboard component tests:** `statusTone` mapping + labels + a11y names; nav labels/routes.
- **Playwright (desktop + Pixel 7 + iPhone 14):** new home layout & nav; New Game / Join-by-Name; auto-start replaces manual start in `two-player-smoke`, `multi-player`, `vs-computer`, `full-lifecycle`; rematch; regression for human-vs-human and vs-computer. Respect the per-IP rate-limit / patient-helper conventions in `e2e/tests/helpers.ts` (do **not** loosen prod rate limits).
- **CI:** existing gate (format/lint/typecheck/unit+integration/build + full Playwright matrix + Trivy) must stay green; expected unit/integration baseline is 366 passing — update counts as tests are added.

---

## 9. Privacy & security (explicit risk flags)

- **⚠ Private rooms are unlisted, not secret (approved, corrected — supersedes the original DR‑8 mitigation).** Exact-name lookup is now the normal private-room join path for both visibilities; the room's `code`/UUID remain as authoritative internal identifiers but are no longer required by the join UI. This is a **real reduction from the original unguessable-~10¹²-code protection** — accepted explicitly by the user, not a silent weakening. The mitigation is **exclusion, not obscurity**: private room names must never appear in search suggestions, autocomplete, public listings (`GET /api/rooms/public`), or any broad search result — enumeration is only possible by already knowing (or brute-forcing) an exact name, which existing session auth and per-endpoint rate limiting bound. Document this tradeoff clearly to the user again at Phase 3 implementation time.
- **Username enumeration / homoglyphs:** the conservative ASCII charset + NFKC/casefold canonical (DR‑2) prevents confusable-collision impersonation in V1.
- **`public_John` reveals a username↔activity link** — inherent to the requested public naming; acceptable for public rooms, minor privacy note.
- **"Permanent deletion" vs backups:** hard-deleted data persists in Render PITR/backups for 3–7 days; document that "permanent" means removed from the live DB, not instantly from backups.
- **Redaction unchanged:** no new hidden-state leakage; opponents still get rack counts only.

---

## 10. Phased Sonnet implementation plan

Each phase: one reviewable change, engine/bot stay pure, server authoritative, **stop at a manual Git checkpoint**, and **save a completion summary under `docs/`** (e.g. `docs/phase-XX-<slug>.md`). Identity/data-model prerequisites first; artwork-dependent tabletop last.

**Phase 1 — Global username identity.** *Goal:* claimable, globally-unique human username. *Files:* migration `0019`, `players.ts`, `identity.ts`, `shared/schemas/identity.ts`, web claim UI. *Migration:* players username(+canonical)+partial unique index. *Acceptance:* claim/reject/recover-retains/bot-excluded/reserved. *Tests:* §8 username+migration. *Risks:* legacy NULL handling. *Commit:* `feat(identity): globally unique human usernames`. *Checkpoint.*

**Phase 2 — Friendly room names.** *Goal:* names derived from username with race-safe numbering. *Files:* migration `0020`, `rooms.ts` repo, `http/routes/rooms.ts`, `shared/schemas/rooms.ts`, web display (dashboard/lobby/room). *Acceptance:* numbering, `public_` prefix, unique `lower(name)`, legacy fallback. *Tests:* §8 naming. *Risks:* concurrent create. *Commit:* `feat(rooms): human-readable room names`. *Checkpoint.*

**Phase 3 — Join by exact name (public + private) (corrected — DR‑8).** *Files:* `rooms.ts` repo (`findRoomByName`), route `join-by-name`, `JoinRoomPage.tsx`, schemas. *Acceptance:* exact-name join works for **both** public and private rooms; private room names never appear in search/autocomplete/public listings; existing auth + rate limiting apply; no separate code requirement in the normal flow. *Tests:* §8 join authorization. *Risks:* enumeration (mitigated by exclusion from all listings, not by secrecy — document this tradeoff at implementation time). *Commit:* `feat(rooms): join rooms by exact name`. *Checkpoint.*

**Phase 4 — Auto-start alongside the existing Start button (corrected — DR‑9).** *Files:* `http/routes/rooms.ts` (join `FOR UPDATE` + auto-deal at capacity), `games.ts`, `transactions.ts`, `WaitingRoomPage.tsx` (Start button stays visible — do **not** remove it), `gateway.ts`/`botTurn.ts` (bot-first-turn), vs-computer path. *Acceptance:* host Start still works at the existing minimum (≥2 ready); a room additionally auto-starts on reaching its selected capacity; both triggers are race-safe against each other (no double-deal, no incomplete start); `/ready`,`/start`,`/rematch` preserved and remain live, shipped UI. *Tests:* §8 auto-start races, including "host starts early, then the room later fills — no second deal." *Risks:* concurrency between manual Start and auto-fill, bot-first-turn. *Commit:* `feat(rooms): auto-start games on reaching capacity`. *Checkpoint.*

**Phase 5 — Rematch control (⚠ PENDING RE-CONFIRMATION before starting — see DR‑10/C3).** DR‑10's premise (replacing a Start/Rematch control that was being removed) no longer holds now that Phase 4 keeps that control visible. **Re-confirm with the user whether a new Game-Over "Rematch" button is still wanted at all before writing any code for this phase** — the existing, preserved Start/Rematch button in the waiting room may already fully serve this need. *Files (if re-confirmed):* Game-Over card in `TabletopPage.tsx`, `rooms.ts` `/rematch` reuse. *Acceptance (if re-confirmed):* one-click rematch re-deals present members; scores persist. *Tests:* §8 rematch. *Commit:* `feat(web): one-click rematch` (working title, pending re-confirmation). *Checkpoint.*

**Phase 6 — Home/dashboard layout + status colors.** *Files:* `RootLayout.tsx`, `HomePage.tsx`, `CreateRoomPage.tsx`, `global.css`. *Acceptance:* nav relabels (routes unchanged), Create-a-Game + Your-Games sections, white/green/grey status pills with text+icon+contrast. *Tests:* §8 dashboard + Playwright nav. *Commit:* `feat(web): dashboard layout and game-status treatment`. *Checkpoint.*

**Phase 7 — 48-hour retention sweep (corrected — DR‑11/12).** *Files:* `game/deadlineSweep.ts` (`runRetentionSweepOnce`), `index.ts` wiring, migration `0021` (index), `env.ts` (`ENABLE_RETENTION_SWEEP`, boolean), tabletop purged-game state, `.env.example`/`render.yaml`/docs. *Acceptance:* bottom-up delete at a **fixed 48-hour window** (not env-configurable — the number is a product rule), room-deletion rule (DR‑11), idempotent, concurrent-rematch-safe, flag-gated (OFF first). *Tests:* §8 controlled-time retention. *Risks:* **irreversible data loss** — ship OFF, verify in staging. *Commit:* `feat(server): 48-hour completed-game retention`. *Checkpoint.*

**Phase 8 — Tabletop layout prep (no artwork).** *Files:* `TabletopPage.tsx` + `tabletop/*`, new `assets/tabletop/` + layout-contract doc. *Acceptance:* extraneous elements removed, essentials/a11y preserved, desktop+mobile hierarchy, slot contract defined. *Tests:* tabletop essentials + accessibility specs still pass. *Commit:* `refactor(web): tabletop information hierarchy`. *Checkpoint.*

**Phase 9 — Apply artwork layout (BLOCKED on artwork).** Do not start until the reference is supplied; then map the defined slots to the artwork layout only (no theme/graphics upgrade). *Commit:* `feat(web): adopt tabletop artwork layout`. *Checkpoint.*

---

## 11. Deployment and rollback plan

- **Migration order:** `0019` (username) → `0020` (room name) → `0021` (retention index). All additive/expand-compatible, run pre-traffic via Render `preDeployCommand`.
- **Feature flags (corrected):** **`ENABLE_RETENTION_SWEEP`** (boolean; default `false`) — **deploy OFF**, verify in staging, then enable. The 48-hour retention window itself is a fixed code constant, not env-configurable (DR‑12). Auto-start is additive to the existing, still-visible Start button (DR‑9) — no flag needed for either; `/start` is a live, shipped control, not a fallback.
- **Safe rollout:** ship Phases 1–2 (data model) first and confirm green before behavior changes; retention last and gated.
- **Existing-room compatibility:** legacy rooms → `Room {code}`; legacy players prompted to claim username; preserved `/ready`,`/start` keep old flows working, and `/start`'s UI control is not being removed (DR‑9).
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
3. **✅ Private-room join model (DR‑8, approved — supersedes the original recommendation):** private rooms are joined by exact name alone, no code required in the normal flow; "private" means unlisted (excluded from search/autocomplete/public listings), not secret.
4. **✅ Starting games (DR‑9, approved — supersedes the original recommendation):** the host-controlled Start button stays visible (host may start once the existing minimum is met); a room additionally auto-starts on reaching its selected capacity; vs-computer keeps its existing manual-start flow.
5. **⚠ Rematch (DR‑10, conflicts `D-REMATCH`) — PENDING RE-CONFIRMATION, premise changed:** originally a single "Rematch" button on Game Over, written to replace the Ready/Start controls that were then planned for removal. Since the corrected starting-games decision (item 4) keeps those controls visible, **re-confirm with the user whether this is still wanted at all before Phase 5** — do not implement it as originally written.
6. **✅ Retention (DR‑11/12, conflicts `D-RETAIN`) — approved at 48 hours (corrects an original 4-hour recommendation):** delete game detail at `completed_at + 48 h`; delete room + `room_scores` when no surviving game; feature-gated (`ENABLE_RETENTION_SWEEP`, boolean), OFF first, forward-only; the 48-hour window is a fixed product rule, not user-selectable; **irreversible past the backup window; cumulative room scores die with the room.**
7. **Dashboard status (DR‑13) & nav labels keep routes (DR‑14).**

**Recommended first Sonnet phase:** Phase 1 — Global username identity (prerequisite for everything else). *(Completed — see `docs/phase-01-global-username.md`. Phase 2 — Friendly room names — is also complete, see `docs/phase-02-friendly-room-names.md`. Phase 3 must use the corrected DR‑8 above, not the original.)*
