# Meld Masters visual refresh — Phase 6 summary

## 1. Date

2026-07-27 (UTC).

## 2. Starting branch and commit

`main` @ `26f3233e9d68397803dea004f8af316fd166a5c5` ("fix(theme): Phase 4
closure — contrast comment, isolated e2e verification, full screenshot
set").

## 3. Starting upstream and worktree status

Verified before any edit: `origin/main` configured as upstream, `git fetch`
showed 0 ahead / 0 behind, `git status --short` empty (clean worktree).

## 4. Verified Phase 4 closure commit

Both Phase 4 commits confirmed present in history and pushed:

- `7bf9ec2` — "feat(theme): arcade tabletop — board, rack, tiles, status,
  and action bar" (implementation).
- `26f3233` — "fix(theme): Phase 4 closure — contrast comment, isolated
  e2e verification, full screenshot set" (closure follow-up; its hash was
  not recorded in its own summary document by design — obtained here from
  `git log`).

## 5. Approved logo master

`docs/design-reference/meld-masters/meld-masters-concept-logo.png` —
1254×1254 PNG, RGB (no alpha), opaque black outside a rounded-square
silhouette. Confirmed unchanged throughout this phase: MD5
`2ad3f6fc7506cc47d673a4b0689ced46`, 1,866,257 bytes, identical before and
after `scripts/derive-icons.py` ran (the script only ever opens it for
reading).

## 6. Derivation method

Mechanical processing only, via Pillow (Python), never redrawing or
regenerating any part of the composition:

1. **Corner-to-transparency.** The master's black corners are not a
   uniform color key — the true edge of the rounded-square shape blends
   from pure black into the navy interior over ~15-20px, confirmed by
   direct pixel sampling (`(627,0)`→`(0,0,0)`, `(627,20)`→`(0,0,0)`,
   `(627,40)`→`(9,16,36)`: a jump of >30 per channel right at the shape's
   true boundary). A 4-corner flood fill with `thresh=40` reliably
   captures exactly the connected background region without leaking into
   the interior, recovering the rounded-square silhouette as real alpha.
2. **Resize** every output with `Image.LANCZOS`.
3. **Maskable variants**: the whole alpha-corrected mark resized to 80% of
   the target canvas, centered, composited onto a full-bleed opaque navy
   square (`icons/icon-maskable-{192,512}.png`) — the master's own neon
   border sits close to its bounding edge, so an inset was required for
   the mark to survive a circular/squircle safe-zone mask (§14).
4. **Apple touch icon**: same compositing at a lighter 92% inset (iOS
   applies its own mask shape, so this doesn't need to be as aggressive as
   the maskable inset) — `icons/apple-touch-icon.png`, 180×180, fully
   opaque.
5. **Favicons**: the alpha-corrected mark at 16/32/48px written directly
   to a multi-size `favicon.ico` (Pillow's native ICO writer); a 128px
   PNG of the same mark base64-embedded in a minimal, fully self-contained
   `<svg>` wrapper for `icons/favicon.svg` (§17).

## 7. Derivation script details

`scripts/derive-icons.py` (new, committed). Deterministic: no
`Math.random()`/timestamp inputs, reads only the master, never writes to
it. Rerunning it reproduces byte-identical PNGs (same LANCZOS resampling,
same flood-fill threshold, same compositing math each time) — verified by
running it twice during this phase and diffing the outputs (`0 differences`,
confirmed via `cmp`).

`scripts/render-icon-preview.py` (new, committed) is a second, separate
script that composites the already-derived outputs (never the master
directly) into the documentation-only preview sheet (§29) — kept as a
script per the "prefer keeping a small deterministic derivation script"
guidance, in case Phase 7+ needs to regenerate the preview after any
future icon change.

## 8. Confirmation that the master was not modified

MD5 checksum taken before running the derivation script and re-checked
after every subsequent run this phase: `2ad3f6fc7506cc47d673a4b0689ced46`,
unchanged in every check. The derivation script only ever calls
`Image.open(SRC)` (a read), never `.save()` on `SRC`.

## 9. Complete output inventory

| File | Purpose |
| --- | --- |
| `apps/web/public/icons/icon-192.png` | Manifest `purpose: "any"` |
| `apps/web/public/icons/icon-512.png` | Manifest `purpose: "any"`; also referenced by `og:image` intent (deferred, §19) |
| `apps/web/public/icons/icon-maskable-192.png` | Manifest `purpose: "maskable"` |
| `apps/web/public/icons/icon-maskable-512.png` | Manifest `purpose: "maskable"` |
| `apps/web/public/icons/apple-touch-icon.png` | `<link rel="apple-touch-icon">` |
| `apps/web/public/icons/favicon.svg` | `<link rel="icon" type="image/svg+xml">` |
| `apps/web/public/favicon.ico` | `<link rel="icon" sizes="48x48">` + legacy auto-fetch |

## 10. Dimensions

| File | Dimensions |
| --- | --- |
| `icon-192.png` | 192×192 |
| `icon-512.png` | 512×512 |
| `icon-maskable-192.png` | 192×192 |
| `icon-maskable-512.png` | 512×512 |
| `apple-touch-icon.png` | 180×180 |
| `favicon.ico` | 16×16, 32×32, 48×48 (multi-size, confirmed via `PIL.IcoImagePlugin`: `{(16,16),(32,32),(48,48)}`) |
| `favicon.svg` | `viewBox="0 0 128 128"`, embeds a 128×128 raster |

All verified programmatically (not just at generation time) in
`apps/web/test/manifestIcons.test.ts`, which decodes each PNG via `pngjs`
and asserts `width`/`height` against these exact values.

## 11. File modes and transparency behavior

| File | Mode | Corner behavior |
| --- | --- | --- |
| `icon-192.png` / `icon-512.png` | RGBA | Transparent (alpha 0) at all 4 corners — verified by `manifestIcons.test.ts` sampling a 3×3 block per corner |
| `icon-maskable-192.png` / `icon-maskable-512.png` | RGB (no alpha channel) | Fully opaque everywhere by construction; also explicitly checked at all 4 corners |
| `apple-touch-icon.png` | RGB (no alpha channel) | Fully opaque everywhere; no baked corner-rounding mask — a plain square image, iOS applies its own shape |

## 12. Exact file sizes

| File | Bytes |
| --- | --- |
| `icons/icon-192.png` | 56,927 |
| `icons/icon-512.png` | 348,055 |
| `icons/icon-maskable-192.png` | 34,073 |
| `icons/icon-maskable-512.png` | 200,279 |
| `icons/apple-touch-icon.png` | 38,306 |
| `icons/favicon.svg` | 38,354 |
| `favicon.ico` | 9,626 |

All PNGs saved with Pillow's `optimize=True` (mechanical compression, no
visual change). No promotional imagery, no runtime image-processing
library, and no external icon/metadata request was added anywhere in the
app.

## 13. Standard-icon treatment

`icon-192.png`/`icon-512.png`: the alpha-corrected master resized directly
with LANCZOS, transparent corners preserved, no additional inset — the
master's own margin between its rounded-square shape and the canvas edge
is already sufficient at `purpose: "any"` sizes. Crown + twin-M silhouette
legible at both sizes; the fine pip details soften slightly at 192px, as
expected and explicitly permitted (not manually repainted).

## 14. Maskable safe-area treatment

Inset to 80% of the canvas, centered, on a full-bleed opaque navy field —
the standard maskable-icon safe zone (an 80%-diameter circle centered in
the icon). Verified visually via the preview sheet's circular and
rounded-square crop guides (§29): the neon border and crown clear both
guide shapes with comfortable margin at every corner and edge.

## 15. Apple touch treatment

Inset to 92% (lighter than the maskable inset — iOS's own corner mask is
closer to full-bleed than Android's more aggressive circular option),
composited onto the same full-bleed opaque navy, no baked rounded-corner
mask of our own. 180×180 per Apple's documented size, fully opaque so iOS
never composites black behind stray alpha.

## 16. Favicon treatment

`favicon.ico`: 16/32/48px multi-size ICO, transparent corners (same
alpha-corrected mark, not the opaque navy-field variant) — legible at 48px
in the preview sheet; the crown+twin-M silhouette still reads at 16px,
softened but not repainted.

## 17. SVG raster-wrapper decision and rationale

The approved source is raster (1254×1254 PNG), not vector, and tracing it
into true vector paths would mean redrawing the composition — explicitly
prohibited. The permitted alternative (a mechanically generated,
self-contained SVG wrapper embedding an optimized raster derivative) was
used instead: `icons/favicon.svg` is a single `<svg viewBox="0 0 128
128">` containing one `<image>` element whose `href` is a base64-encoded
data URI of the alpha-corrected mark at 128px. No external reference, no
developer-machine path, no hand-drawn approximation — verified by
`manifestIcons.test.ts` (no `http(s)` resource URL, no `/home/`-style
path). This is not pixel-perfect at every zoom level the way true vector
would be, but is fully self-contained and renders correctly as a favicon;
documented here as the accepted limitation rather than silently claiming
vector fidelity.

## 18. Manifest changes

`apps/web/public/manifest.json`:

- `theme_color` and `background_color`: `#2f6fb4` (old Tile Meld blue) →
  `#0a0e1a` (the shared `THEME_COLOR` constant, §20).
- `icons` array replaced: the old 2-entry `/icon-192.png`/`/icon-512.png`
  (`purpose: "any"` only) → the 4 required entries at `/icons/...` paths
  (2× `any`, 2× `maskable`), exact `sizes`/`type`/`purpose` per the plan.
- Preserved unchanged: `name`, `short_name` (already "Meld Masters" from
  Phase 1), `description`, `start_url`, `scope`, `display: "standalone"`.

## 19. HTML metadata changes

`apps/web/index.html`:

- `<meta name="theme-color">`: `#2f6fb4` → `#0a0e1a`.
- Icon links: `apple-touch-icon` → `/icons/apple-touch-icon.png`; added
  `<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">`
  (modern, tried first); kept a PNG `<link rel="icon">` at
  `/icons/icon-192.png` and an explicit ICO fallback link
  (`/favicon.ico`, `sizes="48x48"`) for agents that support neither of the
  first two.
- Added `<meta name="description">`: "A turn-based tile-melding strategy
  game for friends and computer opponents." — grounded in the actual
  game (turn-based, tile-melding, human + computer opponents), no claims
  about unsupported features.
- Added minimal Open Graph tags: `og:title`, `og:description`, `og:type`.
  **`og:url` and `og:image` were deliberately omitted, not deferred
  silently**: no canonical production URL is documented anywhere in this
  repository (`docs/deploy-render.md` documents *how* to deploy, not a
  fixed public URL to build absolute links from), and a bare relative
  `og:image` is unreliable for social-media crawlers, which generally
  require an absolute URL. Inventing one was out of scope per this
  phase's own instructions. This is a documented gap, not an oversight —
  revisit once a production URL is fixed and can be added without
  invention.
- Preserved unchanged: `<title>Meld Masters</title>`, `<link
  rel="manifest">`, the viewport meta, the `<script type="module"
  src="/src/main.tsx">` entry point.

## 20. Theme/background color decision

`#0a0e1a` — `--bg-page` in `apps/web/src/styles/global.css`, the Phase
2-approved arcade navy (the page's own background, and the color the
header/site already render against). Chosen over sampling a color from
inside the logo master itself (which reads slightly bluer/more purple —
e.g. `(9,16,36)` sampled from the master's interior vs. `--bg-page`'s
`(10,14,26)`) because it's the single already-established, documented,
tested token rather than a second, new, undocumented navy value — the
maskable/Apple-touch full-bleed background and the manifest/HTML theme
colors all now trace to exactly one source. The two navies are close
enough in practice that the seam where the logo's own interior meets the
composited full-bleed background is not visually distracting (confirmed
in the preview sheet, §29).

**Source-of-truth mechanism** (per the "avoid duplicating unexplained
color literals" requirement): a single new exported constant,
`THEME_COLOR = "#0a0e1a"`, added to `packages/shared/src/branding.ts`
alongside the existing `PRODUCT_NAME`. `manifestIcons.test.ts` asserts
`manifest.json`'s `theme_color`/`background_color` and `index.html`'s
`<meta name="theme-color">` all equal this constant, **and** that
`global.css` still defines `--bg-page` with the same literal value — so a
future edit to either side can't silently drift from the other. No
build-time generator was added; this is exactly the "narrowly scoped
metadata constant + consistency test" option the task explicitly allows.

## 21. Service-worker icon-path change

`apps/web/public/sw.js`: both `icon` and `badge` in the push-notification
options changed from `/icon-192.png` to `/icons/icon-192.png`. Nothing
else in the file changed — no caching added, no precaching, no push
payload/timing/lifecycle change; `skipWaiting()` and `clients.claim()`
untouched.

## 22. Confirmation that the `tile-meld` notification tag remains

Unchanged: `tag: "tile-meld"` (the default payload literal) and `tag:
payload.tag` (the actual notification call) are both byte-identical to
before this phase. `manifestIcons.test.ts` and the pre-existing
`brandConsistency.test.ts` both assert this string is still present.

## 23. Transitional old-icon compatibility

`apps/web/public/icon-192.png`, `icon-512.png`, and `apple-touch-icon.png`
(the pre-Phase-6 trio) were **not deleted** — kept in place for one
transitional release exactly as the plan specifies (§6.2), so a
previously-cached HTML page or an already-installed PWA referencing the
old paths never 404s. Confirmed via the production-server check (§27):
all three still return HTTP 200. No currently-active metadata (manifest,
`index.html`, `sw.js`) references any of the three anymore —
`manifestIcons.test.ts` asserts this explicitly.

**Cleanup item for a later phase**: once one full release has shipped
with the new `/icons/...` paths live, delete
`apps/web/public/icon-192.png`, `icon-512.png`, and `apple-touch-icon.png`,
and drop the corresponding transitional-compatibility test assertions in
`manifestIcons.test.ts` / `brandConsistency.test.ts`'s `public/` allowlist.
Not done in this phase — recorded here per the plan's own §16 rollback
notes and the binding non-goal against deleting them now.

## 24. Cache and installed-app refresh behavior

Confirmed this session, not assumed:

- The service worker caches nothing (unchanged from before this phase —
  `sw.js` has no `caches.open`/`fetch` handler at all, only
  install/activate/push/notificationclick). Static files are served
  exactly as `@fastify/static` already served them (`apps/server/src/
  app.ts`), unaffected by this phase.
- The new icon paths (`/icons/...`, a directory that didn't exist before)
  guarantee no cache layer can pair old bytes with new markup at the HTTP
  layer — a stale cached HTML referencing `/icon-192.png` still resolves
  (transitional compatibility, §23); a fresh page load gets the new path.
- What this phase's engineering **cannot** guarantee: OS/launcher-level
  icon caching. Documented, not claimed fixed:
  - **Android**: an already-installed PWA's home-screen icon/label may not
    refresh immediately on next visit even though the manifest changed;
    behavior varies by Chrome version and OS. Uninstalling and
    reinstalling the PWA is the guaranteed refresh path.
  - **iOS**: "Add to Home Screen" icons are snapshots taken at add-time,
    not re-fetched later. Removing and re-adding the shortcut is the only
    guaranteed refresh path.
  - **Desktop installed PWAs**: similarly may retain old window/taskbar
    art until reinstalled, depending on the OS/browser's own icon cache.

## 25. Tests added or updated

- **New**: `apps/web/test/manifestIcons.test.ts` — 20 tests: manifest
  parses; name/short_name; theme/background color match `THEME_COLOR` and
  are not the old blue; all 4 icon entries exact; every manifest icon path
  resolves to a real file; no old-root-path references in the manifest;
  PNG dimensions + corner transparency/opacity for every icon (via
  `pngjs`, a new small devDependency used only in tests, never bundled
  into the app); favicon.ico and favicon.svg exist and the SVG has no
  external reference or dev-machine path; old root icons still exist;
  `index.html` references only new paths and its theme-color matches;
  `index.html` has a real description meta; `sw.js` uses the new icon
  path and keeps the `tile-meld` tag; `--bg-page` still matches
  `THEME_COLOR`.
- **Updated**: `apps/web/test/brandConsistency.test.ts` — the existing
  "obsolete-asset guard" allowlist extended to include the newly-added
  `favicon.ico` and `icons/` (directory), plus one new test asserting
  `public/icons/` itself contains only the expected 6 Phase 6 files (no
  reintroduced old-branding or unexpected asset).
- **New devDependency**: `pngjs` + `@types/pngjs` in `apps/web`
  (devDependency only, not shipped in the production bundle) — chosen
  over hand-rolling a PNG decoder for the pixel-level transparency checks,
  which a header-only parser can't provide; explicitly not a "large
  image-processing library" (pure JS, no native deps, ~40KB).

## 26. Commands run and exact results

Database safety: `TEST_DATABASE_URL` and `DATABASE_URL` both exported to
the disposable `tilemeld_test` database (per `CLAUDE.local.md`) before any
command touching a truncatable database; neither value nor any connection
string was printed to logs or this document.

| Command | Result |
| --- | --- |
| `pnpm --filter @tile-meld/web test` (iterating) | pass — 201/201, 24 files |
| `pnpm run format:check` | pass |
| `pnpm run lint` | pass |
| `pnpm run typecheck` (6 workspace projects) | pass |
| `pnpm run test` (full suite) | pass — **714 passed**, 0 failed, across `packages/shared` 45, `packages/engine` 115, `packages/bot` 36, `apps/web` 201 (180 prior + 21 new), `apps/server` 317 |
| `pnpm run build` | pass — web + server; `apps/web/dist/icons/*` and `apps/web/dist/favicon.ico` present in the build output |

## 27. Production-server asset verification

`node apps/server/dist/index.js` run locally (not the Docker image — the
Dockerfile's multi-stage `deploy/server` output only exists inside a
container build; running the compiled server directly against the same
`dist/` output is an equivalent verification of `@fastify/static`'s real
serving behavior, since `app.ts` resolves `webDistDir` relative to its own
compiled location either way).

| Path | HTTP | Content-Type | Bytes match `dist/` source |
| --- | --- | --- | --- |
| `/manifest.json` | 200 | `application/json; charset=utf-8` | match |
| `/icons/icon-192.png` | 200 | `image/png` | match |
| `/icons/icon-512.png` | 200 | `image/png` | match |
| `/icons/icon-maskable-192.png` | 200 | `image/png` | match |
| `/icons/icon-maskable-512.png` | 200 | `image/png` | match |
| `/icons/apple-touch-icon.png` | 200 | `image/png` | match |
| `/icons/favicon.svg` | 200 | `image/svg+xml` | match |
| `/favicon.ico` | 200 | `image/vnd.microsoft.icon` | match |

Also confirmed: the served `/` HTML's icon/manifest/theme-color tags
resolve only to the new `/icons/...` paths and root `/favicon.ico` — no
reference anywhere to the old `/icon-192.png`, `/icon-512.png`, or
`/apple-touch-icon.png`; and (§23) those three old paths still
independently return 200 when requested directly, confirming transitional
compatibility without them being part of active metadata.

## 28. Chromium result

```
cd e2e && npx playwright test --project=chromium
```

**32/33 passed, 1 failed, 16.2 minutes.** The one failure,
`reconnect-recovery.spec.ts:30` ("recovery: the same identity recovered in
a fresh browser context sees the exact same private game state"), is the
same test already root-caused in the Phase 4 closure
(`docs/meld-masters-phase-4-summary.md` §12) to the local dev server's
shared recovery-endpoint rate limit (5 req/min) — re-confirmed here
directly via the server's own request log for this exact run:

```
POST /api/session/recover -> 429 "Rate limit exceeded, retry in 33 seconds"
```

Not a Phase 6 regression: this phase touched zero server/session/recovery
code (only static assets, `manifest.json`, `index.html`, and `sw.js`).
Every other test passed, including all 7 `accessibility.spec.ts` axe
checks (unaffected by the metadata changes) and
`drag-and-drop.spec.ts`/`tabletopMobile.spec.ts` (confirming no
interaction-geometry regression, though none was expected from a
branding-only phase). Per the plan, a full 5-project matrix is not
required for Phase 6 (no interaction geometry or browser-specific
behavior changed) and was not run.

## 29. Phase 6 review-material inventory

- **Path**: `docs/design-reference/phase-6-review/` (new directory; no
  prior review directory was overwritten).
- **`icon-preview-sheet.png`** (documentation only, never a production
  asset — generated by `scripts/render-icon-preview.py`, itself a small
  deterministic script, not a manual composite): two rows (light
  background, dark background), each showing `icon-192.png`,
  `icon-512.png`, the maskable icon under a circular crop guide, the
  maskable icon under a rounded-square crop guide, `apple-touch-icon.png`,
  and the 48/32/16px favicon frames extracted from `favicon.ico`.
- **`home--1440x900.png`**, **`home--390x844.png`**: Home page at desktop
  and mobile widths, confirming the metadata-only changes this phase made
  did not disturb the existing interface (captured by
  `e2e/scripts/capture-phase-6-home.ts`, kept outside `e2e/tests` like the
  other capture scripts).
- No sensitive data in any review material (no recovery secrets, no
  credentials, no real user data — Home page was captured from a fresh,
  unclaimed identity).

## 30. Manual Android checklist

Not performed on a real device this session — for the user (or a
real-device operator) to execute:

1. Open the production or local-network URL in Chrome for Android.
2. Chrome DevTools → Application → Manifest (if testing via a
   desktop-tethered/remote-debugged session): confirm no warnings and that
   the installability check passes.
3. Install to home screen.
4. Verify the app label reads exactly "Meld Masters".
5. Verify the launcher icon shows the Meld Masters mark, not the old
   Tile Meld art.
6. Verify maskable cropping: the launcher's own mask (varies by OEM/
   launcher — circle, squircle, rounded square) should not clip the crown
   or neon border, matching the preview sheet's crop-guide simulation.
7. Verify the splash screen shows the navy (`#0a0e1a`) background with the
   icon, not a flash of white or the old blue.
8. Verify appearance over both a light and a dark launcher wallpaper.
9. If an old Tile Meld PWA was previously installed on this device: launch
   it, confirm the in-app content already reflects Meld Masters (HTTP
   layer is `max-age=0`, so this should be immediate), then observe
   whether the launcher icon/label update on their own — if not,
   uninstall and reinstall as the guaranteed refresh path (§24).

## 31. Manual iOS checklist

Not performed on a real device this session:

1. Open the production or local-network URL in Safari on iPhone/iPad.
2. Use Share → Add to Home Screen.
3. Verify the label reads exactly "Meld Masters".
4. Verify the Apple touch icon (the 180×180 opaque navy icon) appears, not
   the old art and not a plain screenshot fallback.
5. Verify the icon background is fully opaque with no visible transparency
   artifact, and that iOS's own corner-rounding looks clean (nothing baked
   in should conflict with it).
6. If an old Tile Meld icon was previously added to the Home Screen:
   remove that shortcut and re-add it — iOS Home Screen icons are
   snapshots and will not update in place (§24).

## 32. Manual desktop-installed-PWA checklist

Not performed on a real device this session:

1. In Chrome (or another Chromium-based browser), open the app and use the
   install prompt (address-bar icon or menu → Install Meld Masters).
2. Verify the installed app's name is "Meld Masters" in the window
   titlebar and OS app list.
3. Verify the window icon, and the taskbar/dock icon, show the new mark.
4. Verify the app opens in standalone display mode (no browser chrome),
   matching the existing `"display": "standalone"` manifest setting
   (unchanged this phase).
5. If a previous install exists with old branding: remove it and reinstall
   to confirm the new icon appears (§24).

## 33. Checks not performed on real devices

Everything in §30-32 above. This session verified, locally and
automatically: file existence, dimensions, transparency/opacity,
manifest/HTML/service-worker correctness, production static-file serving
(HTTP status, content-type, byte-for-byte match), and Chromium
Playwright's manifest/page-level checks (§28). No physical Android device,
iPhone/iPad, or desktop-installed-PWA verification was performed, and none
of it is claimed as passed — §30-32 are handed to the user as exact
checklists.

## 34. Confirmation no Phase 5 portrait work occurred

No file under `apps/web/src/assets/portraits/`, no `Portrait.tsx`, no
portrait placeholder of any kind. `git diff --stat` against the pre-Phase-6
commit touches only the files listed in §38.

## 35. Confirmation no Phase 7 work occurred

No file under `apps/web/src/styles/global.css` beyond what §18-21 already
lists (no responsive/accessibility sweep), no new component, no keyboard/
screen-reader/reduced-motion/200%-zoom work. Phase 7's own scope
(`docs/meld-masters-visual-refresh-plan.md` §11, Phase 7) is entirely
unaddressed here, by design.

## 36. Confirmation no gameplay or screen-layout behavior changed

No file under `packages/engine/src`, `packages/bot/src`, or
`apps/server/src` (other than what static-file serving already did,
unmodified) was touched. No file under `apps/web/src/tabletop/`,
`apps/web/src/pages/` (other than the Home page being *viewed*, not
edited, for §29's screenshots), or any game-logic module was touched.
Confirmed by the diff itself and by the full test suite (§26) showing
identical per-package counts to Phase 4 closure plus exactly the new
Phase 6 tests.

## 37. Remaining B3 portrait blocker

Unchanged: production character-portrait assets have not been supplied.
Still blocks only Phase 5, which remains untouched by this phase.

## 38. Files changed

| File | Purpose |
| --- | --- |
| `packages/shared/src/branding.ts` | +`THEME_COLOR` constant (§20) |
| `apps/web/public/manifest.json` | New icons array, navy theme/background colors (§18) |
| `apps/web/index.html` | New icon links, theme-color, description, OG tags (§19) |
| `apps/web/public/sw.js` | Icon/badge path → `/icons/icon-192.png` (§21) |
| `apps/web/public/icons/icon-192.png` | New (§9-13) |
| `apps/web/public/icons/icon-512.png` | New |
| `apps/web/public/icons/icon-maskable-192.png` | New |
| `apps/web/public/icons/icon-maskable-512.png` | New |
| `apps/web/public/icons/apple-touch-icon.png` | New |
| `apps/web/public/icons/favicon.svg` | New |
| `apps/web/public/favicon.ico` | New |
| `apps/web/test/manifestIcons.test.ts` | New: 20 tests (§25) |
| `apps/web/test/brandConsistency.test.ts` | Updated allowlist + 1 new test (§25) |
| `apps/web/package.json` / root lockfile | +`pngjs`, `@types/pngjs` devDependencies |
| `scripts/derive-icons.py` | New: deterministic icon derivation script (§7) |
| `scripts/render-icon-preview.py` | New: deterministic preview-sheet script (§7) |
| `e2e/scripts/capture-phase-6-home.ts` | New: Home page review screenshots (§29) |
| `docs/design-reference/phase-6-review/*.png` (3 files) | New: review materials (§29) |
| `docs/meld-masters-phase-6-summary.md` | This document |
| `docs/task.md` | Phase 6 completed, Phase 5 still blocked on B3, Phase 7 next |

## 39. Manual review instructions

- **This summary**: `docs/meld-masters-phase-6-summary.md`.
- **The icon pipeline**: `scripts/derive-icons.py` (inline comments
  explain every derivation step and why); rerun it
  (`python3 scripts/derive-icons.py`) to confirm byte-identical output.
- **Preview sheet**: `docs/design-reference/phase-6-review/
  icon-preview-sheet.png` — open directly, or run
  `python3 scripts/render-icon-preview.py` to regenerate it.
- **New tests**: `apps/web/test/manifestIcons.test.ts`.
- **Manual device checklists**: §30-32 above — these still need a human
  with the actual devices.

## 40. Recommended next step

**User device verification and human approval before Phase 7.** Complete
the Android/iOS/desktop-installed-PWA checklists in §30-32, then review
this summary and the preview sheet. Phase 7 (responsive refinement and
accessibility, plan §11) has not started and should not begin until this
checkpoint is reviewed.
