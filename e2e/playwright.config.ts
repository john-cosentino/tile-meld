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
// Assumes both the Fastify API server (port 3000, migrated Postgres) and
// the Vite web dev server (port 5173, proxying /api and /socket.io to
// 3000 -- see apps/web/vite.config.ts) are already running. Auto-starting
// both plus a throwaway database is a CI-harness concern that belongs to
// Phase 8 ("full E2E, accessibility, and CI hardening"), not this phase's
// first smoke test.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 14"] } },
  ],
});
