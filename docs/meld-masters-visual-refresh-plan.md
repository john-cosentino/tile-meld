# Meld Masters visual refresh — master implementation plan

> Status: **planning document — no implementation has started.**
> Prepared 2026-07-26 against `main` @ `4cf3f2b`. The executor is Claude
> Sonnet, working one approved phase at a time (see §17, "Sonnet handoff
> instructions"). Nothing in this document overrides
> `docs/opus-implementation-plan.md`'s confirmed Decisions except where a
> decision entry in §15 explicitly says so and is approved by the user.

---

## 1. Executive summary

This plan turns the publicly presented game **Tile Meld** into **Meld
Masters**: a public rename, a retro-arcade visual transformation matching the
four approved concept images in `docs/design-reference/meld-masters/`, and a
replacement smartphone/PWA icon pipeline — while preserving every behavior,
rule, accessibility guarantee, and deployment property the app has today.

The repository was explicitly built for this. `packages/shared/src/branding.ts`
centralizes the product name and tile palette (opus plan §10.4, Decision
D-BRAND); `docs/tabletop-layout-contract.md` pre-defines named artwork slots
with binding asset-safety rules; the styling system is one hand-editable
global stylesheet with CSS custom properties; and the test suite asserts on
roles and accessible names, not on visual structure — so restyling is cheap
and renaming is a bounded, known blast radius (1 unit test, 2 server test
literals, ~26 e2e assertions concentrated in one helper plus five spec files).

**The work is eight phases plus a baseline phase**, ordered so that the rename
(pure text, big test churn) lands first, the token/CSS foundation second, and
asset-dependent work (portraits, logo/icons) last. The reference-material
blockers identified during planning were resolved on 2026-07-26 (§2); the
only remaining external dependency is the production portrait artwork for
Phase 5 (Blocker B3).

What this plan deliberately does **not** do: rename internal identifiers
(`@tile-meld/*` package scopes, the repository directory, Render service
names, database names, cookies, localStorage keys), rewrite game logic,
restructure the DOM, or add concept-art features the game does not have
(scores, seasons, XP, coins, friends, move log, per-second turn timers).
§5 and §15 justify each exclusion.

---

## 2. Planning blockers and their resolution status

The task brief listed five expected reference files. The directory contents
differ in naming but, as of 2026-07-26, the full reference set is present:

| Expected file | Status |
| --- | --- |
| `meld-masters-concept-01.png` | ✅ Present (1448×1086, desktop game screen) |
| `meld-masters-concept-02.png` | ✅ Present (1448×1086, desktop lobby/dashboard) |
| `meld-masters-concept-03.png` | ✅ Present (941×1672, phone-portrait game screen) |
| `meld-masters-portrait-correction.png` | ✅ **Resolved as `meld-masters-concept-04.png`** (941×1672) — the user confirmed on 2026-07-26 that concept-04 IS the portrait-correction reference. Wherever the character styling of 03 and 04 differ, **04 takes precedence.** |
| `meld-masters-logo.png` | ✅ **Resolved as `meld-masters-concept-logo.png`** (1254×1254, RGB, no alpha) — supplied by the user on 2026-07-26. Note the actual filenames differ from the brief's expected names; all references in this plan use the on-disk names. |

**~~BLOCKER B1 — logo asset~~ RESOLVED 2026-07-26.**
`meld-masters-concept-logo.png` is the approved logo master. Important
finding: it is an **icon-style monogram mark** (see §4), not the "MELD
MASTERS" chrome-text logotype rendered inside the concept screens. This is
ideal for Phase 6 (icon pipeline), and it means the header wordmark remains
the **typographic live-text treatment** (which the asset contract requires
for the header anyway) — the logotype styling in the concept screens guides
that typography. The monogram may additionally appear as a small decorative
header emblem (`alt=""`), at the user's option during Phase 2 review.

**~~BLOCKER B2 — portrait-correction identity~~ RESOLVED 2026-07-26.**
Confirmed by the user: concept-04 is the portrait correction.

**BLOCKER B3 — portrait source assets. STILL OPEN.** The concept images
embed portraits at small sizes inside full screens; they are not extractable
production assets. Original portrait artwork satisfying the contract in §9.3
must be supplied and approved before Phase 5 implementation. Sonnet must not
generate, trace, or crop portraits out of the concept screens. Phase 5 is
the only phase gated on this.

Additionally: `docs/design-reference/` is currently **untracked**. Phase 0
commits it (all five files) so the reference set is versioned and
tamper-evident.

---

## 3. Verified repository findings

Everything in this section was read from files or observed in command output
on 2026-07-26 during planning. Items marked *(assumption)* are inferences.

### 3.1 Baseline

- Branch `main`, HEAD `4cf3f2b273808d265bb5863e5b85538fdf9e48e8`
  ("Add Claude Code permission settings"), in sync with
  `origin/main` (`git@github.com:john-cosentino/tile-meld.git`).
- Worktree clean **except** untracked `docs/design-reference/` (the four
  concept PNGs).
- `docs/task.md`: "no active task." `docs/current-state.md` (verified
  2026-07-25): full gate green at `7d6248a` — format, lint, typecheck,
  663 unit/integration tests across 65 files, build. The Playwright e2e
  matrix was *not* run at that verification; Render deploy state unknown.

### 3.2 Frontend stack

- React 19 (StrictMode ON) + Vite 6 + `react-router-dom` 7 (declarative
  routes) + `@dnd-kit/core` 6 + `socket.io-client`. No UI kit, no icon
  library, no CSS framework, no state library.
- **Styling = one global stylesheet**, `apps/web/src/styles/global.css`
  (446 lines), with CSS custom properties in `:root`: colors
  (`--color-bg/surface/border/text/text-muted/accent/danger/success/warning`),
  radii, `--space-1..8` (5 and 7 unused), `--shadow-sm`, `--font-sans`
  (system stack only; no font files, no external requests of any kind in
  `index.html`). Dark mode = a 5-token override under
  `@media (prefers-color-scheme: dark)`. No theme toggle.
- Tile colors live in `packages/shared/src/branding.ts` (`TILE_COLOR_TOKENS`:
  C1 Crimson `#B3261E` ●, C2 Cobalt `#1957A6` ■, C3 Fern `#256B37` ▲,
  C4 Gold `#8A6314` ◆; `JOKER_GLYPH` ★), injected as `--tile-color-*`
  custom properties by `apps/web/src/styles/applyBrandingTokens.ts` — but
  those properties are **never read by any CSS rule**; `Tile.tsx` applies the
  hex inline. The tile body is a hardcoded `#fffdf7` ivory in `global.css`
  (`.tile`), documented as the surface the four hexes clear WCAG AA against.
- Exactly **one width breakpoint** (`max-width: 860px`, collapses the
  tabletop's two-column grid to one). Same DOM at every viewport — an
  explicit, documented decision. `.page { max-width: 960px }`.
  Global `prefers-reduced-motion: reduce` rule clamps all animation/
  transition durations to 0.001ms with `!important`.
- Routes: `/` (HomePage), `/rooms/new`, `/rooms/join`, `/lobby`,
  `/rooms/:roomId` (waiting room), `/games/:gameId` (tabletop), `/recovery`.
  **No catch-all 404 route**; unknown URLs render layout chrome with an empty
  main. Completed/rematch is a state of TabletopPage, not a route. There is
  **no scoreboard/results UI** anywhere (no scores exist in the game model).

### 3.3 Branding centralization (partial)

`PRODUCT_NAME = "Tile Meld"` in `packages/shared/src/branding.ts:13` is
consumed in only 5 places (`RootLayout.tsx` ×3: loading text, error `<h1>`,
header link; `HomePage.tsx` ×2: `<h1>` and body copy). **Five sites bypass
it** with hardcoded literals:

1. `apps/web/index.html:13` — `<title>Tile Meld</title>`
2. `apps/web/public/manifest.json` — `"name"` / `"short_name"`
3. `apps/web/public/sw.js:16` — push notification fallback title
4. `apps/server/src/realtime/gateway.ts:181,206` — push bodies
   ("It's your turn in Tile Meld." / "Your turn in Tile Meld ends soon.")
5. `apps/web/src/pages/TabletopPage.tsx:109,118` — two visually-hidden
   `<h1>Tile Meld</h1>` (not-found and loading states)

### 3.4 Icon / PWA reality

- `apps/web/public/` contains exactly: `apple-touch-icon.png` (180×180),
  `icon-192.png`, `icon-512.png` (both `purpose: "any"`), `manifest.json`,
  `sw.js`. No `favicon.ico`, no SVG icon, **no maskable icon**, no OG/social
  image, no `<meta name="description">`.
- Current icon art: a flat `#2f6fb4` blue rounded square containing an ivory
  tile with a dot and the numeral 7. That is the entire current brand mark.
- `manifest.json`: `display: standalone`, `theme_color #2f6fb4`,
  `background_color #ffffff`. `#2f6fb4` is duplicated in `index.html`'s
  `theme-color` meta and `global.css`'s `--color-accent` with no single
  source.
- `sw.js` is **push-only** — registered by `usePushSubscription.ts`, caches
  nothing, calls `skipWaiting()`/`clients.claim()`; hardcodes
  `icon`/`badge: "/icon-192.png"`, `tag: "tile-meld"`, title "Tile Meld".
- Production serving: the Fastify server serves `apps/web/dist` via
  `@fastify/static` with defaults — effectively `max-age=0` + ETag
  revalidation on every request. Vite hashes JS/CSS bundles;
  **`public/` files (icons, manifest, sw.js) are copied verbatim, unhashed**.
  Caddy (VPS path) is a pure `reverse_proxy` + gzip — no caching headers.
  So changed icon *bytes* propagate on next load at the HTTP layer; the real
  staleness risk is browser/OS-level favicon and installed-PWA icon caching
  (§9.4, R7).

### 3.5 Test and build commands (authoritative)

- Gate: `pnpm run format:check` && `pnpm run lint` && `pnpm run typecheck` &&
  `pnpm run test` && `pnpm run build` (root).
- **`pnpm run test` includes `apps/server`, whose tests truncate every table
  in the database they reach. `TEST_DATABASE_URL` (and `DATABASE_URL`) must
  point at `tilemeld_test` first — always.** Web-only iteration can use
  `pnpm --filter @tile-meld/web test` (jsdom, no DB).
- E2E: `cd e2e && npx playwright test` (~30 min, 5 projects — chromium,
  firefox, webkit, mobile-chrome/Pixel 7, mobile-webkit/iPhone 14,
  `workers: 1` against a shared rate-limit bucket; runs against the **Vite
  dev server**, not the production build). Single project:
  `npx playwright test <spec> --project=chromium`.
- CI (`.github/workflows/ci.yml`): checks job (gate), e2e matrix job,
  security job (`pnpm audit`, Docker build + Trivy).
- Prettier checks all tracked non-Markdown text files; new JSON/CSS/TS/HTML
  must be Prettier-formatted or CI fails. Images are ignored. No git hooks.

### 3.6 Accessibility and test posture (what protects the redesign)

- axe (serious/critical = fail) runs in e2e on Home, Create Room, Join Room,
  Public Lobby, Recovery, Waiting Room, Tabletop, plus a 390px-wide mobile
  scan asserting zero horizontal overflow.
- Component tests are role/accessible-name based; **zero snapshot tests**.
  Restyling with CSS does not break them; renaming or rewording does.
- Existing a11y machinery to preserve: app-wide polite live-region announcer,
  chat `role="log"`, skip link, `:focus-visible` outline, keyboard
  select-then-place path for tiles (every tile is a real `<button>`;
  drop zones become Enter/Space-activatable when a tile is selected),
  `aria-pressed` toggles, "never color alone" (tile symbols ● ■ ▲ ◆ ★, badge
  text, set validity text labels).
- Known pre-existing a11y gaps (not caused by, and not required to be fixed
  by, this refresh — but Phase 7 may cheaply improve two of them): skip link
  has no `:focus` reveal style; bare meaning-bearing emoji (🤖 ⏳ 🟢 🔴) in
  OpponentStrip/status; no route-change focus management; no error boundary.

### 3.7 Renaming blast radius (exact, verified)

Unit: `apps/web/test/HomePage.test.tsx:89-91` (h1 "Tile Meld");
`apps/server/test/push/pushSender.test.ts:80,98` (push body literals).
E2E: `e2e/tests/helpers.ts:158` (`waitForReady()` waits on the h1 — **gates
nearly every spec**); `dashboard.spec.ts` (19 occurrences: 2 heading
assertions + 17 uses of the header link `{ name: "Tile Meld" }` as the
go-home navigation primitive); `vs-computer.spec.ts:25-26`;
`rematch.spec.ts:70-71`; `purgedGame.spec.ts:36`;
`reconnect-recovery.spec.ts:79`.

Sweep gotcha: `packages/bot/src/candidates.ts` is misdetected as binary by
plain `grep` — any leftover-name verification must use `git grep` (or
`grep -a`), which handles it correctly.

---

## 4. Approved visual-reference inventory

All four images were visually inspected during planning.

| File | Size | What it shows |
| --- | --- | --- |
| `meld-masters-concept-01.png` | 1448×1086 | **Desktop game screen.** Chrome-gradient MELD MASTERS logotype top-center with tagline "STRATEGY. COMBINE. CONQUER." Left column: "ARCADE LEAGUE / SEASON 1" plaque and four framed pixel-art player portraits (YOU/RICO/PIXIE/T-BONE) with cyan score readouts, each panel outlined in a distinct neon color (gold/purple/pink/green). Center: "ON THE TABLE" trapezoid board on a dark-navy perspective grid; melds grouped under small captions ("RUN OF 3", "SET OF 4"); ivory tiles with colored numerals over colored geometric symbols (♦ ● ▲ ■). "YOUR RACK" strip beneath with "TILES LEFT: 10 / POSSIBLE MELDS: 3" counters. Bottom: four large arcade buttons — DRAW / PASS / SORT / COMMIT TURN (orange emphasis on commit). Right column: round/target plaque, "YOUR TURN" timer with segmented digital readout, "MOVE LOG" panel, "HOW TO PLAY" panel with a small robot mascot. |
| `meld-masters-concept-02.png` | 1448×1086 | **Desktop lobby/dashboard.** Same logotype. Left: stacked neon action buttons — QUICK JOIN, CREATE ROOM, JOIN BY CODE, HOW TO PLAY, OPTIONS, EXIT GAME — each with an icon and subtitle, each in its own accent color. Center: "ROOM BROWSER" table (name / mode / round / players / ping) with a gold-highlighted selected row and pagination. Right: YOUR PROFILE panel (portrait, rank, rating), WEEKLY SHOWDOWN promo, FRIENDS list with presence dots. Bottom: NOTICE BOARD, SEASON 1 PROGRESS with level star and reward locks, DAILY BONUS chest, TIP ticker, currency counters. |
| `meld-masters-concept-03.png` | 941×1672 | **Phone-portrait game screen.** Single column: logo header with hamburger + gear; a two-player scoreboard row (YOU and RICO portraits flanking round/target readouts); "ON THE TABLE"; "YOUR RACK"; MOVE LOG beside a robot-mascot callout ("NICE SEQUENCE! YOU'RE ON FIRE!"); 2×2 arcade action buttons; ARCADE LEAGUE footer. |
| `meld-masters-concept-04.png` | 941×1672 | Same composition as 03 with **revised character headshots** (more detailed rendering, corrected expressions/costumes). **Confirmed by the user (2026-07-26) as the portrait-correction reference: its character styling supersedes 01–03 wherever they differ.** |
| `meld-masters-concept-logo.png` | 1254×1254, RGB (no alpha channel; corners are opaque black) | **The approved logo master — an icon-style monogram mark**, not a text logotype: a dark-navy rounded square framed by a pink-to-cyan neon border over a perspective-grid floor; inside, two side-by-side ivory tile-shaped "M" letterforms (beveled, physical-chip styling matching the game tiles), each with a row of four colored pips along its base (red/blue/yellow/black); a gold crown with a blue gem centered above the letters. Legible at small sizes: the crown + twin-M silhouette carries the mark; the pips are fine detail that may blur below ~64px, which is acceptable. |

**How the references are used** (combined collection, per the task brief):
concepts 01–03 establish composition, panel framing, palette, tile styling,
spacing, and atmosphere; 04 governs character-portrait styling; the
`concept-logo` monogram is the primary branding source for the icon pipeline
(Phase 6) and informs color relationships (navy field, neon frame, ivory
letterforms, gold emphasis); the "MELD MASTERS" logotype *as rendered inside
the concept screens* guides the header wordmark's typography, since no
standalone logotype file exists (the header wordmark is live text per the
asset contract regardless).

One noted inconsistency, accepted as-is: the logo's pip colors
(red/blue/yellow/**black**) do not exactly match the game's four tile colors
(crimson/cobalt/fern/**gold**). The logo is the approved branding source and
is used unmodified; the game's tile palette is an accessibility-verified
system and is not changed to match pips (§10). No action required.

**Concept elements that are reference-only (deliberately NOT implemented)**
because the game has no such feature and this refresh must not change
behavior: seasons/leagues/XP/levels/rewards/currencies/daily bonus, rank and
rating, friends/presence, ping and game modes (RACE/ARENA/PUZZLE), notice
board, per-turn MM:SS countdown (turn limits are hours, async by design),
MOVE LOG panel (no move history exists client-side; the live-region announcer
is the current equivalent), sound toggle/audio, hamburger menu (existing nav
remains), "TM" superscript (not rendered — no trademark claim implied),
EXIT GAME/OPTIONS buttons. Also noted: concept-02 contains the typo
"SHOWDOWMN" — irrelevant since that panel is out of scope.

**Prohibited artwork (restated as a standing rule for every phase):** no
mahjong symbols or ornamentation; no old Tile Meld logos or earlier Tile Meld
concept screens (none exist in the repo today — keep it that way); no generic
fantasy board-game look; no Street Fighter-style character presentation; no
copying of Nintendo/Punch-Out/Tron or any protected assets. These may not be
used even as fallbacks or "historical inspiration." This aligns with the
already-committed originality rules in `apps/web/src/assets/tabletop/README.md`.

---

## 5. Public-branding inventory and rename scope

Full classified inventory (259 matching lines across 111 tracked files;
verified 2026-07-26). Per category: **change** or **keep**, with reasons.

### 5.1 CHANGE — user-facing product name (11 sites)

| Site | Action |
| --- | --- |
| `packages/shared/src/branding.ts:13` `PRODUCT_NAME` | → `"Meld Masters"` (single source of truth) |
| `RootLayout.tsx` (loading, error h1, header link) ×3 | Automatic via `PRODUCT_NAME` |
| `HomePage.tsx` (h1, body copy) ×2 | Automatic via `PRODUCT_NAME` |
| `TabletopPage.tsx:109,118` hidden `<h1>` ×2 | Replace literals with `{PRODUCT_NAME}` (import already available) |
| `apps/web/public/sw.js:16` push title | Update literal (sw.js is a plain static file; guarded by the brand-consistency test, §12.2) |
| `apps/server/src/realtime/gateway.ts:181,206` push bodies | Import `PRODUCT_NAME` from `@tile-meld/shared` (server already depends on it) and interpolate |

The final UI name is exactly **Meld Masters** — never "Tile Meld: Meld
Masters", never "Meld Master".

### 5.2 CHANGE — browser/PWA metadata

`apps/web/index.html` `<title>`; `manifest.json` `name`, `short_name`
("Meld Masters" is 12 characters — within the conventional `short_name`
budget), `description`; `theme-color` meta and manifest `theme_color`/
`background_color` (Phase 6, to the new navy). Add `<meta name="description">`
and minimal OG tags (`og:title`, `og:description`, `og:image` pointing at the
512 icon) in Phase 6 — currently none exist, so this is a small additive
improvement, flagged as optional if scope pressure appears.

### 5.3 CHANGE — tests asserting the visible name

All sites listed in §3.7. In e2e, the header link selector is a navigation
primitive used 17 times in `dashboard.spec.ts`; Phase 1 updates
`helpers.ts` first, then the five spec files, in the same commit as the
rename so the suite is never red across a commit boundary.

### 5.4 CHANGE — documentation (public-facing only)

`README.md` title/intro → Meld Masters, with one added sentence: *"Meld
Masters is the public product name; `tile-meld` remains the internal
codename, repository name, package scope, and deployment identifier."*
`docs/environment.md`, `docs/current-state.md`, `CLAUDE.md` get the same
one-line note where the product is named. **Historical documents
(`docs/phase-0*.md`, `docs/opus-implementation-plan.md`, `docs/changes.md`,
CI stabilization docs, `tile-meld-opus-planning-prompt.md`) are records of
past work and are NOT edited** — rewriting history documents creates false
provenance.

### 5.5 KEEP — internal identifiers (each with its reason)

| Identifier | Keep because |
| --- | --- |
| `@tile-meld/*` package scope (7 package.json names, 6 workspace deps, 49 imports, Dockerfile/CI/Playwright `--filter` invocations, `apps/server/scripts/build.mjs:15`'s load-bearing `startsWith("@tile-meld/")` filter) | Private, never published, invisible to users. Renaming touches 60+ files, regenerates the lockfile, risks the Docker `deps`-stage filter and the build script's string match, and buys zero user value. |
| Repository directory / GitHub repo name `tile-meld` | Local path baked into docs, `CLAUDE.local.md`, Claude permission allowlists, and the remote URL. Docker Compose container names (`tile-meld-db-1`) derive from the directory name — renaming would strand the local dev database volume reference. |
| Render service `tile-meld` and database `tile-meld-db` (`render.yaml`) | The service name **determines the public `.onrender.com` hostname**. Renaming creates a new URL, breaking every installed PWA, bookmark, and push subscription — the exact opposite of a smooth rebrand. If a custom domain is ever added, do it as a separate, later task. Render's dashboard-visible human description can be updated by hand (not in `render.yaml`). |
| Database/user names `tilemeld`, `tilemeld_test`, volume `tilemeld-db-data`, CI Postgres env, backup script defaults | Data-bearing identifiers. Renaming risks real local game data for zero user-visible benefit. |
| Session cookie `tilemeld_session` (`apps/server/src/security/session.ts:1`) | **Renaming logs out every existing user.** |
| localStorage keys `tilemeld.identity` (defined in `AuthProvider.tsx:22` and — gotcha — duplicated as a raw literal in `RecoveryPage.tsx:130`), `tilemeld.recentRooms` | **Renaming orphans every returning player's identity** (identity is the only "account" the game has; losing it means losing access to games). Not worth a migration shim for an invisible string. |
| `sw.js` `tag: "tile-meld"` notification dedup key, server log line `"tile-meld server listening…"`, Docker image tags in CI (`tile-meld:${sha}`) | Invisible technical identifiers; churn without benefit. |
| `pnpm-lock.yaml` scope entries | Follow from keeping the scope. |

**Net effect:** the public name changes everywhere a user can see or install
it; every stable internal identifier stays. This matches the opus plan's
§10.4 design intent ("renaming is a config change, not a code hunt") — the
rename phase's main real work is *completing* the centralization the five
bypass sites broke.

---

## 6. Icon and PWA audit → target pipeline

### 6.1 Current state (verified)

See §3.4. Summary: three small PNGs of a blue-square/ivory-tile mark; no
favicon.ico/SVG; no maskable icon; push-only service worker with hardcoded
icon paths and title; `max-age=0` + ETag serving; manifest with
`standalone` display; iOS relies on the `apple-touch-icon` link (the HTML
comment in `index.html` already documents that iOS ignores manifest icons).

### 6.2 Target icon set (exact outputs, matched to what the stack actually uses)

Master: the approved
`docs/design-reference/meld-masters/meld-masters-concept-logo.png`
(1254×1254 RGB). Two derivation facts observed from the file itself:

- **No alpha channel — the corners outside the rounded square are opaque
  black.** For the `purpose: "any"` PNGs and the SVG/PNG favicons, the
  corners must be converted to transparency (recover the rounded-square
  silhouette) so the mark doesn't render as a black square on light
  launcher/tab backgrounds. For `apple-touch-icon.png` the opposite holds:
  it must stay fully opaque — keep the black corners or extend the navy
  field to the edges (iOS applies its own superellipse mask, so baked
  corners that don't match Apple's radius can leave visible slivers; a
  full-bleed navy background with the mark centered is the safer
  derivation).
- **The neon border sits close to the edge**, so the maskable variants
  cannot use the art full-bleed: inset the whole mark to ~80% on a
  full-bleed navy field matching the logo's background, keeping everything
  inside the maskable safe zone.

Derived outputs in `apps/web/public/icons/` (new subdirectory = new URL
paths, deliberately different from the old `/icon-*.png` paths so no cache
layer can serve stale art — §9.4):

| File | Size | Purpose |
| --- | --- | --- |
| `icons/icon-192.png` | 192×192 | Manifest `purpose: "any"` |
| `icons/icon-512.png` | 512×512 | Manifest `purpose: "any"`; also OG image |
| `icons/icon-maskable-192.png` | 192×192 | Manifest `purpose: "maskable"`; art within the central 80% safe zone, full-bleed navy background |
| `icons/icon-maskable-512.png` | 512×512 | Same, large |
| `icons/apple-touch-icon.png` | 180×180 | `<link rel="apple-touch-icon">`; **fully opaque** (iOS composites black behind alpha) |
| `icons/favicon.svg` | vector | Modern `<link rel="icon" type="image/svg+xml">` |
| `favicon.ico` | 16+32+48 multi-size, at web root | Legacy agents and tools that blindly request `/favicon.ico` (currently a 404) |

Old `/icon-192.png`, `/icon-512.png`, `/apple-touch-icon.png` are **kept in
place for one release** (so previously-installed PWAs and cached HTML never
404), then removed in a later cleanup — recorded in §16 rollback notes.

Icon design constraints (from the task brief + maskable spec): all outputs
are downscales/derivations of the approved monogram master — no redrawn
composition is needed, because the master already IS a simplified icon
composition (twin-M tiles + crown; no text, no mahjong imagery). Legibility
check at 48px is still required (the crown + twin-M silhouette must read;
the colored pips may blur — acceptable). Works on light and dark launchers
(navy field guarantees edge contrast on white; ivory letterforms guarantee
it on black). Maskable variants per the inset rule in the derivation notes
above. If any derivation requires more than crop/inset/transparency work
(i.e., actual redrawing), stop and get the result approved as new art.

### 6.3 Metadata changes (Phase 6)

- `manifest.json`: `name`/`short_name` "Meld Masters" (done in Phase 1),
  new `icons` array (any + maskable), `theme_color` → new navy token value,
  `background_color` → same navy (so the install splash matches the app).
- `index.html`: `theme-color` meta → navy; icon links → new paths; add
  `<meta name="description">`; optional OG tags.
- `sw.js`: `icon`/`badge` → `/icons/icon-192.png`. (Note: Android renders
  `badge` best as monochrome; acceptable to reuse the icon, note as a known
  minor imperfection.)
- No service-worker cache invalidation work is needed — **the SW caches
  nothing** (verified). It updates itself via `skipWaiting()` on next visit.

### 6.4 Icon verification procedure (Phase 6 manual checklist)

1. `pnpm run build`; `npx serve`-style check not needed — run the production
   Docker image or `node apps/server/dist/index.js` with `dist` present, and
   verify `/manifest.json`, `/icons/*`, `/favicon.ico` all return 200 with
   correct bytes.
2. Chrome DevTools → Application → Manifest: no warnings; installability
   check passes; maskable preview shows safe cropping.
3. Android (real device or emulator): install from Chrome → home-screen icon
   correct on both a light and a dark launcher wallpaper; splash screen shows
   navy background + icon; app label "Meld Masters".
4. iPhone/iPad Safari: Add to Home Screen → 180px icon correct, label
   "Meld Masters" (from `short_name`/title).
5. Desktop Chrome install → window icon, taskbar/dock icon, app name.
6. Browser tab favicon in Chrome and Firefox (SVG path) and one legacy check
   (`/favicon.ico` fetch).
7. **Stale-icon test (the one that actually bites):** on a device where the
   OLD Tile Meld PWA was installed — launch it, confirm the app content
   renames immediately (HTTP layer is `max-age=0`); observe whether the
   launcher icon/name update after Chrome's manifest re-check; document that
   an uninstall/reinstall is the guaranteed refresh path and add that note to
   README. iOS: Add-to-Home-Screen icons are snapshots — document
   remove-and-re-add as the iOS refresh path.

---

## 7. Screen-by-screen gap analysis

Legend for every screen: **Now** (verified current state) / **Ref** (which
concept elements apply) / **Change** / **Keep** / **Files** / **Responsive**
/ **A11y** / **Done when**.

The information hierarchy on the tabletop remains exactly: 1 game+turn
status, 2 opponents, 3 table, 4 player rack, 5 turn actions, 6 chat. Source
order and DOM structure are preserved on every screen; this refresh is CSS,
tokens, brand strings, and bounded decorative elements layered per the
existing slot contract.

### 7.1 App shell / header (`RootLayout.tsx`)

- **Now:** plain header — bold product-name link + 5 text nav links +
  notifications bell; skip link; loading/error states.
- **Ref:** logo header band in all concepts; neon panel framing.
- **Change:** dark arcade header bar; wordmark as styled live text
  (letter-spaced display font, cyan/orange gradient via `background-clip:
  text` with a solid high-contrast fallback color), typography guided by the
  logotype rendered inside the concept screens. The approved logo is a
  monogram mark, not a logotype (§4), so it does not replace the text
  wordmark; it MAY sit beside it as a small decorative emblem (`alt=""`,
  user's option at Phase 2 review). The header link's accessible name stays
  `PRODUCT_NAME` in all variants. Nav links as compact arcade tabs;
  focus-visible styling per tokens.
- **Keep:** exact nav link names (e2e selectors), skip link (add a
  `:focus` reveal style in Phase 7), bell control, loading/error semantics.
- **Files:** `RootLayout.tsx` (class names only, if at all), `global.css`.
- **Responsive:** header already wraps; verify at 390px.
- **A11y:** header link accessible name = "Meld Masters"; contrast AA;
  gradient text must have a solid fallback and never be the only affordance.
- **Done when:** axe passes, all e2e nav selectors pass post-Phase-1, visual
  match to reference header treatment approved.

### 7.2 Home dashboard (`HomePage.tsx`, `GameStatusCard.tsx`)

- **Now:** "Tile Meld" h1 + tagline; "Create a Game" section with 4 CTA
  buttons; "Your Games" auto-fill card grid with status badges
  (Open/Active/Completed/Resigned/Ended), loading/empty/error states.
- **Ref:** concept-02 — stacked color-coded action buttons with icon +
  subtitle; panel framing; profile/level/notice panels are **reference-only**
  (no such features).
- **Change:** hero title in display type; the 4 CTAs restyled as large
  arcade buttons each with its own accent (cyan/purple/green/gold mapping:
  Play vs Computer / New Game / Join Room by Name / Browse Public Lobby);
  game cards become neon-framed panels, status badges as scoreboard chips.
- **Keep:** the exact four CTA labels (unit test "labels every creation
  action exactly as specified"), badge texts, empty/loading copy, card =
  one focusable `<Link>` semantics.
- **Files:** `global.css`; `HomePage.tsx`/`GameStatusCard.tsx` only if a
  wrapper class or decorative `aria-hidden` span is needed.
- **Responsive:** grid is `auto-fill minmax(220px,1fr)` — keep.
- **A11y:** badge text remains, never color-alone; button subtitle text (if
  added) must be inside the accessible name or `aria-hidden` decoration —
  prefer NOT adding subtitles to avoid changing accessible names.
- **Done when:** HomePage unit tests pass with new name; axe Home passes;
  side-by-side approved.

### 7.3 Public lobby (`PublicLobbyPage.tsx`)

- **Now:** h1, Quick Join card, paginated room list (name, players/capacity,
  turn limit, member names, Join), Previous/Next.
- **Ref:** concept-02 ROOM BROWSER table — column headers, selected-row
  highlight, pagination chevrons. Mode/round/ping columns are reference-only.
- **Change:** room list styled as the browser panel (header row styling,
  gold hover/focus row highlight, neon frame, styled pager).
- **Keep:** `<ul>` semantics (do NOT convert to `<table>` — restyling a list
  as rows is pure CSS; changing semantics risks AT regressions and tests),
  all copy, Join button behavior, 20/page.
- **Files:** `global.css`, possibly class names in `PublicLobbyPage.tsx`.
- **Responsive:** rows wrap at phone widths; no horizontal overflow.
- **A11y:** row highlight not color-alone (Join button + focus outline carry
  it); axe Public Lobby passes.
- **Done when:** e2e lobby specs pass; visual approval.

### 7.4 Create room (`CreateRoomPage.tsx`) and Join by name (`JoinRoomPage.tsx`)

- **Now:** single-card forms; three radio fieldsets (capacity, visibility,
  turn limit) / one text input.
- **Ref:** concept-02 panel styling and button treatment (no direct
  equivalent screen — apply the design system, don't invent content).
- **Change:** arcade panel frames, radio options as segmented arcade
  choices (still native inputs), primary submit in orange emphasis.
- **Keep:** fieldset/legend semantics, "Join Room by Name" title (unit
  test), field labels, validation copy.
- **Files:** `global.css` only (plus class hooks).
- **A11y:** radio focus states clearly visible; labels unbroken.
- **Done when:** CreateRoomPage/JoinRoomPage tests pass; axe passes.

### 7.5 Waiting room (`WaitingRoomPage.tsx`)

- **Now:** room name h1, meta line, room code, member list (name, 🤖 BOT
  badge, host/you suffixes, ready state), Mark ready / Start / Leave,
  3s polling, rematch notice.
- **Ref:** concept-01 left-column seat plaques (portrait + name + readout,
  per-seat accent color).
- **Change:** member list as seat panels with per-seat accent frames;
  Phase 5 adds portraits here (seat-indexed originals + fallback); ready
  state as a lit/unlit lamp chip **with the existing text preserved**.
- **Keep:** all member/ready/host copy and buttons; polling; auto-navigate.
- **Files:** `global.css`; `WaitingRoomPage.tsx` markup only for portrait
  slot (Phase 5) with `alt=""` decorative images beside live name text.
- **A11y:** ready state remains text; portraits decorative; axe Waiting Room
  passes.
- **Done when:** waiting-room e2e flows pass; visual approval.

### 7.6 Active game tabletop (`TabletopPage.tsx` + `tabletop/*`) — the centerpiece

- **Now:** status region (h1 turn text, connection dot+label, countdown
  "Xh Ym remaining"), OpponentStrip (`<ul>`, text entries), Table ("Table"
  h2, TableSets with "Set N — validity" captions, tiles, reorder ◀/▶,
  "start a new set" drop zone), Rack ("Your rack (n)" h2, sort toggle group,
  tiles), feedback/hints text, action bar (Undo, Reset turn, Draw tile,
  Pass, Commit turn primary, two-step Resign), collapsible chat column.
  Tiles: 44×56px `<button>`s, ivory `#fffdf7`, colored numeral + symbol,
  inline-styled states.
- **Ref:** concept-01 (desktop), 03/04 (mobile). Applies: dark perspective-
  grid page background; "ON THE TABLE" board framing; captioned meld groups;
  ivory tiles with colored numeral-over-symbol (already exactly the app's
  tile model); "YOUR RACK" tray band; big arcade action buttons; "YOUR TURN"
  panel energy; opponent portrait plaques with per-seat accents; TILES
  LEFT-style counter chips. Reference-only: scores/round/target, MM:SS
  timer, MOVE LOG, mascot, sound toggle.
- **Change (mapped to the existing slot contract):**
  - `tabletop-page-background` slot: fixed, `aria-hidden`, `pointer-events:
    none` perspective-grid treatment (CSS gradients or one static SVG asset;
    static under reduced motion — it is static anyway).
  - `tabletop-status-frame`: "YOUR TURN"-style panel — display type for the
    h1, digital-readout styling for the countdown (semantics and hour-based
    text unchanged), connection state chip.
  - `tabletop-opponents-frame`: opponent `<li>`s become mini seat plaques
    (per-seat accent border; Phase 5 adds portrait thumbnails); text content
    (name, tile count, resigned/computer) verbatim — `TabletopLayout.test`
    asserts these strings.
  - `tabletop-board-surface`: navy board panel with subtle grid, neon frame,
    set-group caption styling; drop-zone valid/invalid borders re-tinted to
    token colors, dashed affordance kept, text validity labels kept.
  - `tabletop-rack-surface`: ivory-accented tray band distinct from board;
    sort toggle group styled as segmented control (aria-pressed kept).
  - Tiles (§10 below): richer ivory face, bevel, state treatments.
  - `tabletop-actions-frame`: buttons restyled large with per-action accent
    (Draw cyan, Pass purple, Commit orange primary, Resign danger);
    **button text/accessible names unchanged**; uppercase via CSS
    `text-transform` only (does not alter accessible names).
  - `tabletop-chat-frame`: chat as arcade side panel; `role="log"`, toggle
    `aria-expanded` untouched.
  - Feedback/hints line: styled as the "callout" panel (mascot art only if
    ever supplied and approved; not required).
- **Keep:** every heading text, every button name, DOM/source order, the
  `data-testid="tabletop-board|rack|chat"` hooks, dnd behavior and geometry
  (collision precision — do not change tile/drop-zone dimensions beyond the
  tolerances in §10), completed-game card + RematchPanel flow, hidden h1s
  (now via `PRODUCT_NAME`).
- **Files:** `global.css` (bulk), `applyBrandingTokens.ts` (§8.4),
  `Tile.tsx` (move inline state styles to classes — behavior identical),
  minor class additions in `TabletopPage.tsx`/`tabletop/*.tsx`.
- **Responsive:** one-column at ≤860px matching concepts 03/04; zero
  horizontal overflow at 390px (e2e-enforced).
- **A11y:** axe Tabletop + mobile scans pass; focus ring visible on navy;
  reduced-motion honored; glow never under body text.
- **Done when:** full unit suite + tabletop e2e specs pass; 4-viewport
  screenshots approved side-by-side against concepts 01/03/04.

### 7.7 Computer-opponent surfaces

- **Now:** emoji 🤖 markers in HomePage copy, WaitingRoom badge,
  OpponentStrip suffix, TabletopStatus "🤖 Computer is playing…",
  GameStatusCard "· vs Computer".
- **Change:** none behavioral. Phase 5 gives the computer opponent a
  dedicated original portrait (robot-mascot styling per concept callout is a
  natural fit) with the existing text kept verbatim (tests assert it).
- **Done when:** `TabletopComputerTurn` tests and `vs-computer.spec.ts` pass.

### 7.8 Completed game / results / rematch (`TabletopPage` completed state, `RematchPanel.tsx`)

- **Now:** h1 "Game over"; card above the still-visible table; host
  Rematch button / waiting text; chat read-only; "Back to your rooms".
  **No scores exist** — nothing displays a winner beyond the game-over state.
- **Ref:** no dedicated concept screen; apply panel/emphasis system (gold
  frame for the game-over card).
- **Change:** styling only. Adding a results scoreboard would require
  server/model changes — explicitly out of scope (deliberate difference).
- **Done when:** rematch unit + e2e specs pass.

### 7.9 Error / unavailable / loading states

- **Now:** RootLayout error card + retry; TabletopPage notFound/loading with
  hidden h1; WaitingRoom "room no longer exists"; purged-game flow
  (e2e-covered); **no 404 route** (pre-existing gap).
- **Change:** restyle within the system; rename literals via `PRODUCT_NAME`.
  Adding a catch-all route is out of scope (behavior change); recorded in
  §15 as a declined adjacent improvement.
- **Done when:** `purgedGame.spec.ts`, `TabletopPurgedGame` tests pass.

### 7.10 Identity / recovery (`RecoveryPage.tsx`)

- **Now:** four stacked cards — recovery code display (monospace), username
  claim, rotate code, recover session. The de-facto account screen.
- **Ref:** panel system only.
- **Change:** arcade panels; the monospace code display styled as a
  terminal/readout panel (keep monospace — it aids transcription); primary
  action emphasis. **This screen is rate-limited (5/min) in e2e — no new
  interactions may be added to its tests beyond what exists.**
- **Done when:** RecoveryPage tests + recovery e2e pass; axe Recovery passes.

### 7.11 Installed-app presentation

Covered by Phase 6: install prompt name, splash (navy background + 512
icon), standalone display, theme-color matching the header band so the
status bar blends. Core gameplay must keep working with PWA features
unavailable (opus plan D-BROWSERS — unchanged).

---

## 8. Proposed design system

### 8.1 Principles

1. **Tokens first.** Every color/space/type/motion decision lands in
   `global.css` `:root` custom properties. Components consume tokens; no
   new hex values inside component rules.
2. **Existing styling approach is kept** — one global stylesheet, semantic
   classes, same DOM. No Tailwind, no CSS-in-JS, no component framework
   (§15 D3). One dependency MAY be added: self-hosted font files (§8.3).
3. **Readability beats neon.** Body text is always solid high-contrast on
   solid surfaces. Neon/glow is reserved for borders, frames, and large
   display text that independently clears contrast. Glow never sits under
   body text.
4. **Dark arcade is the theme** (§15 D2): both `prefers-color-scheme`
   branches resolve to the arcade palette (the concept has no light
   variant, and maintaining a parallel light theme would fork every visual
   decision). The token structure keeps the dark-mode media query in place
   so a future light variant remains possible.

### 8.2 Token set (proposed values — Phase 2 verifies every contrast pair before committing)

```css
/* Backgrounds (navy stack, darkest to lightest) */
--bg-page: #0a0e1a;        /* near-black navy — page/grid field        */
--bg-panel: #101828;       /* standard panel                            */
--bg-panel-raised: #16223a;/* hover/raised panel                        */
--bg-inset: #0c1322;       /* board/log insets                          */

/* Neon accents (borders, frames, large display text ONLY) */
--neon-cyan: #3fe0ff;   --neon-cyan-dim: rgba(63,224,255,.28);
--neon-orange: #ff9f2e; --neon-gold: #ffc94d;
--neon-purple: #b06aff; --neon-green: #58e08a; --neon-pink: #ff5fa8;
--grid-line: rgba(63,224,255,.10);

/* Text (body-safe, verified AA on --bg-panel) */
--text-primary: #edf2fb;
--text-muted: #9fb0c9;     /* verify ≥4.5:1 on --bg-panel */
--text-on-accent: #0a0e1a; /* dark text on orange/gold buttons */

/* Tile surface */
--tile-ivory: #f7efdc;         /* warm ivory; §10 re-verifies AA vs all four tile hexes */
--tile-ivory-edge: #d9cfae;

/* States (each defined as text-safe + surface pair) */
--state-success: #58e08a; --state-warning: #ffc94d;
--state-error: #ff6b5e;   --state-active: #3fe0ff;
--state-waiting: #9fb0c9; --state-disabled-opacity: 0.5;

/* Structure */
--frame-width: 2px;  --radius-md: 0.5rem; --radius-lg: 0.9rem;
--corner-notch: 10px;                 /* arcade clipped corners */
--glow-sm: 0 0 6px var(--neon-cyan-dim);
--glow-focus: 0 0 0 3px rgba(63,224,255,.85);

/* Type */
--font-sans: system-ui, ... (unchanged — body text);
--font-display: "Silkscreen", var(--font-sans);  /* headings/labels, §8.3 */

/* Motion */
--duration-fast: 120ms; --duration-med: 200ms;
--ease-arcade: cubic-bezier(.2,.9,.3,1);
```

Spacing tokens `--space-1..8` are kept unchanged. Existing semantic tokens
(`--color-bg`, `--color-surface`, `--color-text`, etc.) are **remapped** to
the new values rather than deleted, so every existing rule keeps working —
the safest migration for a 446-line stylesheet.

**Arcade frame technique:** a `.arcade-panel` utility — solid `--bg-panel`
background, `--frame-width` neon border, optional clipped corners. Clipped
corners via `clip-path: polygon(...)` clip borders too, so the utility uses
a two-layer approach only where notches are wanted (outer element =
neon-colored background clipped to the notched polygon; inner element =
panel background clipped to a slightly smaller polygon). Where that
complexity isn't warranted, plain rounded corners + border + `--glow-sm`.
Decision recorded in §15 D6 — notched corners are *selective* (major
panels), not universal.

**Focus states:** keep the global `:focus-visible` outline, re-colored to
cyan with `outline-offset: 2px`; verify ≥3:1 against every surface it can
appear on (navy panels, ivory tiles, orange buttons).

### 8.3 Typography

- **Body/UI text:** unchanged system stack. Concept legibility comes from
  weight, letter-spacing, and uppercase labels — apply via CSS
  (`text-transform: uppercase; letter-spacing: .06em`) on labels/headings.
  CSS uppercase does not change accessible names or test selectors.
- **Display font:** one self-hosted SIL-OFL pixel-family for headings,
  panel titles, and the wordmark. Recommended: **Silkscreen** (OFL; designed
  for small-size legibility). Alternative if a heavier arcade logotype feel
  is wanted for the h1 only: Press Start 2P (OFL) — but it is nearly
  unreadable below ~14px, so it would be h1-exclusive. Phase 2 ships woff2
  files + the OFL license text in-repo (`apps/web/src/assets/fonts/`), uses
  `@font-face` with `font-display: swap` and the system stack as fallback.
  **No external font requests** (the app currently makes zero external
  requests; keep it that way). Licensing review = confirming the OFL file
  accompanies the font (§15 D5).
- Numbers on tiles stay in the system stack (max legibility), heavy weight.

### 8.4 Token plumbing fix

`applyBrandingTokens.ts` writes `--tile-color-C1..C4` but nothing reads
them, and `Tile.tsx` inlines hexes. Phase 4 makes `.tile` state styling
class-based and makes tile color consumption go through the custom
properties (one mechanism, not two). `TILE_COLOR_TOKENS` in
`packages/shared` remains the single source of truth.

---

## 9. Asset strategy

For each visual element of the concepts, how it is produced:

| Element | Strategy |
| --- | --- |
| Page background: navy field + perspective grid | **CSS** (layered linear-gradients + a transformed repeating-gradient grid), or one small static **SVG** if CSS fidelity disappoints. Static; `aria-hidden`; `pointer-events: none`; fills the `tabletop-page-background` slot (and, per §15 D7, the site-wide background). No raster photo-scale assets. |
| Panel frames, notched corners, glows | **CSS** (`.arcade-panel` utility, tokens). No images. |
| Wordmark (header) | **Live text** in display font with gradient fill + solid fallback (asset contract: text is never baked into images). The approved monogram (`meld-masters-concept-logo.png` derivative) may additionally appear as a small `alt=""` header emblem and as the OG/social image. |
| Tile faces | **CSS** (gradient ivory, bevel borders, shadow). No sprite. |
| Set-group captions, counters, chips, buttons | **CSS + live text.** |
| Character portraits | **Supplied original raster assets** (B3) meeting §9.3. Never CSS-drawn, never cropped from concepts. |
| Robot mascot / callout art | Optional, only if an original asset is supplied and approved; the hint/feedback panel works as text-only regardless. |
| App icon / favicon set | **Derived (crop/inset/transparency/downscale) from the approved monogram master** `meld-masters-concept-logo.png`, per §6.2 — the master is already an icon composition, so no redrawing is expected. Concept screens are NOT scaled down into icons. |
| Concept PNGs themselves | Committed as reference under `docs/design-reference/` only — never served, never imported by the app. |

### 9.3 Portrait asset contract (Phase 5 prerequisite)

- **Dimensions:** 512×512 source PNG per portrait, 1:1, subject occupying
  ~80% height, consistent head placement across the set (concept-04 framing).
- **Delivery format:** PNG source; build-served as optimized PNG (pixel-art
  styling compresses well; WebP optional later — no build-pipeline change
  required now).
- **Rendering:** displayed at 40–96px squares; `image-rendering: pixelated`
  if the art is pixel-style, otherwise default.
- **Background:** transparent subject; the frame/background comes from CSS
  (per-seat accent frames), so one asset works everywhere.
- **Naming:** `apps/web/src/assets/portraits/portrait-<slug>.png`
  (`portrait-bot.png`, `portrait-p01.png` … `portrait-p08.png`,
  `portrait-fallback.png`).
- **Assignment:** the computer opponent always gets `portrait-bot`; human
  seats get a deterministic pick by seat index from the generic set. No
  profile/avatar-selection feature (out of scope).
- **Fallback:** `portrait-fallback.png` (neutral original silhouette in the
  same style); rendered via normal `<img>` `onError`/missing-asset fallback;
  per the asset contract, a missing portrait must leave the UI fully usable.
- **Accessibility:** portraits are always **decorative** (`alt=""`) — the
  player's name is adjacent live text everywhere a portrait appears.
- **Performance:** `loading="lazy"`, explicit `width`/`height` (no layout
  shift); total portrait payload budget ≤ 150 KB.
- **Placements (restrained):** WaitingRoom seat list, tabletop
  OpponentStrip, RematchPanel/game-over card (small), and the computer
  opponent wherever "vs Computer" appears. NOT on: lobby rows, dashboard
  cards, recovery, forms.
- **Originality:** exaggerated late-80s-arcade *energy* (large expressive
  faces, distinctive silhouettes, limited palette, humor) without
  reproducing any Punch-Out character, pose, costume, or artwork.

### 9.4 Stale-icon defense

New icon **paths** (`/icons/…`) + updated `index.html`/`manifest.json`
references guarantee no cache layer can pair old bytes with new markup.
Old paths kept serving for one release. `max-age=0` + ETag (verified) means
HTML/manifest re-validate on every load. Remaining staleness is OS-level
(launcher snapshots) — addressed by documentation, not engineering (§6.4
step 7).

---

## 10. Tile redesign specification

Preserved invariants (all currently verified in code/tests):

- Tile = native `<button>`; drag + click/keyboard select; `aria-label`
  "Crimson 7" / "Joker" format; `aria-pressed` selection; symbols ● ■ ▲ ◆ ★
  as sighted-redundant color identifiers (`aria-hidden`); color names in
  accessible labels. **None of this changes.**
- Size: currently 2.75rem × 3.5rem (44×56px). New spec: keep as the minimum;
  optionally `clamp()` up to ~3.25rem wide on desktop. **Any size change
  must re-run the drag-precision e2e specs** — dnd-kit drop targeting is
  precision-sensitive (CLAUDE.md special-care area). If flakiness appears,
  revert to fixed 44×56.
- Colors: the four `TILE_COLOR_TOKENS` hexes are kept unless the new
  `--tile-ivory` drops any below 4.5:1, in which case the hex is darkened
  minimally in `branding.ts` (single source) and re-verified. Contrast
  check for all 4 hexes + `--color-text` (joker) against `--tile-ivory` is a
  Phase 4 gating task with recorded ratios.

Visual changes:

- Body: `--tile-ivory` with a subtle vertical gradient and 1px
  `--tile-ivory-edge` bevel border + small drop shadow (concept tiles read
  as thick physical chips).
- Numeral: larger (~1.35rem), weight 800; symbol below it slightly larger
  than today. No decorative texture behind glyphs.
- States (moved from inline styles to classes, visuals only):
  - **Selected:** 3px gold ring (`--neon-gold`) + slight lift shadow;
    `aria-pressed` unchanged.
  - **Dragging:** current opacity treatment kept; drop shadow grows.
  - **Invalid (in invalid set):** `--state-error` border, unchanged text
    validity label on the set caption.
  - **Joker:** ★ glyph kept, rendered in a distinct dual-tone treatment
    (e.g., gold star with dark outline) — still no color-alone meaning.
  - **Disabled/not-draggable (new visual):** reduced saturation +
    `--state-disabled-opacity`; today this state has *no* visual, so this is
    a strict improvement; no cursor/interaction changes.
  - **Recently moved:** does not exist today and requires event-tracking
    state to know which tiles moved; **deferred** (§15 D9) — a brief
    reduced-motion-respecting highlight is specced as an optional Phase 4
    stretch only if it can be driven purely by existing client patch events.
- StrictMode caution: any state added for transient highlights must live in
  pure `setState` updaters (known Undo-bug history — CLAUDE.md).

---

## 11. Phased implementation plan

Improvements over the suggested structure (rationale): the suggested 0–8
order is kept — it already matches dependency order (rename before visuals
so test churn happens once; tokens before screens; asset-gated phases last).
Two adjustments: (a) Phase 0 gains "commit the reference images + record
blocker resolutions" since the references are currently untracked; (b)
Phase 5 is **asset-gated** (B3, supplied portrait artwork) and may be
swapped with Phase 6 or paused without blocking Phases 7–8 sign-off of
everything else.

Common to every phase:

- **Preconditions:** previous phase approved by the user; clean worktree;
  `docs/task.md` updated to name the active phase.
- **Gate:** `pnpm run format:check && pnpm run lint && pnpm run typecheck &&
  pnpm run test && pnpm run build` with `TEST_DATABASE_URL` +
  `DATABASE_URL` exported to `tilemeld_test` (per `CLAUDE.local.md`),
  plus the phase's targeted e2e projects (chromium minimum; the full 5-way
  matrix at Phases 1, 4, and 8).
- **Stop point:** after the gate and the phase summary, STOP for manual
  testing and review. Do not begin the next phase. Commits happen only when
  the user separately instructs (§17).

### Phase 0 — Baseline and reference audit

- **Objective:** freeze the starting point; version the references; confirm
  blockers with the user.
- **Files:** `git add docs/design-reference/` (+ this plan document);
  new `docs/design-reference/baseline/` screenshots; `docs/task.md` update.
- **Tasks:** (1) verify branch/commit/clean tree and record in the phase
  summary; (2) commit reference PNGs + plan doc (user-instructed commit);
  (3) capture baseline screenshots of all 7 routes + tabletop states at
  1440×900, 1280×720, 390×844, 844×390 into
  `docs/design-reference/baseline/` — use a throwaway Playwright script
  (e.g., `node scripts/capture-screens.mjs` added for this purpose, or
  manual capture; screenshots are committed, the script may be kept);
  (4) run the full gate + chromium e2e to confirm green baseline; (5)
  confirm B3 status (portrait production assets) with the user — B1/B2
  were resolved during planning (§2).
- **Non-goals:** any code or style change.
- **Verification:** gate green; screenshots exist for every screen/viewport.
- **A11y check:** none beyond the existing suites (baseline).
- **Risks:** e2e flakiness noise → run chromium-only; rate limits → use
  existing helpers.
- **Done when:** baseline recorded, references committed, blocker answers
  captured in this document's §2 (edited in place).
- **Commit:** `docs: add Meld Masters design references, refresh plan, and baseline screenshots`

### Phase 1 — Branding centralization and public rename

- **Objective:** the public name becomes Meld Masters everywhere a user can
  see it; `PRODUCT_NAME` becomes the *actual* single source.
- **Files:** `packages/shared/src/branding.ts`; `apps/web/index.html`;
  `apps/web/public/manifest.json`; `apps/web/public/sw.js`;
  `apps/server/src/realtime/gateway.ts`; `apps/web/src/pages/TabletopPage.tsx`;
  new `packages/shared/test/branding.test.ts`; new
  `apps/web/test/brandConsistency.test.ts`; `apps/web/test/HomePage.test.tsx`;
  `apps/server/test/push/pushSender.test.ts`; `e2e/tests/helpers.ts`;
  `e2e/tests/{dashboard,vs-computer,rematch,purgedGame,reconnect-recovery}.spec.ts`;
  `README.md`; `CLAUDE.md`, `docs/environment.md`, `docs/current-state.md`
  (public-name notes only).
- **Tasks:** flip `PRODUCT_NAME`; route the five bypass sites through it
  (server imports the constant; static files updated by hand and locked by
  the new brand-consistency test that reads `index.html`, `manifest.json`,
  and `sw.js` from disk and asserts they contain `PRODUCT_NAME` and do NOT
  contain "Tile Meld"); update the e2e helper first, then specs; update
  docs per §5.4; `git grep -n "Tile Meld"` sweep must return only
  historical docs and this plan.
- **Explicit non-goals:** no visual change; no internal-identifier renames
  (§5.5); no icon changes yet (old icon art persists one more phase-set —
  acceptable transitional state since it contains no wordmark).
- **Verification:** full gate; **full 5-project e2e matrix** (this phase
  touches the helper every spec flows through); new tests green.
- **A11y:** heading/link accessible names verified as "Meld Masters" by the
  updated tests.
- **Risks:** a missed literal (mitigated by sweep + consistency test);
  e2e churn (mitigated: helper-first, one commit).
- **Done when:** UI, tab title, install metadata, push notifications all say
  Meld Masters; suite green.
- **Commit:** `feat(brand): rename public product to Meld Masters via centralized PRODUCT_NAME`

### Phase 2 — Design tokens and global arcade foundation

- **Objective:** the token set (§8.2), fonts (§8.3), page background/grid,
  `.arcade-panel` utility, header/nav/wordmark, focus treatment, and
  remapped legacy tokens — the app-wide dark arcade shell.
- **Files:** `apps/web/src/styles/global.css` (bulk);
  `apps/web/src/assets/fonts/` (woff2 + OFL.txt); `apps/web/index.html`
  (nothing — fonts load via CSS); `RootLayout.tsx` class hooks if needed.
- **Tasks:** add tokens; remap `--color-*` semantics to arcade values;
  delete the light/dark fork by pointing both branches at the arcade palette
  (media query structure retained); `@font-face`; header band + wordmark
  text treatment; page background grid (site-wide per D7); focus-visible
  re-color; button base styles (primary/danger re-tinted); verify every
  text/surface pair ≥4.5:1 (record ratios in the phase summary); a
  `prefers-contrast: more` spot-check is optional/nice-to-have.
- **Non-goals:** screen-specific layouts; tiles; icons; portraits.
- **Verification:** gate; chromium + mobile-chrome e2e; **axe specs are the
  key gate here** (contrast).
- **A11y:** contrast table recorded; focus visible on all surfaces; reduced
  motion unaffected (no new animation, or all new transitions ≤ tokens and
  covered by the global clamp); glow-under-text audit.
- **Risks:** contrast failures (fix tokens, not axe thresholds); font FOUT
  (font-display: swap + system fallback is acceptable); perf of glows
  (static box-shadows only; no animated shadows; no large blur filters).
- **Done when:** every screen renders legibly in the new shell (even though
  screen-specific styling lands later), suite + axe green.
- **Commit:** `feat(theme): arcade design tokens, display font, and global Meld Masters shell`

### Phase 3 — Dashboard, lobby, and room presentation

- **Objective:** apply the system to HomePage, PublicLobbyPage,
  CreateRoomPage, JoinRoomPage, WaitingRoomPage, RecoveryPage per §7.2–7.5,
  7.10.
- **Files:** `global.css`; the six page components (class hooks only);
  `GameStatusCard.tsx`.
- **Tasks:** per-screen treatments as specced; CTA accent mapping; room
  browser styling; seat panels (portrait *slots* prepared, no portraits
  yet); status chips.
- **Non-goals:** tabletop; behavior/copy changes; portraits.
- **Verification:** gate; chromium + mobile-webkit e2e for dashboard,
  lobby, room-lifecycle, recovery specs; axe.
- **A11y:** all pre-game screens pass axe; no color-alone regressions
  (badge/ready text retained).
- **Risks:** rate-limited recovery endpoint in e2e (use existing patient
  helpers; do not add new recovery interactions).
- **Done when:** pre-game flow visually coherent; suite green; screenshots
  approved vs concept-02.
- **Commit:** `feat(theme): arcade presentation for dashboard, lobby, room, and recovery screens`

### Phase 4 — Tabletop, rack, tiles, controls, and game status

- **Objective:** the game screen per §7.6 + tile spec §10 — the highest-
  value, highest-risk phase.
- **Files:** `global.css`; `Tile.tsx` (inline→class states);
  `applyBrandingTokens.ts` (consume tokens); `TabletopPage.tsx`,
  `tabletop/*.tsx` (class hooks); possibly `branding.ts` (only if a tile
  hex needs an AA-preserving darkening).
- **Tasks:** slot-by-slot styling per the layout contract; tile redesign +
  contrast table; action-bar arcade buttons; countdown readout styling;
  connection chip; set captions; optional recently-moved stretch only if
  purely client-event-driven (D9).
- **Non-goals:** DOM restructure; new panels (move log etc.); dnd logic
  changes; portrait assets.
- **Verification:** gate; **full 5-project e2e matrix** (drag precision
  across engines is the risk); axe tabletop + mobile scans.
- **A11y:** keyboard select-then-place unchanged; `aria-pressed`/labels
  unchanged; focus ring on tiles verified against ivory; validity never
  color-alone.
- **Risks:** dnd drop precision if sizes change (fallback: fixed 44×56);
  StrictMode purity for any new state; axe contrast on drop-zone borders
  (keep text labels the guarantee, as the contract already states).
- **Done when:** matrix green; screenshots at all 4 viewports approved vs
  concepts 01/03/04.
- **Commit:** `feat(theme): arcade tabletop — board, rack, tiles, status, and action bar`

### Phase 5 — Original character portrait system *(gated on B3 — supplied portrait assets)*

- **Objective:** portrait contract implementation (§9.3) + approved assets
  in the restrained placements.
- **Files:** `apps/web/src/assets/portraits/*` (+ a README mirroring the
  tabletop asset rules); a small `Portrait.tsx` component; `OpponentStrip.tsx`,
  `WaitingRoomPage.tsx`, `RematchPanel.tsx`; `global.css`; new
  `apps/web/test/Portrait.test.tsx`.
- **Tasks:** component with fallback + `alt=""` + lazy + fixed dimensions;
  deterministic seat assignment; bot portrait; placements; payload audit.
- **Non-goals:** profile/avatar selection features; portraits on screens
  not listed; any generated/traced art.
- **Verification:** gate; chromium + mobile-chrome e2e (waiting room,
  vs-computer, rematch specs); axe.
- **A11y:** portraits invisible to AT (decorative), names remain live text;
  no layout shift (dimensions set).
- **Risks:** asset weight (budget); art not approved in time (phase pauses —
  Phases 6–8 do not depend on it).
- **Done when:** portraits render with graceful fallback everywhere specced;
  suite green; art sign-off recorded.
- **Commit:** `feat(theme): original character portrait system and placements`

### Phase 6 — Logo, favicon, manifest, and smartphone icon

- **Objective:** complete public icon pipeline + installed-app metadata
  (§6.2–6.3).
- **Files:** `apps/web/public/icons/*`,
  `apps/web/public/favicon.ico` (all derived from the committed master at
  `docs/design-reference/meld-masters/meld-masters-concept-logo.png`, which
  stays where it is); `apps/web/index.html`;
  `apps/web/public/manifest.json`; `apps/web/public/sw.js`; new
  `apps/web/test/manifestIcons.test.ts` (manifest parses; every referenced
  icon file exists in `public/`; sizes/purposes correct; theme colors match
  the token value); README icon-refresh note.
- **Tasks:** derive outputs from the approved master; wire references;
  theme/background colors to navy; OG/description metadata; keep old icon
  paths serving; run §6.4 verification.
- **Non-goals:** service-worker caching features; any app-code change.
- **Verification:** gate; the new manifest/icon tests; production build +
  Docker image spot-check that `/icons/*` serve (the e2e suite runs Vite dev
  and will NOT catch dist-only asset issues — this manual step is
  mandatory).
- **A11y:** n/a beyond metadata correctness (icon has no in-app a11y
  surface).
- **Risks:** stale launcher icons (mitigated §9.4; documented §6.4 step 7);
  maskable cropping (DevTools preview + real device).
- **Done when:** §6.4 checklist fully executed and recorded.
- **Commit:** `feat(brand): Meld Masters icon pipeline, favicon, and PWA install metadata`

### Phase 7 — Responsive refinement and accessibility

- **Objective:** sweep and polish across devices/inputs/preferences;
  fix everything found.
- **Files:** `global.css` primarily; targeted component tweaks.
- **Tasks:** the §13 acceptance-criteria audit executed viewport by
  viewport; keyboard-only full game pass; screen-reader smoke test (NVDA or
  VoiceOver: landmark/heading walk, tile selection, announcer); 200%
  text-zoom pass; reduced-motion pass; skip-link `:focus` reveal (cheap
  pre-existing-gap fix, in scope by user request "visible focus states");
  decorative layers `aria-hidden` audit.
- **Non-goals:** new features; fixing pre-existing gaps beyond those the
  task's acceptance criteria name (route-focus management and error
  boundaries stay out).
- **Verification:** gate; **full 5-project e2e matrix**; axe all screens.
- **Done when:** every §13 criterion checked off with evidence in the phase
  summary.
- **Commit:** `fix(theme): responsive and accessibility refinement pass for Meld Masters`

### Phase 8 — Regression testing, visual review, and release preparation

- **Objective:** final proof and handoff to deploy.
- **Files:** `docs/current-state.md`, `docs/environment.md` (verified-state
  updates); `docs/design-reference/final/` screenshots; possibly
  `docs/task.md` closure.
- **Tasks:** full gate + full e2e matrix + production build; build and run
  the Docker image locally (compose `web` service) and verify manifest/
  icons/fonts serve from dist; final 4-viewport screenshot set; §14
  side-by-side review against ALL FOUR concepts with the
  deliberate-differences list (§13.3) confirmed; `git grep` sweeps
  ("Tile Meld" → historical docs only; "mahjong" → prohibition texts only);
  Lighthouse spot-check (performance + PWA installability) on the local
  prod build; write the deploy note (Render auto-deploys `main`; verify
  after deploy per §6.4 on production URL; Render dashboard description
  update is a manual user step).
- **Non-goals:** deploying (user decision); new visual work.
- **Verification:** everything green, recorded in `docs/current-state.md`
  with commit hash.
- **Done when:** user signs off release readiness.
- **Commit:** `docs: Meld Masters visual refresh — final verification and release notes`

---

## 12. Testing strategy

### 12.1 Existing suites (all preserved and kept green)

663 unit/integration tests, 5-project Playwright matrix, axe gates, CI
format/lint/typecheck/build/audit/Trivy. No test is deleted; assertions are
updated only where the *public copy they assert* changed (the rename).
`data-testid="tabletop-board|rack|chat"` hooks are preserved verbatim.

### 12.2 New tests (only where they buy real protection)

| Test | Protects |
| --- | --- |
| `packages/shared/test/branding.test.ts` — `PRODUCT_NAME === "Meld Masters"`; tile tokens shape; (currently `branding.ts` has zero coverage) | The source of truth |
| `apps/web/test/brandConsistency.test.ts` — reads `index.html`, `public/manifest.json`, `public/sw.js` from disk; asserts each contains `PRODUCT_NAME`'s value and none contains "Tile Meld" | The three static files that structurally cannot import the constant |
| Old-name-not-rendered assertions folded into existing page tests (HomePage, RootLayout) | UI regression |
| `apps/web/test/manifestIcons.test.ts` — manifest parses; every icon `src` exists in `public/`; `sizes`/`purpose` pairs correct; `theme_color` equals the token value (read from a small exported constant or the CSS file) | The icon pipeline (nothing tests it today) |
| `apps/web/test/Portrait.test.tsx` — fallback on error, `alt=""`, dimensions | Portrait contract |
| Obsolete-asset guard, in `brandConsistency.test.ts`: assert no file under `apps/web/public/` or `apps/web/src/assets/` matches `/mahjong|tile-?meld-?logo/i`, and `public/` contains only an allowlisted file set | Prevents obsolete art reintroduction cheaply, without brittle image diffing |

### 12.3 What is deliberately NOT added

Pixel/screenshot regression tests (brittle across font rendering and
engines; manual screenshot review per §14 replaces them — §15 D8);
tests of internal identifiers (they are contractually frozen instead).

### 12.4 Execution discipline

`TEST_DATABASE_URL` + `DATABASE_URL` → `tilemeld_test`, always, before any
`pnpm run test`. E2E: chromium for iteration; full matrix at Phases 1, 4,
7, 8. Never loosen production rate limits for tests; use the existing
patient helpers.

---

## 13. Manual visual-review procedure and acceptance criteria

### 13.1 Screenshot protocol (Phases 0 and 8, plus per-phase spot shots)

Viewports: **1440×900**, **1280×720**, **390×844** (portrait), **844×390**
(landscape). Screens: home, lobby, create, join, waiting room (2p and 4p if
convenient), tabletop (your turn / opponent turn / invalid set / selected
tile / completed+rematch), recovery, error state. Store under
`docs/design-reference/baseline/` and `.../final/`. Review = plan document
side-by-side with **all four** concept images; 04 wins for portraits.

### 13.2 Acceptance criteria checklist (Phase 7 executes; Phase 8 re-verifies)

- Desktop (both sizes): no layout breakage; panels aligned; glow subtle.
- Tablet (~860px boundary): the single breakpoint transition is clean.
- Phone portrait 390×844: zero horizontal overflow (e2e-enforced); all
  six tabletop regions reachable; touch targets ≥44px.
- Phone landscape 844×390: playable; action bar reachable; no clipped
  status text.
- Keyboard-only: complete a full turn (select, place, reorder, commit)
  with visible focus at every step.
- Screen reader: heading walk matches hierarchy; tile labels; announcer
  announcements unchanged; decorative layers (grid, portraits, glyph
  spans) silent.
- Reduced motion: no animation anywhere with the preference set (global
  clamp verified to still apply to any new transitions).
- Contrast: recorded ratio table — all body text ≥4.5:1, large display
  text ≥3:1, focus indicator ≥3:1, tile numerals ≥4.5:1 on ivory.
- Text resize 200%: no loss of content or function.
- Neon glow never underlays body text.
- Installed-app: §6.4 checklist.

### 13.3 Deliberate differences from the concept art (pre-approved list)

Everything listed in §4 "reference-only" (scores, seasons, modes, move log,
MM:SS timer, mascot dialogue, friends, currencies, menus, ™); light-DOM text
instead of baked-in art everywhere (asset contract); hour-based countdown
wording; chat panel (exists in app, absent from concepts — styled to match);
recovery/create/join screens (no concept equivalent — system-styled);
set captions read "Set 1 — valid run" (test-asserted wording) styled like
the concept's "RUN OF 3" plaques without changing the string; tile symbols
remain ● ■ ▲ ◆ (concept uses ♦-dominant marks; the app's four-symbol system
is an accessibility guarantee and stays). Any further difference discovered
during implementation gets added here with a reason, at the phase stop
point.

---

## 14. Accessibility requirements (binding summary)

WCAG AA contrast throughout; keyboard operability unchanged; existing ARIA
semantics and live regions unchanged; visible focus everywhere on the new
palette; `prefers-reduced-motion` fully honored (existing global clamp is
the mechanism — new animations must not fight it); no color-alone meaning
(symbols, badge text, validity text all preserved); decorative art hidden
from AT; same DOM for all viewports; touch targets ≥44px; axe
serious/critical = merge-blocking, and **axe thresholds are never loosened
to ship a visual effect** — the effect changes instead.

---

## 15. Decision register (recommendations requiring/recording user approval)

| # | Decision | Recommendation and tradeoff |
| --- | --- | --- |
| D1 | Internal identifiers (`@tile-meld/*`, repo dir, Render names, DB names, cookie/localStorage keys, Docker/volume names) | **Keep all** (§5.5). Tradeoff: permanent public-name/internal-name mismatch, documented in README. The alternative (full rename) risks live URLs, user sessions, player identities, and local data for zero user value. |
| D2 | Light mode | **Retire it**: both color-scheme branches resolve to the arcade dark palette. Tradeoff: users preferring light UIs get dark; but the brand *is* dark, a light arcade variant doesn't exist in the references, and inventing one would violate the reference-fidelity requirement. Token structure keeps the door open. |
| D3 | Styling stack | **Keep the single global stylesheet + tokens.** No Tailwind/framework — the visual effects need ~200 new lines of CSS, not a dependency. |
| D4 | Existing image files | The three old icon PNGs: **replaced** (new art, new paths), old paths kept one release then deleted. No other product images exist. Concept PNGs: committed as-is (2 MB each is acceptable in-repo reference material; not served). |
| D5 | Fonts | **Silkscreen (SIL OFL), self-hosted woff2, license file committed.** Licensing review = OFL attribution requirements only; no paid license. Body text stays system stack for readability. |
| D6 | Arcade corner notches | Selective two-layer clip-path on major panels only; simple border+glow elsewhere. Tradeoff: slight visual simplification vs. concept in minor components, for maintainability. |
| D7 | Perspective grid scope | Site-wide page background (concepts show it on lobby AND game), implemented at `body`/`.page` level as the layout contract's `tabletop-page-background` slot anticipated ("if ever needed site-wide"). |
| D8 | Visual regression testing | **Manual screenshot review at phase gates; no pixel-diff CI.** Tradeoff: humans must look; but pixel tests across 5 engines would be brittle noise. |
| D9 | "Recently moved" tile state | **Deferred** unless implementable purely from existing client-side patch events (it does not exist today; the task lists it as a state that "must remain obvious," and a state that doesn't exist cannot regress). Disabled-tile dimming, also new, IS implemented (trivial and behavior-free). |
| D10 | Neon performance | Static box-shadows and gradients only; no animated shadows/filters; no `backdrop-filter`; background grid is one static layer. Lighthouse spot-check at Phase 8. |
| D11 | `concept-04` = portrait correction (B2) | **Confirmed by the user 2026-07-26.** Resolved. |
| D12 | "How to Play" panel from concepts | **Not built** — no rules content exists in the app; adding it is a content feature, not a reskin. Candidate follow-up task. |
| D13 | ™ mark in the logotype | **Never rendered** in the app. |

---

## 16. Risk register and rollback

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Contrast failures on navy (axe gate) | High (it's the #1 failure mode of neon themes) | Token-level contrast table before styling screens (Phase 2); text on solid surfaces only; axe runs every phase |
| Stale phone icons after deploy | Medium | New icon paths + manifest/HTML updates; old paths kept; documented refresh behavior (§6.4/§9.4) |
| E2E breakage from rename | Certain but bounded | Helper-first update, single commit, full matrix at Phase 1 |
| dnd drop precision regression from tile/spacing changes | Medium | Keep geometry within spec §10; full matrix at Phase 4; revert sizes on flake |
| StrictMode double-invoke bugs from new UI state | Medium | Pure updaters only; the known Undo-bug pattern is documented in CLAUDE.md |
| Neon glow performance on phones | Low-Medium | D10 constraints; Lighthouse check |
| ~~Missing logo stalls Phase 6 (B1)~~ | Resolved 2026-07-26 | Logo master supplied (`meld-masters-concept-logo.png`); Phase 6 unblocked |
| Portrait assets delayed/not approved (B3) | Open | Phase 5 pauses independently; fallback silhouette ships first if partial |
| Icon derivation needs alpha/inset processing (master is RGB, no alpha; neon border near edge) | Certain but small | §6.2 derivation notes; verify each output in DevTools maskable preview + real devices |
| Pixel font readability | Medium | Display font for headings/labels only; body stays system; minimum sizes enforced |
| Old artwork accidentally reintroduced | Low | Guard test (§12.2); no obsolete art exists in-repo today |
| Prod-only asset breakage (e2e runs dev server) | Medium | Mandatory Docker/dist manual check at Phases 6 and 8 |
| Render deploy state unknown | Pre-existing | Phase 8 verifies deploy separately; not a refresh blocker |

**Rollback:** every phase is one reviewed commit on a feature branch;
rollback = revert that commit. No database, schema, API, cookie, or storage
changes exist anywhere in the plan, so rollback is always UI-only and safe.
Icons: old paths still serve during the transition release, so reverting
Phase 6 restores the old brand cleanly. The rename (Phase 1) is one commit
and reverts symmetrically (tests included). Nothing in the plan force-pushes
or rewrites history.

---

## 17. Final handoff instructions for Sonnet (the executor)

You are implementing this plan **one approved phase at a time**. For every
phase:

1. **Before touching anything:** re-read this plan's section for the phase,
   `CLAUDE.md` (especially "Areas that require special care"),
   `docs/task.md`, and the current state of every file the phase lists.
   Verify the repository state matches the phase's preconditions. If the
   plan and the repository disagree, STOP and report the discrepancy — do
   not silently pick one.
2. Implement **only** that phase's tasks. Its non-goals are binding.
3. Run the specified verification: the full gate (with `TEST_DATABASE_URL`
   and `DATABASE_URL` pointing at `tilemeld_test` — never run tests without
   this), plus the phase's e2e scope.
4. **Stop.** Summarize every changed file and what changed in it. Provide
   screenshots, or exact local review instructions (commands + URLs +
   what to look at), for anything visual.
5. **Never continue automatically into the next phase.** Wait for explicit
   human approval of the checkpoint.
6. **Never run `git add`, `git commit`, or `git push` unless the user
   separately and explicitly instructs it for that specific phase.** The
   suggested commit messages in §11 are for when that instruction comes.
   (This is deliberately stricter than the repository's general Git policy;
   for this project it is the agreed workflow.)
7. Never use mahjong imagery, old Tile Meld artwork, or any prohibited
   reference (§4). Never generate, trace, or crop character/logo art from
   the concept images — production art arrives as supplied, approved
   assets: the logo master is
   `docs/design-reference/meld-masters/meld-masters-concept-logo.png`
   (icon derivations per §6.2 are permitted); portrait assets are Blocker
   B3. If an expected asset is missing, report it as blocked; do not
   invent a substitute.
8. Respect the asset-safety contract (`apps/web/src/assets/tabletop/
   README.md`, `docs/tabletop-layout-contract.md`) for every decorative
   layer you add: text stays live HTML, controls stay HTML, decoration
   never captures pointer events, missing assets never degrade usability.
9. A rejected tool call or blocked permission means stop and ask — not find
   another route.
