// Meld Masters visual refresh -- Phase 7 review screenshot capture
// (docs/meld-masters-visual-refresh-plan.md §11 Phase 7: responsive
// refinement and accessibility). Standalone script, kept outside e2e/tests
// like the other capture-phase-N-review.ts scripts. Every identity/room
// this script creates is disposable test data.
//
// Usage: pnpm exec tsx e2e/scripts/capture-phase-7-review.ts [outDir]
// Both the server and Vite dev servers must already be running.

import { chromium, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  waitForReady,
  claimUsername,
  clickUntilSettled,
  joinRoomByName,
} from "../tests/helpers.js";

const BASE_URL = process.env.BASELINE_BASE_URL ?? "http://localhost:5173";
const OUT_DIR = path.resolve(
  process.argv[2] ??
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../docs/design-reference/phase-7-review",
    ),
);

const missing: string[] = [];
const captured: string[] = [];

async function shoot(page: Page, name: string, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  const file = `${name}--${width}x${height}.png`;
  await page.screenshot({ path: path.join(OUT_DIR, file) });
  captured.push(file);
  console.log(`captured: ${file}`);
}

async function zoomShoot(page: Page, name: string, pct: number): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate((z) => {
    (document.documentElement.style as unknown as { zoom: string }).zoom = `${z}%`;
  }, pct);
  await page.waitForTimeout(150);
  const file = `${name}--${pct}pct-zoom.png`;
  await page.screenshot({ path: path.join(OUT_DIR, file) });
  captured.push(file);
  console.log(`captured: ${file}`);
  await page.evaluate(() => {
    (document.documentElement.style as unknown as { zoom: string }).zoom = "100%";
  });
}

async function run(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  // 1. Skip-link :focus reveal -- the plan's directly-named Phase 7 gap.
  // Before: link is present but visually hidden. After: Tab reveals it.
  try {
    const browser = await chromium.launch();
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await waitForReady(page);
    await shoot(page, "skip-link-before-focus", 1280, 720);
    await page.keyboard.press("Tab");
    await page.locator("a.skip-link").waitFor({ state: "visible" });
    await shoot(page, "skip-link-after-focus", 1280, 720);
    await context.close();
    await browser.close();
  } catch (err) {
    missing.push(`skip-link -- ${(err as Error).message}`);
    console.error(`FAILED: skip-link: ${(err as Error).message}`);
  }

  // 2. Narrow-viewport username overflow fix -- a max-length (24-char)
  // username no longer forces horizontal page overflow at 320px.
  try {
    const browser = await chromium.launch();
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await waitForReady(page);
    const username = await claimUsername(page, "Phase7OverflowShot");
    await page.getByRole("link", { name: "Meld Masters", exact: true }).click();
    await clickUntilSettled(
      page,
      page.getByRole("button", { name: /Play vs Computer/ }),
      page.getByRole("heading", { name: username }),
    );
    await shoot(page, "waiting-room-long-username-narrow", 320, 568);
    await context.close();
    await browser.close();
  } catch (err) {
    missing.push(`username-overflow -- ${(err as Error).message}`);
    console.error(`FAILED: username-overflow: ${(err as Error).message}`);
  }

  // 3. Real keyboard tile selection -- a tile activated via Tab + Enter
  // (native <button> activation, not a dnd-kit drag), showing the
  // selected (aria-pressed) visual state the fix restores for keyboard
  // users. Contexts get an explicit baseURL (this script drives the raw
  // chromium API, not the Playwright test runner, so the ambient baseURL
  // from playwright.config.ts never applies -- the same fix the Phase 5
  // closure capture script had to make).
  try {
    const browser = await chromium.launch();
    const hostContext = await browser.newContext({ baseURL: BASE_URL });
    const guestContext = await browser.newContext({ baseURL: BASE_URL });
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();
    await waitForReady(hostPage);
    await waitForReady(guestPage);
    const hostUsername = await claimUsername(hostPage, "Phase7KeyboardHost");
    await claimUsername(guestPage, "Phase7KeyboardGuest");

    await hostPage.getByRole("link", { name: "Create Room" }).click();
    await hostPage.getByRole("radio", { name: "2 players" }).check();
    await hostPage.getByRole("radio", { name: "Private (invite by code)" }).check();
    await clickUntilSettled(
      hostPage,
      hostPage.getByRole("button", { name: "Create room" }),
      hostPage.getByRole("heading", { name: hostUsername }),
    );
    await joinRoomByName(guestPage, hostUsername);
    await hostPage.waitForURL(/\/games\//, { timeout: 15000 });
    const gameUrl = hostPage.url();
    try {
      await guestPage.waitForURL(/\/games\//, { timeout: 10000 });
    } catch {
      await guestPage.goto(gameUrl);
    }
    await hostPage.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });

    const firstTile = hostPage.locator(".tile").first();
    await firstTile.focus();
    await hostPage.keyboard.press("Enter");
    await firstTile.waitFor();
    await shoot(hostPage, "tabletop-keyboard-selected-tile", 1280, 720);
    await hostContext.close();
    await guestContext.close();
    await browser.close();
  } catch (err) {
    missing.push(`keyboard-tile-selection -- ${(err as Error).message}`);
    console.error(`FAILED: keyboard-tile-selection: ${(err as Error).message}`);
  }

  // 4. Simple unauthenticated/identity routes at 320x568 and Home/Recovery
  // at 200% zoom, plus Public Lobby and Create Room at 320x568.
  try {
    const browser = await chromium.launch();
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await waitForReady(page);
    await shoot(page, "home", 320, 568);
    await zoomShoot(page, "home", 200);

    await page.getByRole("navigation").getByRole("link", { name: "Public Lobby" }).click();
    await page.getByRole("heading", { name: "Public lobby" }).waitFor();
    await shoot(page, "public-lobby", 320, 568);

    await page.getByRole("navigation").getByRole("link", { name: "Create Room" }).click();
    await page.getByRole("heading", { name: "Create a room" }).waitFor();
    await shoot(page, "create-room", 320, 568);

    await page.getByRole("navigation").getByRole("link", { name: "Recovery" }).click();
    await page.getByRole("heading", { name: "Recovery", exact: true }).waitFor();
    await shoot(page, "recovery", 320, 568);
    await zoomShoot(page, "recovery", 200);

    await context.close();
    await browser.close();
  } catch (err) {
    missing.push(`identity-routes -- ${(err as Error).message}`);
    console.error(`FAILED: identity-routes: ${(err as Error).message}`);
  }

  // 5. Waiting room with a real rival portrait at 320x568.
  try {
    const browser = await chromium.launch();
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await waitForReady(page);
    const username = await claimUsername(page, "Phase7Narrow2p");
    await page.getByRole("link", { name: "Create Room" }).click();
    await page.getByRole("radio", { name: "2 players" }).check();
    await page.getByRole("radio", { name: "Private (invite by code)" }).check();
    await clickUntilSettled(
      page,
      page.getByRole("button", { name: "Create room" }),
      page.getByRole("heading", { name: username }),
    );
    await shoot(page, "waiting-room-portrait", 320, 568);
    await context.close();
    await browser.close();
  } catch (err) {
    missing.push(`waiting-room-portrait-320 -- ${(err as Error).message}`);
    console.error(`FAILED: waiting-room-portrait-320: ${(err as Error).message}`);
  }

  // 6-8. Tabletop with a real opponent portrait: 320x568, 844x390 (phone
  // landscape), 768x1024 (tablet portrait), plus 200% zoom and a
  // reduced-motion capture of the same shell.
  try {
    const browser = await chromium.launch();
    const hostContext = await browser.newContext({ baseURL: BASE_URL });
    const guestContext = await browser.newContext({ baseURL: BASE_URL });
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();
    await waitForReady(hostPage);
    await waitForReady(guestPage);
    const hostUsername = await claimUsername(hostPage, "Phase7TableHost");
    await claimUsername(guestPage, "Phase7TableGuest");
    await hostPage.getByRole("link", { name: "Create Room" }).click();
    await hostPage.getByRole("radio", { name: "2 players" }).check();
    await hostPage.getByRole("radio", { name: "Private (invite by code)" }).check();
    await clickUntilSettled(
      hostPage,
      hostPage.getByRole("button", { name: "Create room" }),
      hostPage.getByRole("heading", { name: hostUsername }),
    );
    await joinRoomByName(guestPage, hostUsername);
    await hostPage.waitForURL(/\/games\//, { timeout: 15000 });
    const gameUrl = hostPage.url();
    try {
      await guestPage.waitForURL(/\/games\//, { timeout: 10000 });
    } catch {
      await guestPage.goto(gameUrl);
    }
    await hostPage.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });

    await shoot(hostPage, "tabletop-portrait", 320, 568);
    await shoot(hostPage, "tabletop-portrait", 844, 390);
    await shoot(hostPage, "tabletop-portrait", 768, 1024);
    await zoomShoot(hostPage, "tabletop", 200);

    await hostPage.emulateMedia({ reducedMotion: "reduce" });
    await shoot(hostPage, "tabletop-reduced-motion", 1280, 720);
    await hostPage.emulateMedia({ reducedMotion: null });

    await hostContext.close();
    await guestContext.close();
    await browser.close();
  } catch (err) {
    missing.push(`tabletop-viewports -- ${(err as Error).message}`);
    console.error(`FAILED: tabletop-viewports: ${(err as Error).message}`);
  }

  // 9. Multiplayer tabletop (4-player) at 390x844 -- opponent strip shows
  // 3 distinct portraits at once.
  try {
    const browser = await chromium.launch();
    const contexts = await Promise.all(
      Array.from({ length: 4 }, () => browser.newContext({ baseURL: BASE_URL })),
    );
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    await Promise.all(pages.map((p) => waitForReady(p)));
    const hostUsername = await claimUsername(pages[0]!, "Phase7MultiHost");
    for (const [i, p] of pages.slice(1).entries()) {
      await claimUsername(p, `Phase7MultiP${i + 2}`);
    }
    await pages[0]!.getByRole("link", { name: "Create Room" }).click();
    await pages[0]!.getByRole("radio", { name: "4 players" }).check();
    await pages[0]!.getByRole("radio", { name: "Private (invite by code)" }).check();
    await clickUntilSettled(
      pages[0]!,
      pages[0]!.getByRole("button", { name: "Create room" }),
      pages[0]!.getByRole("heading", { name: hostUsername }),
    );
    for (const p of pages.slice(1)) await joinRoomByName(p, hostUsername);
    await pages[0]!.waitForURL(/\/games\//, { timeout: 15000 });
    const gameUrl = pages[0]!.url();
    for (const p of pages.slice(1)) {
      try {
        await p.waitForURL(/\/games\//, { timeout: 10000 });
      } catch {
        await p.goto(gameUrl);
      }
    }
    await pages[0]!.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });
    await shoot(pages[0]!, "tabletop-multiplayer", 390, 844);
    for (const c of contexts) await c.close();
    await browser.close();
  } catch (err) {
    missing.push(`tabletop-multiplayer-390 -- ${(err as Error).message}`);
    console.error(`FAILED: tabletop-multiplayer-390: ${(err as Error).message}`);
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
