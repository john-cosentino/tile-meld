// Meld Masters visual refresh -- Phase 4 review screenshot capture
// (docs/meld-masters-visual-refresh-plan.md Phase 4, "Done when: ...
// screenshots at all 4 viewports approved vs concepts 01/03/04"). A focused
// sibling of the Phase 0/2/3 capture scripts: same approach (standalone
// script outside e2e/tests so it never runs as part of `npx playwright
// test` / CI, same reused e2e helpers), covering the six tabletop states
// Phase 0's baseline already captured once (pre-redesign), so this run is
// the direct after-shot for the same six states.
//
// Usage:
//   pnpm exec tsx e2e/scripts/capture-phase-4-review.ts [outDir]
//
// outDir defaults to docs/design-reference/phase-4-review. Both
// `pnpm --filter @tile-meld/server run dev` and
// `pnpm --filter @tile-meld/web run dev` must already be running.

import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { waitForReady, claimUsername, dragTo } from "../tests/helpers.js";

const BASE_URL = process.env.BASELINE_BASE_URL ?? "http://localhost:5173";
const OUT_DIR = path.resolve(process.argv[2] ?? "docs/design-reference/phase-4-review");

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
  try {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();

    await waitForReady(page);
    await claimUsername(page, "Phase4Review");
    await page.getByRole("link", { name: "Meld Masters", exact: true }).click();
    const playVsComputer = page.getByRole("button", { name: /play vs computer/i });
    await playVsComputer.waitFor();
    await playVsComputer.click();
    await page.getByLabel("computer opponent").waitFor();
    await page.getByRole("button", { name: "Mark ready" }).click();
    await page.getByRole("button", { name: /Start game/ }).click();
    await page.waitForURL(/\/games\//, { timeout: 15000 });
    await page.getByRole("heading", { name: /Your rack \(14\)/ }).waitFor({ timeout: 15000 });
    await page.getByText("Your turn", { exact: true }).waitFor({ timeout: 20000 });

    // 1. Tabletop, the player's turn -- clean 14-tile rack, empty table.
    await capture("tabletop-your-turn", page);

    // 2. Tabletop, the computer's turn.
    await capture("tabletop-computer-turn", page, async () => {
      await page.getByRole("button", { name: "Draw tile" }).click();
      await page.getByText(/Computer is playing…/).waitFor({ timeout: 10000 });
    });
    await page.getByText("Your turn", { exact: true }).waitFor({ timeout: 20000 });

    // 3. Tabletop, a rack tile selected (Phase 4: gold ring via .is-selected).
    const rackTiles = page.locator('[aria-label="Your rack"] .tile');
    await capture("tabletop-tile-selected", page, async () => {
      await rackTiles.first().click();
    });
    await rackTiles.first().click();

    // 4. Tabletop, an invalid set (Phase 4: red border via .is-invalid).
    await page.setViewportSize({ width: 1280, height: 2200 });
    await capture("tabletop-invalid-set", page, async () => {
      const newSetZone = page.locator('[aria-label="Start a new set"]');
      await dragTo(page, rackTiles.first(), newSetZone);
      const setOneZone = page.locator('[aria-label^="Set 1,"]');
      await setOneZone.locator(".tile").first().waitFor();
      await dragTo(page, rackTiles.first(), setOneZone.locator(".tile").first());
      await page.getByText(/^Set 1 --/).waitFor();
    });

    // 5. Tabletop, completed game + one-click Rematch (Phase 4: .card--accent-gold).
    await capture("tabletop-completed-rematch", page, async () => {
      await page.getByRole("button", { name: "Resign" }).click();
      await page.getByRole("button", { name: "Confirm resign" }).click();
      await page.getByRole("heading", { name: "Game over" }).waitFor({ timeout: 10000 });
    });

    await context.close();

    // 6. Unavailable/error game state.
    const errorContext = await browser.newContext({ baseURL: BASE_URL });
    const errorPage = await errorContext.newPage();
    await capture("tabletop-unavailable-game", errorPage, async () => {
      await waitForReady(errorPage);
      await claimUsername(errorPage, "Phase4ReviewErr");
      await errorPage.goto("/games/00000000-0000-0000-0000-000000000000");
      await errorPage.getByText(/doesn't exist|no longer available/i).waitFor();
    });
    await errorContext.close();
  } finally {
    // Always close the browser, even on an uncaught error in setup above
    // (not just the per-state failures `capture()` already tolerates) --
    // an unclosed headless Chromium keeps this process alive indefinitely.
    await browser.close();
  }

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
