// Meld Masters arcade integration -- quick visual capture of the real,
// live TabletopPage after the ChatGPT production-asset integration
// (docs/design-reference/chatgpt/). Standalone, disposable-data script
// (same pattern as capture-phase-8-final.ts), scoped to just the
// tabletop screen at the 3 contract viewports rather than the whole
// site, since that is the only screen this pass touched.
//
// Usage: pnpm exec tsx e2e/scripts/capture-tabletop-arcade-integration.ts [outDir]
// Both the server and Vite dev servers must already be running.

import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  waitForReady,
  claimUsername,
  joinRoomByName,
  clickUntilSettled,
} from "../tests/helpers.js";

const BASE_URL = process.env.BASELINE_BASE_URL ?? "http://localhost:5173";
const OUT_DIR = path.resolve(
  process.argv[2] ??
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../docs/design-reference/tabletop-arcade-integration-review",
    ),
);

const VIEWPORTS: Record<string, { width: number; height: number }> = {
  "desktop-1440x900": { width: 1440, height: 900 },
  "phone-portrait-390x844": { width: 390, height: 844 },
  "phone-landscape-844x390": { width: 844, height: 390 },
};

async function shoot(page: Page, name: string): Promise<void> {
  for (const [label, size] of Object.entries(VIEWPORTS)) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT_DIR, `${name}--${label}.png`), fullPage: true });
    console.log(`captured: ${name}--${label}`);
  }
}

async function run(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const browser: Browser = await chromium.launch();
  try {
    const h2 = await browser.newContext({ baseURL: BASE_URL });
    const g2 = await browser.newContext({ baseURL: BASE_URL });
    const hp = await h2.newPage();
    const gp = await g2.newPage();
    await waitForReady(hp);
    await waitForReady(gp);
    const host2 = await claimUsername(hp, "ArcadeInt2Host");
    await claimUsername(gp, "ArcadeInt2Guest");
    await hp.getByRole("link", { name: "Create Room" }).click();
    await hp.getByRole("radio", { name: "2 players" }).check();
    await hp.getByRole("radio", { name: "Private (invite by code)" }).check();
    await clickUntilSettled(
      hp,
      hp.getByRole("button", { name: "Create room" }),
      hp.getByRole("heading", { name: host2 }),
    );
    await joinRoomByName(gp, host2);
    await hp.waitForURL(/\/games\//, { timeout: 15000 });
    await hp.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });
    await gp.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });

    const activePage = (await hp.getByText("Your turn", { exact: true }).isVisible()) ? hp : gp;

    await shoot(activePage, "tabletop-arcade");

    // A close-up of the action bar at desktop width, to check plate/icon rendering clearly.
    await activePage.setViewportSize(VIEWPORTS["desktop-1440x900"]);
    await activePage.locator(".tabletop-actions").scrollIntoViewIfNeeded();
    await activePage.waitForTimeout(150);
    await activePage.screenshot({
      path: path.join(OUT_DIR, "tabletop-actions-closeup--desktop.png"),
    });
    console.log("captured: tabletop-actions-closeup--desktop");

    await h2.close();
    await g2.close();
  } finally {
    await browser.close();
  }

  console.log(`\nDone. Screenshots in ${OUT_DIR}`);
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
