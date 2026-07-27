// Meld Masters visual refresh -- Phase 3 review screenshot capture
// (docs/meld-masters-visual-refresh-plan.md Phase 3, "Manual visual-review
// screenshots"). A focused sibling of the Phase 0/2 capture scripts: same
// approach (standalone script outside e2e/tests so it never runs as part
// of `npx playwright test` / CI, same reused e2e helpers), covering the
// six pre-game/identity screens Phase 3 restyled.
//
// Usage:
//   pnpm exec tsx e2e/scripts/capture-phase-3-review.ts [outDir]
//
// outDir defaults to docs/design-reference/phase-3-review. Both
// `pnpm --filter @tile-meld/server run dev` and
// `pnpm --filter @tile-meld/web run dev` must already be running.

import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { waitForReady, claimUsername } from "../tests/helpers.js";

const BASE_URL = process.env.BASELINE_BASE_URL ?? "http://localhost:5173";
const OUT_DIR = path.resolve(process.argv[2] ?? "docs/design-reference/phase-3-review");

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

  // A separate, disposable context creates one real public room so the
  // "public lobby with at least one room" screenshot shows genuine content
  // rather than an empty list. Closed immediately after; the room itself
  // is harmless leftover state in the disposable e2e database, same as
  // every other capture/e2e run against it.
  const seedContext = await browser.newContext({ baseURL: BASE_URL });
  const seedPage = await seedContext.newPage();
  await waitForReady(seedPage);
  await claimUsername(seedPage, "Phase3Seed");
  await seedPage.getByRole("link", { name: "Create Room" }).click();
  await seedPage.getByRole("radio", { name: "4 players" }).check();
  await seedPage.getByRole("radio", { name: "Public (listed in the lobby)" }).check();
  await seedPage.getByRole("button", { name: "Create room" }).click();
  await seedPage.waitForURL(/\/rooms\//, { timeout: 15000 });
  await seedContext.close();

  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();

  // 1. Home dashboard, claimed identity. A brand-new claimed identity has
  // zero rooms, so this single capture also stands in for the "empty
  // state" -- materially the same empty-dashboard content Phase 0's
  // baseline and Phase 2's review already captured once each; a second,
  // near-identical unclaimed variant was judged not materially different
  // enough to warrant its own capture here (documented in the Phase 3
  // summary).
  await capture("home-dashboard", page, async () => {
    await waitForReady(page);
    await claimUsername(page, "Phase3Review");
    await page.getByRole("link", { name: "Meld Masters", exact: true }).click();
    await page.getByRole("heading", { level: 1, name: "Meld Masters" }).waitFor();
  });

  // 2. Public lobby, with the seeded room visible.
  await capture("public-lobby", page, async () => {
    await page.goto("/lobby");
    await page.getByRole("heading", { name: "Open Rooms" }).waitFor();
  });

  // 3. Create-room form (not submitted).
  await capture("create-room", page, async () => {
    await page.goto("/rooms/new");
    await page.getByRole("heading", { name: "Create a room" }).waitFor();
  });

  // 4. Join-by-name form (not submitted).
  await capture("join-by-name", page, async () => {
    await page.goto("/rooms/join");
    await page.getByLabel("Room name").waitFor();
  });

  // 5. Waiting room, human + computer opponent (Play vs Computer lands
  // here before starting).
  await capture("waiting-room", page, async () => {
    await page.getByRole("link", { name: "Meld Masters", exact: true }).click();
    const playVsComputer = page.getByRole("button", { name: /play vs computer/i });
    await playVsComputer.waitFor();
    await playVsComputer.click();
    await page.getByLabel("computer opponent").waitFor();
  });

  // 6. Recovery screen.
  await capture("recovery", page, async () => {
    await page.goto("/recovery");
    await page.getByRole("heading", { level: 1, name: "Recovery" }).waitFor();
  });

  // 7. Home dashboard, populated: the vs-computer room created for the
  // waiting-room capture above now shows as a real "Your Games" status
  // card. A more useful eighth-screen choice than a near-duplicate of the
  // empty/unclaimed dashboard Phase 0 and Phase 2 already captured (see
  // the comment on state 1) -- this demonstrates the arcade status-card
  // treatment (§ "Game-status card treatment") with real content instead.
  await capture("home-dashboard-populated", page, async () => {
    await page.getByRole("link", { name: "Meld Masters", exact: true }).click();
    await page.getByRole("heading", { level: 2, name: "Your Games" }).waitFor();
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
