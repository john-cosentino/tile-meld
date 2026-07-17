import { defineConfig, devices } from "@playwright/test";

// Phase 0 scaffold. Real specs land starting with the Phase 6 smoke test
// (2 contexts, private room, one committed turn) and grow through Phase 8
// full E2E coverage -- see docs/opus-implementation-plan.md Sec 11.3/13.
//
// IMPORTANT (browser-support policy, docs/opus-implementation-plan.md
// Sec 10.5/D-BROWSERS): Playwright's WebKit engine is NOT a certified
// stand-in for real desktop or mobile Safari. CI runs WebKit as a
// best-effort proxy only. Manual or hosted real-device checks against
// actual Safari (desktop macOS and iOS) are a required release-gate step
// documented in the deployment runbook (Sec 12), not something this CI
// config can claim to cover.
// Both the Fastify API server (port 3000) and the Vite web dev server
// (port 5173, proxying /api and /socket.io to 3000 -- see
// apps/web/vite.config.ts) are started automatically below via
// `webServer` when neither is already listening (CI: always fresh: no
// server is running yet, and reuseExistingServer is false so a stray
// leftover process from a previous run can never be silently reused).
// Locally, reuseExistingServer picks up whatever's already running on
// those ports -- the manual `tsx src/index.ts` / `vite` pair from the
// README's "Quick start" -- without needing this config to know how that
// process was started or with what env. Postgres itself, migrated to
// latest, is assumed already up either way (CI: the `postgres` service
// container plus a `pnpm --filter @tile-meld/server run migrate` step
// before `playwright test`; locally: `docker compose up -d db` plus the
// same migrate command, per the README).
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  // Every project in this matrix points at the SAME local dev server (see
  // baseURL below), and the server applies real per-IP token-bucket rate
  // limits on identity/room endpoints (plan Sec 9/§11.3, "per-IP and
  // per-player token buckets on room creation, lobby queries, joins,
  // recovery") -- an intentional anti-abuse decision, not something this
  // suite should weaken or bypass. Multiple Playwright workers running
  // concurrently would multiply request volume against that single shared
  // IP bucket and cause spurious "Rate limit exceeded" failures that have
  // nothing to do with real cross-browser behavior. workers: 1 keeps the
  // whole matrix serial so the suite behaves like one real user session at
  // a time; the two-browser-context pattern *within* a single test (see
  // startTwoPlayerGame) is unaffected and still exercises genuine
  // multi-client concurrency at a realistic scale.
  workers: 1,
  // A small secondary safeguard (not the primary fix): the whole matrix runs
  // serially against one shared per-IP rate-limit bucket, so a test late in a
  // long run can occasionally time out waiting for a data fetch that is being
  // transiently rate-limited by the cumulative volume ahead of it. A retry
  // runs after that pressure has drained and the bucket refilled. The primary
  // fixes are the more patient, authoritative-state waits in tests/helpers.ts
  // and the raised default assertion timeout below.
  retries: process.env.CI ? 2 : 0,
  // Above Playwright's 30s default: multi-context setups (3-4 players, or
  // several fresh identities in one test) plus real rate-limit-backoff
  // retries (retryOnRateLimit, tests/helpers.ts) routinely need more than
  // that even when nothing is actually stuck. Individual tests override
  // this higher still where warranted (e.g. reconnect-recovery.spec.ts).
  timeout: 90000,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  // Playwright's default per-assertion timeout is 5s. Under cumulative CI
  // rate-limit pressure, an observable state change (a rack/set count
  // updating after a drag, a page navigating after a Socket.IO-driven room
  // transition) legitimately arrives later than that -- 5s is an assumption
  // about UI/round-trip latency, not an authoritative deadline. Waiting
  // longer for the real observed state (rather than sleeping, or asserting
  // too eagerly) is the correct fix.
  expect: { timeout: 15000 },
  webServer: [
    {
      command: "pnpm --filter @tile-meld/server exec tsx src/index.ts",
      url: "http://localhost:3000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        NODE_ENV: "development",
        PORT: "3000",
        DATABASE_URL:
          process.env.DATABASE_URL ?? "postgres://tilemeld:tilemeld@localhost:5432/tilemeld",
        // A fixed, checked-in-plaintext value is fine here -- this only
        // ever signs session tokens for an ephemeral CI/local-dev
        // Postgres instance that's discarded after the run, never a real
        // deployment's secret (see .env.example for the real one).
        SESSION_TOKEN_HMAC_SECRET: "e2e-test-only-secret-not-for-production-use-32chars",
        // A modest, fixed computer-opponent delay: long enough that the
        // "Computer is playing…" turn state is reliably observable in the UI
        // across every browser engine, short enough that a game of several
        // turns still finishes well inside a test's budget. ENABLE_COMPUTER_
        // OPPONENT is deliberately left unset so the feature runs in its
        // default (enabled) production configuration.
        BOT_TURN_DELAY_MS: "1200",
      },
    },
    {
      command: "pnpm --filter @tile-meld/web run dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 14"] } },
  ],
});
