// Meld Masters visual refresh -- Phase 0 baseline screenshot capture
// (docs/meld-masters-visual-refresh-plan.md Phase 0, §13.1).
//
// A standalone script, not a Playwright spec: it lives outside e2e/tests
// (Playwright's testDir) on purpose, so it never runs as part of
// `npx playwright test` / CI's e2e job. It reuses the real app and the
// existing e2e helpers (waitForReady, claimUsername, dragTo, ...) against
// whatever dev servers are already running -- it does not start its own
// webServer the way playwright.config.ts does, so both
// `pnpm --filter @tile-meld/server run dev` and
// `pnpm --filter @tile-meld/web run dev` must already be up.
//
// Usage:
//   pnpm exec tsx e2e/scripts/capture-baseline-screenshots.ts [outDir]
//
// outDir defaults to docs/design-reference/baseline. Phase 8 (final visual
// review) re-runs this same script against docs/design-reference/final.
//
// This captures a snapshot of today's PRE-REDESIGN interface for later
// side-by-side comparison. It makes no application-code changes and no
// assertions -- it is not a test, and its exit code reflects only whether
// every planned screenshot was captured.

import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { waitForReady, claimUsername, dragTo } from "../tests/helpers.js";

const BASE_URL = process.env.BASELINE_BASE_URL ?? "http://localhost:5173";
const OUT_DIR = path.resolve(process.argv[2] ?? "docs/design-reference/baseline");

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
    // Let the single 860px layout breakpoint (global.css) and any reflow
    // settle before capturing -- there is no animation to wait out
    // (prefers-reduced-motion is honored site-wide), just layout.
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

  // 1. Home dashboard, brand-new (unclaimed) identity -- the very first
  // thing any player sees: empty "Your Games", Play vs Computer disabled.
  await capture("home-dashboard-new", page, async () => {
    await waitForReady(page);
  });

  // 2. Recovery screen, right after claiming a username -- shows the
  // recovery-code display, the claimed-username confirmation, and the
  // rotate/recover sections all at once.
  await capture("recovery", page, async () => {
    await claimUsername(page, "Baseline");
  });

  // 3. Home dashboard again, now with a claimed identity (Play vs Computer
  // enabled) -- the more typical returning-user view.
  await capture("home-dashboard-claimed", page, async () => {
    await page.getByRole("link", { name: "Tile Meld", exact: true }).click();
    await page.getByRole("heading", { level: 1, name: "Tile Meld" }).waitFor();
  });

  // 4. Public lobby.
  await capture("public-lobby", page, async () => {
    await page.goto("/lobby");
    await page.getByRole("heading", { name: "Public lobby" }).waitFor();
  });

  // 5. Create room (form, not submitted).
  await capture("create-room", page, async () => {
    await page.goto("/rooms/new");
    await page.getByRole("heading", { name: "Create a room" }).waitFor();
  });

  // 6. Join by name (form, not submitted).
  await capture("join-by-name", page, async () => {
    await page.goto("/rooms/join");
    await page.getByLabel("Room name").waitFor();
  });

  // 7. Waiting room -- Play vs Computer, before starting: shows the human
  // seat, the computer seat with its BOT badge, and the Mark ready /
  // Start game controls together.
  await capture("waiting-room-vs-computer", page, async () => {
    await page.getByRole("link", { name: "Tile Meld", exact: true }).click();
    const playVsComputer = page.getByRole("button", { name: /play vs computer/i });
    await playVsComputer.waitFor();
    await playVsComputer.click();
    await page.getByLabel("computer opponent").waitFor();
  });

  // Start the game so the remaining tabletop states can be captured from
  // the same context.
  await page.getByRole("button", { name: "Mark ready" }).click();
  await page.getByRole("button", { name: /Start game/ }).click();
  await page.waitForURL(/\/games\//, { timeout: 15000 });
  await page.getByRole("heading", { name: /Your rack \(14\)/ }).waitFor({ timeout: 15000 });
  // The bot may hold the opening seat; wait until control is with the human.
  await page.getByText("Your turn", { exact: true }).waitFor({ timeout: 20000 });

  // 8. Tabletop, the player's turn -- clean 14-tile rack, empty table.
  await capture("tabletop-your-turn", page);

  // 9. Tabletop, the computer's turn -- draw (ends the human's turn),
  // observe "Computer is playing…", then wait for control to return before
  // the next capture needs an interactive board again.
  await capture("tabletop-computer-turn", page, async () => {
    await page.getByRole("button", { name: "Draw tile" }).click();
    await page.getByText(/Computer is playing…/).waitFor({ timeout: 10000 });
  });
  await page.getByText("Your turn", { exact: true }).waitFor({ timeout: 20000 });

  // 10. Tabletop, a rack tile selected (gold ring, aria-pressed).
  const rackTiles = page.locator('[aria-label="Your rack"] .tile');
  await capture("tabletop-tile-selected", page, async () => {
    await rackTiles.first().click();
  });
  // Deselect before dragging, so the invalid-set capture isn't also showing
  // an unrelated selection ring on a rack tile.
  await rackTiles.first().click();

  // 11. Tabletop, an invalid set -- any two-tile group is invalid by rule
  // (a set/run needs 3+), so this is deterministic regardless of the
  // random deal: drag one rack tile to the "start a new set" zone, then a
  // second rack tile onto that same new set.
  //
  // A raw mouse drag (unlike .click()) never auto-scrolls, so both ends
  // must already be on-screen together -- the previous capture's
  // shootAllViewports loop can leave the viewport on the short 844x390
  // mobile-landscape size, where rack and board don't both fit. Reset to a
  // tall viewport (matching e2e/tests/drag-and-drop.spec.ts's own
  // `viewport: { width: 1280, height: 2200 }`) before dragging; the
  // capture's own shootAllViewports resizes for the actual screenshots
  // afterward regardless.
  await page.setViewportSize({ width: 1280, height: 2200 });
  await capture("tabletop-invalid-set", page, async () => {
    const newSetZone = page.locator('[aria-label="Start a new set"]');
    await dragTo(page, rackTiles.first(), newSetZone);
    const setOneZone = page.locator('[aria-label^="Set 1,"]');
    await setOneZone.locator(".tile").first().waitFor();
    await dragTo(page, rackTiles.first(), setOneZone.locator(".tile").first());
    await page.getByText(/^Set 1 --/).waitFor();
  });

  // 12. Tabletop, completed game + one-click Rematch -- resign is the only
  // deterministic way to reach game:over (a natural finish depends on the
  // random deal). The pending invalid set on the table doesn't block
  // resigning.
  await capture("tabletop-completed-rematch", page, async () => {
    await page.getByRole("button", { name: "Resign" }).click();
    await page.getByRole("button", { name: "Confirm resign" }).click();
    await page.getByRole("heading", { name: "Game over" }).waitFor({ timeout: 10000 });
  });

  await context.close();

  // 13. Unavailable/error game state -- a fresh context and identity,
  // navigating directly to a well-formed but never-issued game id (the
  // same "unavailable" code path a retention-purged game hits --
  // e2e/tests/purgedGame.spec.ts).
  const errorContext = await browser.newContext({ baseURL: BASE_URL });
  const errorPage = await errorContext.newPage();
  await capture("tabletop-unavailable-game", errorPage, async () => {
    await waitForReady(errorPage);
    await claimUsername(errorPage, "BaselineErr");
    await errorPage.goto("/games/00000000-0000-0000-0000-000000000000");
    await errorPage.getByText(/doesn't exist|no longer available/i).waitFor();
  });
  await errorContext.close();

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
