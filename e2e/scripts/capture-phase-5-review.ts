// Meld Masters visual refresh -- Phase 5 review screenshot capture
// (docs/meld-masters-visual-refresh-plan.md §11 Phase 5: portrait
// integration). Standalone script, kept outside e2e/tests like the other
// capture-phase-N-review.ts scripts. Every identity/room/message this
// script creates is disposable test data.
//
// Usage: pnpm exec tsx e2e/scripts/capture-phase-5-review.ts [outDir]
// Both the server and Vite dev servers must already be running.

import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForReady, claimUsername, joinRoomByName, clickUntilSettled } from "../tests/helpers.js";

const BASE_URL = process.env.BASELINE_BASE_URL ?? "http://localhost:5173";
const OUT_DIR = path.resolve(
  process.argv[2] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/design-reference/phase-5-review"),
);

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

// -- N-player room setup, contexts created with explicit baseURL (this
// script drives the raw chromium API, not the Playwright test runner, so
// the ambient baseURL config from playwright.config.ts never applies --
// the same fix Phase 4 closure had to make to its own capture script). --
async function startNPlayerRoom(
  browser: Browser,
  capacity: 2 | 3 | 4,
  namePrefix: string,
): Promise<{ pages: Page[]; contexts: BrowserContext[]; activePage: Page }> {
  const contexts = await Promise.all(
    Array.from({ length: capacity }, () => browser.newContext({ baseURL: BASE_URL })),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  await Promise.all(pages.map((p) => waitForReady(p)));

  const hostPage = pages[0]!;
  const guestPages = pages.slice(1);
  const hostUsername = await claimUsername(hostPage, `${namePrefix}Host`);
  for (const [i, guestPage] of guestPages.entries()) {
    await claimUsername(guestPage, `${namePrefix}P${i + 2}`);
  }

  await hostPage.getByRole("link", { name: "Create Room" }).click();
  await hostPage.getByRole("radio", { name: `${capacity} players` }).check();
  await hostPage.getByRole("radio", { name: "Private (invite by code)" }).check();
  await clickUntilSettled(
    hostPage,
    hostPage.getByRole("button", { name: "Create room" }),
    hostPage.getByRole("heading", { name: hostUsername }),
  );
  for (const guestPage of guestPages) {
    await joinRoomByName(guestPage, hostUsername);
  }

  await hostPage.waitForURL(/\/games\//, { timeout: 15000 });
  const gameUrl = hostPage.url();
  for (const page of guestPages) {
    try {
      await page.waitForURL(/\/games\//, { timeout: 10000 });
    } catch {
      await page.goto(gameUrl);
    }
  }
  for (const page of pages) {
    await page.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });
  }
  await pages[0]!
    .getByText("Your turn", { exact: true })
    .or(pages[0]!.getByText(/Waiting on seat/))
    .first()
    .waitFor({ timeout: 15000 });
  let activePage = pages[0]!;
  for (const page of pages) {
    if (await page.getByText("Your turn", { exact: true }).isVisible()) {
      activePage = page;
      break;
    }
  }
  return { pages, contexts, activePage };
}

async function withBrowser(fn: (browser: Browser) => Promise<void>): Promise<void> {
  const browser = await chromium.launch();
  try {
    await fn(browser);
  } catch (err) {
    missing.push(`(setup) -- ${(err as Error).message}`);
    console.error(`FAILED (setup): ${(err as Error).message}`);
  } finally {
    await browser.close();
  }
}

async function run(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  // 1. Waiting room, vs computer: one human (real rival portrait) + one
  // BOT (fallback portrait) -- also stands in for the "fallback portrait"
  // required state (§ "Manual review screenshots" item 8), produced
  // naturally by the real portraitForSeat(seatIndex, isComputer) mapping,
  // not a contrived code change.
  await withBrowser(async (browser) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await waitForReady(page);
    await claimUsername(page, "Phase5VsBot");
    // claimUsername lands on the Recovery page, not Home -- the Play vs
    // Computer button only exists on Home (a lesson learned the hard way
    // in the Phase 4 closure capture script).
    await page.getByRole("link", { name: "Meld Masters", exact: true }).click();
    const playVsComputer = page.getByRole("button", { name: /play vs computer/i });
    await playVsComputer.waitFor();
    await playVsComputer.click();
    await page.getByLabel("computer opponent").waitFor();
    await capture("waiting-room-vs-computer", page);

    // 4. Tabletop, vs computer -- opponent strip shows the fallback portrait.
    await page.getByRole("button", { name: "Mark ready" }).click();
    await page.getByRole("button", { name: /Start game/ }).click();
    await page.waitForURL(/\/games\//, { timeout: 15000 });
    await page.getByRole("heading", { name: /Your rack \(14\)/ }).waitFor({ timeout: 15000 });
    await page
      .getByText("Your turn", { exact: true })
      .or(page.getByText(/Computer is playing/))
      .first()
      .waitFor({ timeout: 20000 });
    await capture("tabletop-vs-computer", page);
    await context.close();
  });

  // 2. Tabletop, two real humans -- opponent strip shows one genuine
  // rival portrait (not the fallback), distinct from the vs-computer
  // capture above.
  await withBrowser(async (browser) => {
    const { activePage, contexts } = await startNPlayerRoom(browser, 2, "Phase5Two");
    await capture("tabletop-human-opponent", activePage);
    for (const c of contexts) await c.close();
  });

  // 3. Waiting room, two real humans in a 3-capacity room (deliberately
  // under capacity -- Phase 4 auto-start only fires when the room fills,
  // so this stays a genuine waiting-room state) -- two distinct rival
  // portraits visible side by side before any game starts.
  await withBrowser(async (browser) => {
    const contexts = await Promise.all(
      Array.from({ length: 2 }, () => browser.newContext({ baseURL: BASE_URL })),
    );
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    await Promise.all(pages.map((p) => waitForReady(p)));
    const hostUsername = await claimUsername(pages[0]!, "Phase5PairHost");
    await claimUsername(pages[1]!, "Phase5PairP2");
    await pages[0]!.getByRole("link", { name: "Create Room" }).click();
    await pages[0]!.getByRole("radio", { name: "3 players" }).check();
    await pages[0]!.getByRole("radio", { name: "Private (invite by code)" }).check();
    await clickUntilSettled(
      pages[0]!,
      pages[0]!.getByRole("button", { name: "Create room" }),
      pages[0]!.getByRole("heading", { name: hostUsername }),
    );
    await joinRoomByName(pages[1]!, hostUsername);
    await pages[0]!.getByText(hostUsername, { exact: false }).first().waitFor();
    await capture("waiting-room-two-human", pages[0]!);
    for (const c of contexts) await c.close();
  });

  // 4. Waiting room, 3 of 4 players (not yet at capacity) -- multiple
  // distinct rival portraits visible at once, still genuinely "waiting".
  await withBrowser(async (browser) => {
    const contexts = await Promise.all(
      Array.from({ length: 3 }, () => browser.newContext({ baseURL: BASE_URL })),
    );
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    await Promise.all(pages.map((p) => waitForReady(p)));
    const hostUsername = await claimUsername(pages[0]!, "Phase5MultiHost");
    await claimUsername(pages[1]!, "Phase5MultiP2");
    await claimUsername(pages[2]!, "Phase5MultiP3");

    await pages[0]!.getByRole("link", { name: "Create Room" }).click();
    await pages[0]!.getByRole("radio", { name: "4 players" }).check();
    await pages[0]!.getByRole("radio", { name: "Private (invite by code)" }).check();
    await clickUntilSettled(
      pages[0]!,
      pages[0]!.getByRole("button", { name: "Create room" }),
      pages[0]!.getByRole("heading", { name: hostUsername }),
    );
    await joinRoomByName(pages[1]!, hostUsername);
    await joinRoomByName(pages[2]!, hostUsername);
    // 3 of 4 seats filled -- room stays in the waiting room (Phase 4
    // auto-start only fires at capacity), giving a genuine multi-portrait
    // waiting-room state.
    await pages[0]!.getByText(hostUsername, { exact: false }).first().waitFor();
    await capture("waiting-room-multiplayer", pages[0]!);
    for (const c of contexts) await c.close();
  });

  // 5. Tabletop, 4-player active game -- opponent strip shows 3
  // distinct portraits (this active seat's 3 opponents) at once.
  await withBrowser(async (browser) => {
    const { activePage, contexts } = await startNPlayerRoom(browser, 4, "Phase5Multi");
    await capture("tabletop-multiplayer", activePage);
    for (const c of contexts) await c.close();
  });

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
