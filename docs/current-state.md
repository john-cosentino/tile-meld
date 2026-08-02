# Current state — Meld Masters

Public product name: **Meld Masters** (renamed from Tile Meld, Phase 1 of
`docs/meld-masters-visual-refresh-plan.md`, 2026-07-26). `tile-meld` remains
the internal repository name, package scope, and deployment identifier —
see the plan's §5.5.

## Addendum 2026-08-01 — concept-art fidelity rebuild (branch, unmerged)

Everything below the addendum describes `main` as of 2026-07-28 and,
separately, `main` later received the tabletop arcade integration +
first deployment (`8f98c8e`, live at `https://tile-meld.onrender.com/` —
see `docs/meld-masters-deployment-fix-report.md`). Since then the entire
visual layer was rebuilt on **`feature/arcade-pixel-kit`** to match the
concept art (chrome sliced from the concept PNGs, VT323, region-checked
compositions) — state, verification, and next steps in `docs/task.md`;
mechanics in `docs/arcade-visual-kit.md`. Verified on the branch:
469 web unit tests, full chromium e2e 46/46, three region contracts.
The branch is **not merged and not deployed**; the deployed site still
shows the superseded glossy tabletop.

- **Last verified:** 2026-07-28 (CI security-gate restructuring, on top
  of the dependency security remediation checkpoint, on top of Phase 8)
- **Commit at verification start:** `358ab99e428fcf31e853b20920a31076bb9d86c1`
  (the dependency remediation checkpoint's last commit). See `git log`
  for the current `main` tip; the exact hash of this checkpoint's own
  commit is deliberately not repeated here — see
  `docs/meld-masters-dependency-security-summary.md`.
- **Working tree at verification start:** clean, branch `main`, in sync
  with `origin/main` (0 ahead / 0 behind)

The visual refresh (`docs/meld-masters-visual-refresh-plan.md`) is
functionally complete through Phase 8. A focused dependency-security
remediation checkpoint followed — see
`docs/meld-masters-dependency-security-summary.md` for the full writeup.
This file replaces the pre-refresh-era verification snapshot; the
visual-refresh phase summaries (`docs/meld-masters-phase-0-summary.md`
through `-phase-8-summary.md`) are the authoritative record of what
changed and why.

## Dependency security status, 2026-07-28

Fresh `pnpm audit --audit-level=moderate` at the start of this
checkpoint found 5 vulnerabilities (4 high, 1 moderate). **4 resolved:**
`@fastify/static` (both a high path-traversal advisory and a moderate
non-canonical-URL advisory, bumped `10.1.0` → `10.1.2`), `find-my-way`
(high, HTTP/2 DDoS, `9.6.0` → `9.7.0` via a scoped override), and
`react-router` (high, RSC-mode CSRF — no patched `7.x` exists, migrated
`react-router-dom@7.18.1` → `react-router@8.3.0`; verified narrow: same
7 APIs this app uses are exported unchanged, confirmed against the
actual published package, not a secondhand summary). **1 remains,
documented not suppressed:** `brace-expansion@1.1.16`, reached only
through `eslint`'s own dev-only toolchain, already the latest available
release of its independently-maintained major line, no production
exposure — see `docs/meld-masters-dependency-security-summary.md` §14
for the full evidence trail. Post-fix audit: `pnpm audit
--audit-level=moderate` shows only that one documented, dev-only
finding.

**CI now enforces this split directly.** `.github/workflows/ci.yml`'s
`security` job runs two separate audit steps: `pnpm audit --prod
--audit-level=high` (blocking — fails the job on any production-reachable
high/critical finding, before the Docker build or Trivy scan) and `pnpm
audit --dev --audit-level=high` (`continue-on-error: true` — the
`brace-expansion` finding above stays visible in every CI log without
blocking the image build/scan). Previously, one combined audit step
gated the Docker build and Trivy scan on *all* findings including this
dev-only one, which meant the actual image scan was silently skipped on
every run since the remediation checkpoint began — a worse security
posture than a nonblocking, always-logged dev-audit step. No dependency
version or application code changed as part of this restructuring —
workflow structure only.

Verification performed for this checkpoint: full local gate (format/
lint/typecheck/317 tests/build) green; local chromium/firefox/
mobile-chrome e2e all 42/42; a direct path-traversal exploit probe
against the compiled production server confirming the `@fastify/static`
fix is actually effective (404/403, not 200 with file content), not just
a version-number check.

## Verified by running it, 2026-07-28 (Phase 8)

Full gate, executed against the disposable `tilemeld_test` database:

| Step | Command | Result |
|---|---|---|
| Format | `pnpm run format:check` | pass |
| Lint | `pnpm run lint` | pass |
| Typecheck | `pnpm run typecheck` | pass, 6 workspace projects |
| Tests | `pnpm run test` | pass (exit 0); `apps/server` alone 28 files / 317 tests |
| Build | `pnpm run build` | pass, web + server |

## Local browser (Playwright) results, 2026-07-28

Run one project at a time, foreground, timeout-wrapped, fresh disposable
database per run — never the full 5-project matrix in one local
invocation (see "Known WebKit local limitation" below).

| Project | Result |
|---|---|
| chromium | 42/42 passed |
| firefox | 42/42 passed |
| mobile-chrome | 42/42 passed |
| webkit | not run locally to completion (see limitation below) |
| mobile-webkit | not run locally (same engine) |

## CI (GitHub Actions) results, 2026-07-28

| Job/project | Result |
|---|---|
| Format/lint/typecheck/unit-integration-tests/build | pass |
| E2E chromium | pass |
| E2E firefox | pass |
| E2E webkit | pass |
| E2E mobile-chrome | pass |
| E2E mobile-webkit | **inconclusive** — 3 attempts hit CI infrastructure interruptions (one 30-minute job-timeout, two external "runner received a shutdown signal" terminations at similar points), never a real test assertion failure. Not retried further; treat as pending, not passed or failed. |
| Dependency audit (`pnpm audit --audit-level=high`) | **fails** — 4 high, 1 moderate pre-existing vulnerabilities (`@fastify/static` path-traversal route-guard bypass, `find-my-way` HTTP/2 DDoS, `react-router` CSRF bypass, `brace-expansion` DoS). Not patched this phase — out of Phase 8's verification/documentation scope; flagged for a separate, deliberate dependency-update task. |
| Docker image scan (Trivy) | did not run — blocked by the failing audit step in the same job |

CI's e2e matrix job did not run at all on any push between 2026-07-27 and
2026-07-28 — blocked earlier, at the format-check step, by a pre-existing
formatting violation in `e2e/scripts/capture-phase-5-review.ts`
(predates Phase 7). Fixed this phase (whitespace-only reflow, no
behavior change) — see `docs/meld-masters-phase-8-summary.md` §5-6.

## Production-build verification, 2026-07-28

The compiled server (`apps/server/dist/index.js`) run directly against
the built web SPA (`apps/web/dist`, the same relative layout the Docker
image uses) against a disposable database. Confirmed HTTP 200 with
correct content types for: `/`, `/api/health`, `/manifest.json`,
`/favicon.ico`, both old (transitional) and new `/icons/*` icon paths,
the main JS/CSS bundles, a self-hosted font file, and a portrait asset.
Manifest icon entries reference only the new `/icons/*` paths. No
external font request. Service worker (`sw.js`) confirmed to still have
zero caching/fetch-interception logic (push-notification handling only,
by its own header comment).

## Known WebKit local limitation

Running the full WebKit (or Mobile WebKit) Playwright project in one
continuous local invocation on this machine has twice caused severe
resource problems: once a machine-freezing memory exhaustion (traced to
this same mechanism, run unsupervised via a detached background process
in an earlier session), and once a reproducible ~17.7GB `WPEWebProcess`
leak that was caught and safely stopped mid-run. **Do not run the full
webkit/mobile-webkit project locally in one invocation.** Chromium,
Firefox, and Mobile Chrome show no equivalent issue. CI (GitHub Actions)
is the authoritative cross-engine verification environment for WebKit and
Mobile WebKit — see the CI results table above. **Playwright's WebKit
engine is not a certified stand-in for real desktop or mobile Safari**
(the project's own long-standing documented policy, plan §10.5/
D-BROWSERS) — a real Safari check remains a separate, unperformed manual
release-gate step regardless of any Playwright-WebKit result, local or CI.

## Remaining manual checks (not performed by any automated tooling)

- Real screen-reader verification: NVDA, VoiceOver, TalkBack.
- Real Safari verification (desktop macOS and iOS).
- Android PWA install, maskable-icon crop, splash screen.
- iOS Add to Home Screen, Apple touch icon.
- Desktop installed-PWA icon and standalone behavior.

None of these have been performed or are claimed as passed by any
session to date. See `docs/meld-masters-phase-8-summary.md` for the full
manual checklist.

## Deployment readiness

Not deployed. **Ready with documented residual risk** — the four
production-relevant dependency advisories are now resolved and verified
(§ "Dependency security status" above); the one remaining advisory is
dev-only with no production exposure, documented not hidden. See
`docs/meld-masters-phase-8-summary.md` for the full pre-deploy checklist
and `docs/meld-masters-dependency-security-summary.md` for the
dependency-specific detail. No deployment was performed or requested
this session. Real screen-reader, real Safari, and real-device
PWA-install checks remain pending, unchanged from Phase 8.

## Shipped and merged (from Git history)

- **Computer Opponent V1** — a deterministic server-side single-player
  opponent. Full write-up in `docs/computer-opponent.md`. Recorded as enabled in
  production on Render.
- **Phases 01–08 of `docs/next-changes-implementation-plan.md`** — global
  username, friendly room names, join-by-name, auto-start on capacity, one-click
  rematch, home dashboard redesign, completed-game retention, tabletop layout.
  Merged at `712d031`.
- **CI / E2E / release stabilization** — PR #3, merged at `b3efeeb`, preceded by
  `e86e36c`, `99e351e`, `82e394f`.
- **Meld Masters visual refresh, Phases 0–8** — rename, retro-arcade
  visual redesign, portrait system, PWA icon pipeline, responsive/
  accessibility pass, final release verification. See
  `docs/meld-masters-visual-refresh-plan.md` and the per-phase summaries.

## Known discrepancy

`docs/changes.md` (2026-07-20, the source brief for Phases 01–08) specifies:

> Completed/ended/resigned games last 4 hours and then are permanently deleted

The implemented behavior is **48 hours** — commit `ac9c2a3`, "feat(server): add
48-hour completed-game retention". Presumably a deliberate revision during
Phase 07, but the rationale has not been confirmed against
`docs/phase-07-retention.md`. Either the brief or the implementation should be
corrected so they stop disagreeing. Still unresolved as of this verification.

## Work in progress

None. Clean tree at the start of this verification, no open checkpoint
before Phase 8 began.
