// Meld Masters visual refresh -- Phase 2 review screenshot capture
// (docs/meld-masters-visual-refresh-plan.md Phase 2, "Manual visual-review
// screenshots"). A focused sibling of capture-baseline-screenshots.ts: same
// approach (standalone script outside e2e/tests so it never runs as part
// of `npx playwright test` / CI), same reused e2e helpers, but only the
// three screens Phase 2 asks for -- Home/dashboard, Public lobby, and the
// active Tabletop -- to demonstrate the new arcade shell without
// overwriting the Phase 0 pre-redesign baseline under
// docs/design-reference/baseline/.
//
// Usage:
//   pnpm exec tsx e2e/scripts/capture-phase-2-review.ts [outDir]
//
// outDir defaults to docs/design-reference/phase-2-review. Both
// `pnpm --filter @tile-meld/server run dev` and
// `pnpm --filter @tile-meld/web run dev` must already be running.

import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { waitForReady, claimUsername } from "../tests/helpers.js";

const BASE_URL = process.env.BASELINE_BASE_URL ?? "http://localhost:5173";
const OUT_DIR = path.resolve(process.argv[2] ?? "docs/design-reference/phase-2-review");

const VIEWPORTS: Record<string, { width: number; height: number }> = {
  "1440x900": { width: 1440, height: 900 },
  "1280x720": { width: 1280, height: 720 },
  "390x844": { width: 390, height: 844 },
  "844x390": { width: 844, height: 390 },
};

const missing: string[] = [];
const captured: string[] = [];

async function shootAllViewports(page: Page, name: string): Promise<void> {
  for (const [label, size] of Object.entries(VIEWPORTS)) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    const file = `${name}--${label}.png`;
    await page.screenshot({ path: path.join(OUT_DIR, file), fullPage: true });
    captured.push(file);
  }
}

async function capture(name: string, page: Page, fn?: () => Promise<void>): Promise<void> {
  try {
    if (fn) await fn();
    await shootAllViewports(page, name);
    console.log(`captured: ${name}`);
  } catch (err) {
    missing.push(`${name} -- ${(err as Error).message}`);
    console.error(`FAILED: ${name}: ${(err as Error).message}`);
  }
}

async function run(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const browser: Browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();

  // 1. Home dashboard, with a claimed identity -- the typical returning
  // view (arcade shell, header/wordmark/monogram, nav, dashboard panels).
  // claimUsername navigates to /recovery internally and leaves the page
  // there, so this explicitly returns to Home afterward before capturing.
  await capture("home-dashboard", page, async () => {
    await waitForReady(page);
    await claimUsername(page, "Phase2Review");
    await page.getByRole("link", { name: "Meld Masters", exact: true }).click();
    await page.getByRole("heading", { level: 1, name: "Meld Masters" }).waitFor();
  });

  // 2. Public lobby.
  await capture("public-lobby", page, async () => {
    await page.goto("/lobby");
    await page.getByRole("heading", { name: "Public lobby" }).waitFor();
  });

  // 3. Active tabletop -- Play vs Computer is the fastest deterministic
  // path to a live, dealt game.
  await capture("tabletop-active", page, async () => {
    await page.getByRole("link", { name: "Meld Masters", exact: true }).click();
    const playVsComputer = page.getByRole("button", { name: /play vs computer/i });
    await playVsComputer.waitFor();
    await playVsComputer.click();
    await page.getByRole("button", { name: "Mark ready" }).click();
    await page.getByRole("button", { name: /Start game/ }).click();
    await page.waitForURL(/\/games\//, { timeout: 15000 });
    await page.getByRole("heading", { name: /Your rack \(14\)/ }).waitFor({ timeout: 15000 });
  });

  await context.close();
  await browser.close();

  console.log(`\n${captured.length} screenshots captured to ${OUT_DIR}`);
  if (missing.length > 0) {
    console.error(`\n${missing.length} state(s) FAILED to capture:`);
    for (const m of missing) console.error(`  - ${m}`);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
