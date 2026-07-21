# Phase 6 — Home Dashboard Layout and Game Status Cards

> Completion summary for Phase 6 of `docs/next-changes-implementation-plan.md`
> (Identity, Room Naming, Auto-Start, Retention & Layout). Implemented on
> branch `feature/identity-room-lifecycle-v2`, on top of Phase 1 (`13b8323`),
> Phase 2 (`17cdb0a`), Phase 3 (`779f55d`), Phase 4 (`aae2c05`), and Phase 5
> (`d23e7ce`). Later phases (48-hour retention, tabletop layout/artwork) were
> **not started**.

## Goal

Turn the existing Home page into a clearer dashboard — a large page title,
a distinct "Create a Game" section, a "Your Games" section of status cards
with an authoritative Open/Active/Completed/Resigned/Ended classification
that never relies on color alone — without starting the later retro
Mahjong/Konami visual-theme or tabletop redesign.

## Files changed

**Server**

- `apps/server/src/db/repositories/games.ts` — `findGameSeatForPlayer` now
  also returns the seat's `status` (`active`/`resigned`), not just its
  `seatIndex`. Purely additive; every existing caller only ever destructured
  `.seatIndex`.
- `apps/server/src/http/routes/rooms.ts` — `GET /api/rooms/:id` gains four
  new response fields (see "Server/API/schema changes" below). No new
  endpoint, no new route.

**Shared**

- `packages/shared/src/schemas/rooms.ts` — `GetRoomResponseSchema` gains
  `latestGameStatus`, `selfSeatStatus`, `hasComputer`, `lastActivityAt`,
  reusing the existing `GameStatusSchema`/`SeatStatusSchema` from
  `schemas/game.ts` rather than redefining them.

**Web**

- `apps/web/src/dashboard/dashboardStatus.ts` (new) — the one shared,
  pure, thoroughly-tested status-classification rule (`classifyRoomStatus`)
  and destination rule (`dashboardCardHref`).
- `apps/web/src/dashboard/GameStatusCard.tsx` (new) — the presentational
  card: a single link (or, for the rare "nothing left to show" case, a
  plain non-interactive card), never an interactive element nested inside
  another one.
- `apps/web/src/state/relativeTime.ts` (new) — a small, pure
  "N minutes/hours/days ago" formatter for each card's last-activity line.
- `apps/web/src/pages/HomePage.tsx` — rewritten: large `Tile Meld` H1,
  "Create a Game" and "Your Games" as their own `<h2>`-headed sections,
  relabeled actions, a dashboard grid of `GameStatusCard`s, and a genuine
  API-error state (previously a failed room fetch just left the page stuck
  on "Loading" forever with an unhandled rejection).
- `apps/web/src/layout/RootLayout.tsx` — added an explicit "Home" nav link
  (`to="/"`) ahead of the existing links; every existing nav label/route is
  unchanged (see "Navigation" below).
- `apps/web/src/styles/global.css` — added `.dashboard-title`,
  `.dashboard-grid`, `.dashboard-card` + its three tone modifiers
  (`--neutral`/`--active`/`--grey`), and `.status-badge` + its three tone
  modifiers. No new dependency, no new component library.

**Tests** (see "Tests added" below)

**E2E** — `e2e/tests/helpers.ts`, `vs-computer.spec.ts`, `rematch.spec.ts`,
`reconnect-recovery.spec.ts` updated for the renamed page heading (see
"Known limitations" for why this was unavoidable); new
`e2e/tests/dashboard.spec.ts`.

No database migration — every field the dashboard needed already existed
in `rooms`/`games`/`game_seats` (`has_computer`, `last_activity_at`,
`games.status`, `game_seats.status`); this phase only had to expose them.

## Previous Home layout

A single unstructured `<h1>Your games</h1>` at the top, immediately
followed by the room list (or a loading/empty message), then a
username-claim prompt, then a `<div className="row">` of four actions
(Play vs Computer, "Create a room", "Join Room by Name", "Browse public
lobby") below the list — i.e. the room list was *above* the creation
actions, with no section headings distinguishing the two areas at all.
Each room's status was a single line of plain text
(`"{n}/{capacity} players -- {statusLabel}"`) with no visual distinction
between an open, active, or finished room whatsoever, and a failed room
fetch left the page silently stuck on "Loading your rooms…" forever.

## New dashboard hierarchy

```
<h1 class="dashboard-title">Tile Meld</h1>          <- large, prominent (2.5rem)
<p>…asynchronous…</p>

<h2>Create a Game</h2>
  [username-claim prompt, if none claimed]
  [Play vs Computer (beta)] [New Game] [Join Room by Name] [Browse Public Lobby]
  [bot error banner, if any]
  <p>Play vs Computer sets up…</p>

<h2>Your Games</h2>
  loading state | error banner | empty state | <ul class="dashboard-grid"> of GameStatusCards
```

Top navigation (`RootLayout.tsx`) is unchanged in position and every
existing label/route; only a new "Home" link was added. Both headings are
real `<h1>`/`<h2>` elements (not styled `<div>`s), keeping semantic heading
order intact — verified directly by the existing axe accessibility scan on
Home (`e2e/tests/accessibility.spec.ts`), which still passes.

## Authoritative status mapping

One function, `classifyRoomStatus` (`apps/web/src/dashboard/
dashboardStatus.ts`), maps the repository's real status vocabulary onto
the five user-facing labels the plan specifies. It takes only primitives
the server already returns authoritatively — nothing here infers state
client-side:

| `rooms.status` | latest game | → label | tone |
| --- | --- | --- | --- |
| `closed` / `abandoned` | (any) | **Ended** | grey |
| `in_game` | active, by definition | **Active** | green |
| `open` | none dealt yet | **Open** | white/neutral |
| `between_games` | completed, caller's own seat `resigned` | **Resigned** | grey |
| `between_games` | completed, caller's own seat not resigned (or no seat data) | **Completed** | grey |

No new persisted room status was invented — `closed`/`in_game`/
`between_games`/`open`/`abandoned` are exactly the five existing
`rooms.status` values (`apps/server/src/db/types.ts`). `closed` is a real,
defined value with **no production code path that sets it today**
(reserved for a possible future host-close action); it is mapped to Ended
defensively so this classifier needs no change if that path is ever added.

**Priority is current-state-first, never stale history** — every input
above is evaluated against the room's *latest* game only:

- A terminal room (`closed`/`abandoned`) is always **Ended**, regardless of
  how its last game went.
- A currently active game — including a **freshly-dealt rematch** — is
  always **Active**, even if the same player resigned from an *earlier*
  game in the same room, because `latestGameId`/`selfSeatStatus` are always
  the current latest game's, never a stale one. There is no "was resigned"
  history field for the classifier to be confused by.
- `Resigned` applies only to the *latest completed* game's outcome for the
  *current* player — never a roommate's, and never an older game's.

Verified directly: `apps/web/test/dashboardStatus.test.ts` (16 tests,
including one asserting every one of the five `rooms.status` values maps
to exactly one of the five labels, and one asserting a fresh rematch
overrides a prior resignation) and
`apps/server/test/http/rooms.test.ts`'s new "Phase 6 dashboard read-model
fields" describe block (10 tests) confirming the server-side primitives
themselves are computed correctly for every one of these scenarios against
a real database.

## Server/API/schema changes

`GET /api/rooms/:id` (unchanged URL, unchanged auth, unchanged rate limit)
now additionally returns:

| Field | Type | Meaning |
| --- | --- | --- |
| `latestGameStatus` | `"active" \| "completed" \| null` | The latest game's own status; `null` if no game has ever been dealt. |
| `selfSeatStatus` | `"active" \| "resigned" \| null` | **The calling player's own seat status** in the latest game specifically; `null` if they were never seated in it. Never exposes anyone else's seat status. |
| `hasComputer` | `boolean` | Whether this room has a computer member (Play vs Computer). |
| `lastActivityAt` | `string` (ISO) | The room's `last_activity_at`, for the card's "last activity" line. |

All four are read from data that already existed (`games.status`,
`game_seats.status` for the caller's own seat, `rooms.has_computer`,
`rooms.last_activity_at`) — no new query shape beyond one additional
`findGameSeatForPlayer` lookup scoped to the caller's own player id, and no
new endpoint. This directly follows the phase's explicit instruction to
avoid a new endpoint when the existing per-room response is the right
place to add fields.

## Game-card destination rules

The second half of `dashboardStatus.ts`, `dashboardCardHref`, derives the
one useful link for a card in a given status — always the room's own
`latestGameId`/`roomId`, never any other identifier:

| Status | Destination |
| --- | --- |
| Open | the Waiting Room (`/rooms/:roomId`) |
| Active / Completed / Resigned | the latest game (`/games/:latestGameId`) — the game's own `status` (active/completed) determines whether the player lands on the live table or its Game Over screen |
| Ended, with a surviving completed game | that game (`/games/:latestGameId`) |
| Ended, with no surviving game | `undefined` — the card renders a plain, non-interactive "This room is no longer available." message instead of a broken link |

Since a card's link is always literally the room's current `latestGameId`,
this can never point at a stale game a since-superseded rematch left
behind.

## Username gating behavior

Unchanged: `HomePage` still reads `authState.username`, still disables
Play vs Computer and shows "Claim a username… to get started" when none is
claimed, and still links to `/recovery`. The new dashboard layout moves
this prompt inside the "Create a Game" section (directly above the action
row it gates) rather than below the room list, but the gating logic itself
is byte-for-byte the same conditional as before.

## Accessibility and responsive behavior

- **Semantic heading order**: `<h1>` (page title) → `<h2>` × 2 (section
  headings) → card content has no heading of its own (a card's room name
  is a `<strong>`, not a heading, to avoid a third heading level competing
  with the two section headings for a screen-reader's heading-navigation
  list).
- **Keyboard-accessible cards**: every card is a single real `<a>` (React
  Router `Link`) — never a `<button>` nested inside a link (an
  interactive-in-interactive anti-pattern the *old* HomePage's room-list
  items actually had, `<Link><button>…</button></Link>`, not perpetuated
  here). Verified directly: `apps/web/test/HomePage.test.tsx`'s "a card is
  a real, keyboard-focusable link with a meaningful accessible name" test
  tabs through the page and confirms the card itself receives focus.
- **Visible focus treatment**: unchanged global `:focus-visible` rule
  applies to every card/button/link exactly as it already did everywhere
  else in the app — no new focus styling was needed or added.
- **Status text, never color alone**: every card always renders its status
  as a literal text badge ("Open"/"Active"/"Completed"/"Resigned"/"Ended")
  in addition to its tone — verified directly in both the web unit tests
  and the E2E dashboard spec.
- **No hover-only information**: every piece of card content (name,
  status, member count/capacity, visibility, computer indicator, last
  activity) is always-rendered static text, nothing appears only on
  `:hover`.
- **Contrast**: the status badge is given its own **opaque background**
  (`var(--color-bg)`, the page background) rather than transparent, so its
  text keeps the same contrast ratio regardless of which tinted card it
  sits on top of — it never inherits a tinted card background that could
  reduce contrast. Tone tints reuse the same `color-mix(...)`-against-
  `--color-bg` pattern already established (and already contrast-checked)
  for `.error-banner`/`.warning-banner`.
- **Responsive, no horizontal overflow**: `.dashboard-grid` uses
  `grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))` — a card
  is never wider than its column (`1fr` max), so the grid collapses to a
  single column on a narrow phone viewport instead of ever forcing
  overflow. Verified directly at 390×844 (a representative narrow-phone
  viewport) in `e2e/tests/dashboard.spec.ts`.
- **Reduced motion**: no new animation/transition was introduced; the
  existing global `prefers-reduced-motion` rule needed no changes.
- **Current accessible names preserved**: every existing nav link, page
  heading (other than the deliberately-changed Home page title itself,
  see "Known limitations"), and button label used elsewhere in the app is
  untouched.
- **No new component library or styling dependency** — everything above
  is plain CSS added to the existing `global.css` design-token system.

## Tests added

Server (**+10 net**): `apps/server/test/http/rooms.test.ts`'s new "GET
/api/rooms/:id -- Phase 6 dashboard read-model fields" describe block —
open-room classification; active room via capacity auto-start; a
completed game the player finished without resigning; the player's own
resignation from the latest completed game (and that it never leaks onto
the *other* player's `selfSeatStatus`); an active rematch overriding a
prior resignation/completion for the same room; a terminal (abandoned)
room; a Play vs Computer room's `hasComputer`; visibility correctness for
both a public and a private room belonging to the same player; a legacy
room with `name = null`; selecting the highest-`seq` game as `latestGame`
across multiple game sequences; confirming a non-member never receives
room data and that no recovery secrets/session tokens/rack contents ever
appear in the response body. Two of the pre-existing GET tests also gained
assertions for the four new fields.

Shared (**+0 net new test, 1 fixture fix**): `packages/shared/test/
schemas.test.ts`'s `GetRoomResponseSchema` fixture updated for the four
new required fields.

Web (**+36 net**, 90 → 126):

- `apps/web/test/dashboardStatus.test.ts` (new, 16 tests) — every label/
  tone combination in the mapping table above; the rematch-overrides-
  resignation priority rule; every `dashboardCardHref` destination,
  including the Ended-with-no-surviving-game `undefined` case and a
  direct assertion that the function never returns any game id other than
  the room's own `latestGameId`.
- `apps/web/test/relativeTime.test.ts` (new, 6 tests) — "just now",
  minute/hour/day pluralization and thresholds, never a negative duration,
  and a malformed-timestamp fallback that doesn't throw.
- `apps/web/test/HomePage.test.tsx` (rewritten/expanded) — the large
  Tile Meld heading; both section headings; every exact action label
  (`New Game`/`Join Room by Name`/`Browse Public Lobby`) plus Play vs
  Computer retained; a real loading state (using a controlled, unresolved
  promise); the empty state; a genuine API-error state (a non-404/403
  `getRoom` rejection); friendly-name and legacy `Room {code}` fallback;
  one test per status (Open/Active/Completed/Resigned/Ended, including
  both the "Ended with a surviving game" and "Ended with none" cases) each
  asserting the visible status text, the `dashboard-card--*` tone class,
  and the link's `href`; the active-rematch-overrides-history scenario;
  status text present independent of styling; keyboard-tab reachability
  and accessible name; and the pre-existing Play vs Computer/username-
  gating tests, unmodified in substance.

## Quality-gate results

Run from the existing local Postgres 16 (`tile-meld-db-1`, already
migrated — no new migration in this phase):

| Step | Result |
| --- | --- |
| `pnpm run format:check` | **Pass** |
| `pnpm run lint` | **Pass** — 0 issues |
| `pnpm run typecheck` (all 6 workspace projects, incl. `e2e`) | **Pass** |
| `pnpm run test` | **Pass — 590/590** (shared 38, engine 115, bot 36, web 126 — up from 90, server 275 — up from 264) |
| `pnpm run build` | **Pass** (web + server) |

## Chromium E2E results

| Spec | Tests | Result | Covers |
| --- | --- | --- | --- |
| `dashboard.spec.ts` (new) | 7 | **7/7 pass** | empty state + full hierarchy for a new user; username-gated actions; New Game/Join Room by Name/Browse Public Lobby navigation; Open→Active via manual early start; Active via capacity auto-start; Completed vs. Resigned for the two different players in the same finished game, then a rematch flipping the same room's card back to Active for both; a Play vs Computer room's card; a 390×844 mobile viewport with no horizontal overflow |
| `accessibility.spec.ts` | 7 | **7/7 pass** | axe scan on every screen, including the redesigned Home dashboard, with 0 serious/critical violations |
| `multi-player.spec.ts` | 3 | **3/3 pass** | 3-/4-player auto-start + manual early-start regression, unaffected by this phase |
| `public-lobby.spec.ts` | 1 | **1/1 pass** | public lobby / Quick Join regression |
| `full-lifecycle.spec.ts` | 1 | **1/1 pass** | the older Waiting-Room-based Ready/Start/rematch path, unchanged regression |
| `vs-computer.spec.ts` | 2 | **2/2 pass** | Play vs Computer regression, including the renamed `waitForReady` heading target |
| `reconnect-recovery.spec.ts` | 2 | **2/2 pass** | reconnect/recovery regression, including the renamed heading target |
| `rematch.spec.ts` | 2 | **2/2 pass** (see note below) | Phase 5's one-click rematch, unaffected by this phase |

25/25 pass. One `rematch.spec.ts` test failed once when run as part of a
single 18-test combined batch immediately after the other regression specs
above (a `claimUsername` step timed out waiting on the always-present
"Recovery" nav link, with a `ws proxy socket error: ECONNRESET` logged by
the Vite dev server at the same moment) and passed cleanly when the file
was re-run by itself — consistent with this suite's documented per-IP
rate-limit/long-batch flakiness characteristics (see `HANDOFF.md` and the
identical pattern already noted in `docs/phase-04-auto-start.md` for
`reconnect-recovery.spec.ts`), not a Phase 6 regression: nothing this phase
changed touches `claimUsername` or the nav's Recovery link.

One genuine bug surfaced and was fixed during this phase's own E2E
authoring (not a regression in *existing* specs, a bug in the *new*
`dashboard.spec.ts` itself): asserting on the dashboard immediately after
clicking the nav's "Tile Meld" link right after a rematch's own
`navigate()` call raced react-router's route-element reuse (the same
`/games/:gameId` route element is reused across a `gameId` param change,
rather than being unmounted/remounted) and intermittently failed to leave
the tabletop route. Fixed by using `page.goto("/")` at that one call site
instead of a nav-link click, which sidesteps the race with a fresh
navigation. Not run: the full five-project matrix (Firefox/WebKit/mobile)
— per the plan, that runs before merge, not during implementation.

## Known limitations

- **The Home page's `<h1>` text itself changed**, from "Your games" to
  "Tile Meld" (with "Your Games" becoming a `<h2>` section heading below
  it) — a deliberate, explicitly-required change (`#2`: "a larger,
  prominent Tile Meld page heading"), not an oversight. Because
  `e2e/tests/helpers.ts`'s `waitForReady` — used at the start of nearly
  every E2E spec — waited on that exact former heading text, this required
  updating `waitForReady` plus three spec files that separately asserted
  the same old heading (`vs-computer.spec.ts`, `rematch.spec.ts`,
  `reconnect-recovery.spec.ts`) to wait on the new `<h1>Tile Meld</h1>`
  instead. This is the one place this phase's required layout change had
  a wider blast radius than its own files; every other existing nav
  label/button text/route was deliberately left untouched (see
  "Navigation" below).
- **The top nav's "Create Room" link label was deliberately left
  unchanged**, even though the dashboard's own action button now reads
  "New Game" for the same destination. The phase instructions explicitly
  allow this ("New Game **or existing Create route label, where
  appropriate**"), and renaming the nav link would have required updating
  half a dozen E2E helpers/specs that click it by name
  (`e2e/tests/helpers.ts`, `multi-player.spec.ts`, `public-lobby.spec.ts`,
  `accessibility.spec.ts`) purely for label consistency, with no
  functional benefit — a change judged out of proportion to what was
  asked. Both labels lead to the exact same `/rooms/new` route (DR-14:
  routes unchanged, labels only), so there is no competing-navigation
  *behavior*, only a minor label difference between the nav and the
  dashboard's own action row.
- **No lifetime statistics, rankings, or cross-room totals** were added —
  explicitly out of scope.
- **Retention/deletion, tabletop redesign, and the retro visual theme**
  were not started, per explicit scope exclusion — see "Confirmation"
  below.
- **The dashboard's ordering is still whatever `recentRooms`
  (client-side localStorage recency) already produced** — there is still
  no server "list my games" endpoint to order by, and the phase
  instructions explicitly excluded adding client-side search/filter/
  pagination/tabs, so no new ordering logic of any kind was introduced.

## Confirmation: Phase 7 and later phases not started

No work was done on 48-hour retention/deletion/cleanup sweeps, tabletop
information-hierarchy changes, artwork placement, the retro Mahjong/
Konami theme, tile redesign, room search/autocomplete, login/social
accounts, or rankings/lifetime statistics. `packages/engine` and
`packages/bot` were not modified. Ready and Start were not removed or
hidden anywhere; rematch business rules (Phase 5) are unchanged.
