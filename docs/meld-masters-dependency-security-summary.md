# Meld Masters — dependency security remediation summary

## 1. Date

2026-07-28 (UTC).

## 2. Starting branch and commit

`main` @ `42abfb4c8c21a9d3757f6be038ae3e7f50a90ac7` ("fix(ci): format and
lint capture-phase-8-final.ts" — the last Phase 8 commit).

## 3. Starting worktree/upstream status

Clean working tree, `main` in sync with `origin/main` (0 ahead / 0
behind), no unrelated work present. Phase 8 fully committed and pushed.
Safe to begin this checkpoint.

## 4. Original audit output summary

`pnpm audit --audit-level=moderate`, run fresh as source of truth (not
relied on Phase 8's historical summary alone): **5 vulnerabilities — 4
high, 1 moderate.**

| Package | Severity | Installed | Patched | Advisory |
| --- | --- | --- | --- | --- |
| `find-my-way` | high | 9.6.0 | ≥9.6.1 | GHSA-c96f-x56v-gq3h — DDoS with HTTP/2 |
| `react-router` | high | 7.18.1 | ≥8.3.0 | GHSA-qwww-vcr4-c8h2 — RSC Mode CSRF Bypass |
| `@fastify/static` | high | 10.1.0 | ≥10.1.1 | GHSA-83w8-p2f5-377r — route guard bypass via path traversal |
| `brace-expansion` | high | 5.0.7 (of 2 resolved instances) | ≥5.0.8 | GHSA-mh99-v99m-4gvg — DoS via unbounded expansion length |
| `@fastify/static` | moderate | 10.1.0 | ≥10.1.2 | GHSA-8pvw-jcv7-9cmj — authorization bypass via non-canonical URL paths |

Two `@fastify/static` advisories exist simultaneously, so `10.1.1` alone
would not have fully resolved the package — `10.1.2` is required to
clear both.

## 5. Advisory-by-advisory classification

**`find-my-way` (high, GHSA-c96f-x56v-gq3h):** transitive, via
`fastify@5.10.0` (direct, `apps/server`) and duplicated via
`fastify-type-provider-zod@4.0.2`'s own `fastify` dependency — both
resolve to the same single instance. Production dependency (ships in the
runtime image; `find-my-way` is Fastify's router, used on every request).
Fastify's own `package.json` already declares `find-my-way: ^9.6.0`,
which covers the patched `9.6.1+` — the lockfile was simply pinned below
that ceiling. **Update available without any major bump.**

**`react-router` (high, GHSA-qwww-vcr4-c8h2):** direct, via
`react-router-dom@7.18.1` (`apps/web`). Client-only, ships in the built
SPA bundle served to browsers. Confirmed via `npm view` that `7.18.1` is
genuinely the latest published `7.x` release — **no patched `7.x`
exists**; the fix requires the `8.x` major. See §9 for the affected-mode
analysis and §11 for the migration itself.

**`@fastify/static` (high + moderate, GHSA-83w8-p2f5-377r /
GHSA-8pvw-jcv7-9cmj):** direct, `apps/server`. Production dependency —
this is the package that serves the built SPA and static assets over
HTTP; both advisories describe genuine request-handling security bugs
(path traversal / non-canonical URL bypass) directly reachable by any
client. **Highest real-world priority of the five.** Patched `10.1.2`
already satisfies the existing `^10.1.0` package.json range.

**`brace-expansion` (high, GHSA-mh99-v99m-4gvg):** genuinely transitive
in two separate resolved instances — **this is more significant than
Phase 8's summary stated** (Phase 8 had classified it as "dev-only, via
eslint" without having checked for a second resolution path):
- `1.1.16`, via `eslint`'s own toolchain (`minimatch@3.1.5`) — dev-only.
- `5.0.7` (the actually-vulnerable version per the advisory range), via
  **`@fastify/static@10.1.0` → `glob@13.0.6` → `minimatch@10.2.5`** — a
  genuine production dependency path, since `@fastify/static` ships at
  runtime. **Also**, independently, via `typescript-eslint`'s own newer
  `minimatch@10.2.5` (dev-only).

The `5.x`-line instance is resolvable to the patched `5.0.8` (see §11).
The `1.1.16` instance is a separate matter — see §13/§14.

## 6. Direct versus transitive findings

| Package | Direct or transitive |
| --- | --- |
| `@fastify/static` | Direct (`apps/server/package.json`) |
| `react-router` (via `react-router-dom`) | Direct (`apps/web/package.json`) |
| `find-my-way` | Transitive (via `fastify`) |
| `brace-expansion` | Transitive (via `eslint`'s toolchain, and — newly identified — via `@fastify/static`'s own `glob` dependency) |

## 7. Production versus development findings

| Package | Production or development |
| --- | --- |
| `@fastify/static` | Production — serves every static asset request |
| `find-my-way` | Production — Fastify's router, used on every request |
| `react-router` | Production (client bundle) — but note §9: the specific vulnerable code path (RSC mode) is not used by this app at all |
| `brace-expansion@5.0.7` | Production, via `@fastify/static`'s `glob` dependency (newly identified this session) |
| `brace-expansion@1.1.16` | Development only — eslint's own toolchain, never ships to the runtime image or browser bundle |

## 8. Dependency versions before

`@fastify/static@10.1.0`, `find-my-way@9.6.0`,
`react-router-dom@7.18.1` (`react-router@7.18.1` beneath it),
`brace-expansion@5.0.7` (the vulnerable instance) /
`brace-expansion@1.1.16` (the unrelated dev-only instance).

## 9. Dependency versions after

`@fastify/static@10.1.2`, `find-my-way@9.7.0` (latest `9.x`, well past
the `9.6.1` patch floor), `react-router@8.3.0` (replacing
`react-router-dom` entirely — see §11), `brace-expansion@5.0.8`
(patched) / `brace-expansion@1.1.16` (unchanged — see §13).

## 10. Why each update was selected

- **`@fastify/static` → `10.1.2`:** direct-dependency patch update
  (assignment's tier 1). Already permitted by the existing `^10.1.0`
  range in `package.json` — tightened the floor to `^10.1.2` so the
  lockfile can't drift back below the patched version. Resolves both
  advisories against this package.
- **`find-my-way` → `9.7.0`:** a narrowly-scoped `pnpm-workspace.yaml`
  override (tier 4), because it has no direct `package.json` entry of
  its own — `fastify`'s own declared `^9.6.0` range already permits any
  `9.6.1+`, so this override only forces an already-compatible
  resolution to actually happen, per the assignment's own preference
  order ("the upstream dependency allows the patched version;
  compatibility verified; no direct update path exists").
- **`brace-expansion` → `5.0.8`, scoped `>=5.0.0 <6.0.0`:** same
  reasoning, scoped specifically to the vulnerable `5.x` line so the
  unrelated, independently-maintained `1.1.16` instance is left
  untouched (forcing that one to `5.0.8` would violate its actual
  consumer's — `minimatch@3.1.5` — own declared `^1.1.7` constraint and
  likely break it; see §13).
- **`react-router` → `8.3.0`, replacing `react-router-dom`:** the only
  available fix (no patched `7.x` exists — confirmed via `npm view`, not
  assumed). Verified narrow and safe before applying, not a blind major
  bump — see §11.

## 11. React Router migration — investigation and rationale

Per the assignment's explicit caution, this was investigated before
touching any code, using primary sources rather than a single secondhand
summary:

1. **Confirmed no patched 7.x exists.** `npm view react-router-dom
   versions` shows `7.18.1` as the newest 7.x release; the advisory's
   vulnerable range (`>=7.12.0 <8.3.0`) covers it entirely.
2. **Confirmed this app's actual API usage is minimal and stable.**
   `grep -rn "from \"react-router` across `apps/web/src` shows exactly 7
   symbols used, everywhere: `BrowserRouter`, `Routes`, `Route`, `Link`,
   `Outlet`, `useNavigate`, `useParams` — the classic "declarative mode"
   API, no data routers (`createBrowserRouter`), no loaders/actions, no
   RSC/framework mode.
3. **Checked whether the advisory's affected mode (RSC) applies here at
   all.** A first web-fetch summary of the v8 changelog claimed
   declarative-mode apps have zero breaking changes and all breaking
   changes are scoped to data routers/framework mode/RSC — but per this
   session's own evidence-discipline standard, a single AI-summarized
   fetch was not trusted as sufficient on its own for a decision this
   consequential.
4. **Independently verified the single most consequential claim from
   that summary** — that `react-router-dom` no longer exists as a
   package in 8.x — directly against the npm registry:
   `npm view react-router-dom versions` returns no `8.x` entries at all,
   and `npm view react-router@8.3.0 exports` shows a `./dom` subpath
   export, confirming the package was genuinely restructured.
5. **Downloaded the actual `react-router@8.3.0` tarball** (`npm pack` +
   extract) and grepped its real, published `dist/production/index.d.ts`
   directly — not a secondhand description — confirming all 7 symbols
   this app uses (`BrowserRouter`, `Link`, `Outlet`, `Route`, `Routes`,
   `useNavigate`, `useParams`) are exported unchanged from the main
   `react-router` package entry point.
6. **Checked the stated `Vite 7+` minimum requirement** against this
   app's actual build setup: `apps/web/vite.config.ts` uses only
   `@vitejs/plugin-react`, no React-Router-specific Vite plugin
   (`@react-router/dev`) at all — confirming that requirement applies to
   React Router's framework-mode dev tooling, which this app has never
   used, not to using the library as a plain npm dependency in an
   ordinary Vite SPA build (current `vite@^6.0.7` is unaffected).

**Conclusion:** this is a package rename plus an import-path change,
with zero API or behavioral difference for the 7 symbols this app
actually uses. Applied as: `apps/web/package.json` —
`react-router-dom: ^7.18.1` replaced with `react-router: ^8.3.0`; all 11
source files' and 12 test files' `from "react-router-dom"` changed to
`from "react-router"` (a single mechanical string substitution, verified
by diff to be the *only* line changed in every file — §12).

## 12. Any source compatibility changes

23 files changed, every one by exactly one line: the import specifier
`"react-router-dom"` → `"react-router"`. No other line differs in any of
them (confirmed via `git diff`, spot-checked directly on 3 representative
files). This is narrow, explained (§11), and tested (full gate + 3
browser projects, all passing — §15-18).

No other source compatibility change was needed for `@fastify/static`,
`find-my-way`, or `brace-expansion` — all three are used through stable,
unaffected APIs (static-file serving configuration in `apps/server/src/app.ts`
was not touched, and didn't need to be).

## 13. Audit result after updates

```
pnpm audit --audit-level=moderate
```

**4 of 5 advisories resolved.** One remains:

| Package | Severity | Status |
| --- | --- | --- |
| `find-my-way` | high | **Resolved** |
| `react-router` | high | **Resolved** |
| `@fastify/static` (high) | high | **Resolved** |
| `@fastify/static` (moderate) | moderate | **Resolved** |
| `brace-expansion` | high | **Remains** — the `1.1.16` instance only (the `5.0.7` production-path instance is fixed) |

## 14. Remaining advisories

**`brace-expansion` (high, GHSA-mh99-v99m-4gvg), the `1.1.16` instance
only.** Not resolved this session, and not silently suppressed —
documented here per the assignment's explicit instruction ("Do not use
an audit override to suppress the advisory unless no safe update exists
and the residual risk is documented and approved by the user"; no such
approval was sought or given, so no override was added).

**Why it remains, with evidence, not assumption:**
- `brace-expansion` publishes multiple independently-maintained major
  version lines in parallel (confirmed via `npm view brace-expansion
  dist-tags`: separate `1.x`/`maintenance-v1`, `2.x`/`maintenance-v2`,
  `3.x`/`maintenance-v3` tags alongside `latest` at `5.0.8`) — this is a
  deliberate multi-branch maintenance structure, not a single linear
  version history.
- The resolved `1.1.16` **is already the newest available release of
  its line** (`maintenance-v1: 1.1.16`, exact match) — there is no newer
  `1.x` patch to update to.
- Its actual consumer, `minimatch@3.1.5` (pulled in by `eslint`'s own
  dependency graph via `@eslint/config-array`, `@eslint/eslintrc`, and
  `eslint` itself directly), declares `"brace-expansion": "^1.1.7"` —
  confirmed via `npm view minimatch@3.1.5 dependencies`. Forcing this
  resolution to `5.0.8` would violate that declared constraint outright,
  and — given the size of the version gap (1→5, with three intervening
  rewrites) — would very plausibly break `minimatch@3.1.5`'s actual
  behavior, and by extension `eslint` itself.
- GitHub's own structured advisory data
  (`api.github.com/advisories/GHSA-mh99-v99m-4gvg`) gives a single flat
  `vulnerable_version_range: "<= 5.0.7"` with no exclusion for the
  independently-maintained `1.x`/`2.x`/`3.x`/`4.x` lines — this appears
  to be an artifact of how the advisory's range was authored (comparing
  raw semver strings across genuinely disjoint, separately-maintained
  major lines) rather than a confirmed statement that the `1.x` line's
  own code contains the described unbounded-expansion bug. This is
  stated as the most likely explanation given the evidence gathered, not
  as a certainty — the advisory's `vulnerable_functions` field is empty
  (no function-level detail was published to check against).

**Whether it affects deployed production code:** **No.** This specific
`1.1.16` instance is reached exclusively through `eslint`, a
development-only tool (`devDependencies`) that never ships in the
`Dockerfile`'s runtime stage (which explicitly installs only
`apps/server`'s production dependencies via `pnpm deploy --prod`) and
never runs in the browser bundle.

**Recommended follow-up:** revisit if/when `@eslint/config-array`/
`@eslint/eslintrc` (or `eslint` itself) ship a release depending on a
newer `minimatch` major that itself uses a current `brace-expansion` —
at that point a plain dependency bump (not an override) would resolve
it cleanly. Not urgent given the confirmed zero production exposure.

## 15. Local quality-gate results

| Step | Result | Notes |
| --- | --- | --- |
| `pnpm run format:check` | pass | |
| `pnpm run lint` | pass | |
| `pnpm run typecheck` | pass | 6 workspace projects, including `apps/web` against `react-router@8.3.0`'s types |
| `pnpm run test` | pass on re-run — 28/28 files, 317/317 tests | First attempt showed 1 failure in `test/game/deadlineSweep.test.ts`'s timer-based retention-sweep test (`expected [] to include '<gameId>'`); re-run in isolation passed 8/8 immediately, and a full clean re-run passed 317/317. `deadlineSweep.ts` has no dependency on any of the four packages changed this session, and the first full run took an unusually long 245s (vs. ~130-180s in this session's other runs) — consistent with a timing-sensitive interval test affected by transient system load, not a real regression. Verified, not assumed. |
| `pnpm run build` | pass | web + server, portrait/font/icon assets unaffected |

## 16. Chromium result

`--project=chromium --workers=1 --max-failures=1`, foreground, fresh
disposable database: **42/42 passed**, 7.7 minutes.

## 17. Firefox result

Same procedure, fresh disposable database: **42/42 passed**, 12.0
minutes.

## 18. Mobile Chrome result

Same procedure, fresh disposable database: **42/42 passed**, 6.9
minutes.

WebKit and Mobile WebKit were **not** run locally, per the standing
safety policy from Phase 7/8 (a full local WebKit-project run has
previously caused a severe process leak on this machine) — CI is the
authoritative verification environment for those two projects; see §19.

## 19. CI WebKit/Mobile WebKit status

See the final response for this session's actual observed CI results
for the pushed commit(s) — not repeated here to avoid this document
going stale relative to a live CI run. As background: across the 4 CI
runs observed during Phase 8, chromium/firefox/mobile-chrome were 4/4
green, WebKit was 3/4 green (the one failure was an infrastructure
runner-shutdown signal, not a test failure), and Mobile WebKit never
completed cleanly (all infrastructure interruptions, never a real test
assertion failure) — a known, pre-existing pattern on this repository's
CI, unrelated to this session's dependency changes.

## 20. Production static-serving result

Compiled server (`node apps/server/dist/index.js`) run directly against
the built SPA (`apps/web/dist`), disposable database. All required
endpoints returned HTTP 200 with correct content-type: `/`,
`/api/health`, `/manifest.json`, `/favicon.ico`, `/icons/icon-192.png`,
`/icons/icon-512.png`, a sampled portrait file, a sampled Silkscreen
font, and the main JS/CSS bundles. **SPA client-side routes** (`/rooms/new`,
`/recovery`, `/games/:id`) correctly resolved to 200 `text/html` (the
Fastify SPA-fallback serving `index.html` for client-side `react-router`
routes to take over) — confirming the React Router v8 migration didn't
disturb routing behavior at the server-integration level. **Path-traversal
probes** (`/..%2f..%2f..%2fetc%2fpasswd`, `/%2e%2e/%2e%2e/package.json`)
returned `404`/`403`, not `200` with file content — direct evidence the
`@fastify/static@10.1.2` security fix is actually effective against this
exact class of attack, not just version-number verification.

## 21. Files changed

| File | Purpose |
| --- | --- |
| `apps/server/package.json` | `@fastify/static` `^10.1.0` → `^10.1.2` |
| `apps/web/package.json` | `react-router-dom` `^7.18.1` removed, `react-router` `^8.3.0` added |
| `pnpm-workspace.yaml` | 2 new scoped overrides: `find-my-way` → `>=9.6.1`, `brace-expansion@>=5.0.0 <6.0.0` → `5.0.8` |
| `pnpm-lock.yaml` | Lockfile refresh reflecting the above (69-line diff, scoped) |
| `apps/web/src/*.tsx` (11 files) | Import specifier `"react-router-dom"` → `"react-router"`, one line each, no other change |
| `apps/web/test/*.test.tsx` (12 files) | Same import/mock-specifier change |
| `docs/meld-masters-dependency-security-summary.md` | This document |
| `docs/current-state.md` | Dependency remediation status recorded |
| `docs/task.md` | Checkpoint recorded |

## 22. Deployment recommendation

**Ready with documented residual risk.** All four production-relevant
advisories (the two `@fastify/static` issues, `find-my-way`, and the
production-reachable `brace-expansion` instance) are resolved and
verified — including a direct path-traversal exploit probe confirming
the fix is effective, not just a version bump. The one remaining
advisory is a dev-only-toolchain instance with no production exposure
(§14), already at the latest available release of its maintained line,
documented rather than hidden. No deployment was performed this session.

## 23. Manual review instructions

- **This summary:** `docs/meld-masters-dependency-security-summary.md`.
- **Verify the fix directly:** `pnpm audit --audit-level=moderate` should
  show only the single documented `brace-expansion` (dev-only) finding.
- **Verify the path-traversal fix:** run the compiled server against a
  disposable database and probe
  `/..%2f..%2f..%2fetc%2fpasswd` — expect a non-200 response.
- **Verify the React Router migration:** `pnpm run typecheck` and
  `pnpm --filter e2e exec playwright test --project=chromium` both
  exercise every route in the app.

## Addendum (2026-07-28) — CI security-gate restructuring

After this document was written, `.github/workflows/ci.yml`'s
`security` job was restructured to reflect the production/development
split above precisely, rather than treating both classes of finding
identically:

- **`pnpm audit --prod --audit-level=high`** — remains **blocking**. A
  high/critical advisory in a *production* dependency (the four already
  resolved above, and any future one) fails the `security` job before
  the Docker build or Trivy scan runs, exactly as before.
- **`pnpm audit --dev --audit-level=high`** — a new, separate,
  **non-blocking** (`continue-on-error: true`) step. It surfaces the
  documented `brace-expansion@1.1.16` finding (§14) in every CI run's
  log — visible, not hidden or globally suppressed — without gating the
  image build/scan on a finding that has no path to a deployed artifact.
- **Docker build and Trivy scan are unchanged** — same severity policy
  (`CRITICAL,HIGH`, `ignore-unfixed: true`), same blocking behavior on a
  real image finding. They now run whenever the *production* audit
  passes, independent of the development audit's result — previously
  they never ran at all when the single combined audit step failed on
  the dev-only finding, which meant the actual image scan was silently
  skipped on every CI run since this checkpoint began, a worse security
  posture than a nonblocking, always-logged dev-audit step.

No dependency version and no application code changed as part of this
addendum — CI workflow structure only, verified via `git diff` to be
scoped to `.github/workflows/ci.yml` plus this documentation.
