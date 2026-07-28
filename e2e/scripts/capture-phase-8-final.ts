// Meld Masters visual refresh -- Phase 8 final review screenshot capture
// (docs/meld-masters-visual-refresh-plan.md §11 Phase 8: regression
// testing, visual review, release preparation). Standalone script, kept
// outside e2e/tests like the other capture-phase-N-review.ts scripts.
// Writes to docs/design-reference/final/, a NEW directory -- every
// earlier phase-N-review directory is left untouched. Every identity/
// room/message this script creates is disposable test data.
//
// Usage: pnpm exec tsx e2e/scripts/capture-phase-8-final.ts [outDir]
// Both the server and Vite dev servers must already be running.

import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForReady, claimUsername, joinRoomByName, clickUntilSettled } from "../tests/helpers.js";

const BASE_URL = process.env.BASELINE_BASE_URL ?? "http://localhost:5173";
const OUT_DIR = path.resolve(
  process.argv[2] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/design-reference/final"),
);

// The plan's own general-purpose viewport set (matches every earlier
// phase's capture-phase-N-review.ts) for ordinary screen states. A few
// states below are inherently tied to their own single specified
// condition (320px narrow, 200% zoom, a live in-progress drag gesture)
// and are captured once at the viewport/condition that state actually
// calls for, rather than force-repeated across all four -- noted inline
// at each such site.
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

async function shootOne(page: Page, name: string, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  const file = `${name}--${width}x${height}.png`;
  await page.screenshot({ path: path.join(OUT_DIR, file) });
  captured.push(file);
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

type ParsedTile = { label: string; color?: string; value?: number; isJoker: boolean };

async function readRackTiles(page: Page): Promise<ParsedTile[]> {
  const labels = await page.locator(".tabletop-rack .tile").evaluateAll((els) =>
    els.map((el) => el.getAttribute("aria-label") ?? ""),
  );
  return labels.map((label) => {
    if (/joker/i.test(label)) return { label, isJoker: true };
    const m = /^(\w+)\s+(\d+)$/.exec(label);
    return m ? { label, color: m[1], value: Number(m[2]), isJoker: false } : { label, isJoker: false };
  });
}

/** Finds 3 rack tiles forming a valid run (same color, consecutive
 * values) or valid group (same value, 3+ distinct colors) by reading
 * each tile's real aria-label -- deterministic given whatever random
 * hand this run's game actually dealt, not a contrived/forced set. */
function findValidTriple(tiles: ParsedTile[]): string[] | undefined {
  const numbered = tiles.filter((t): t is ParsedTile & { color: string; value: number } => !t.isJoker && !!t.color);
  // Group: same value, 3 distinct colors.
  const byValue = new Map<number, ParsedTile[]>();
  for (const t of numbered) byValue.set(t.value, [...(byValue.get(t.value) ?? []), t]);
  for (const group of byValue.values()) {
    const distinctColors = new Map<string, ParsedTile>();
    for (const t of group) distinctColors.set(t.color, t);
    if (distinctColors.size >= 3) return [...distinctColors.values()].slice(0, 3).map((t) => t.label);
  }
  // Run: same color, 3 consecutive values.
  const byColor = new Map<string, number[]>();
  for (const t of numbered) byColor.set(t.color, [...(byColor.get(t.color) ?? []), t.value]);
  for (const [color, values] of byColor) {
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    for (let i = 0; i + 2 < sorted.length; i++) {
      if (sorted[i + 1] === sorted[i]! + 1 && sorted[i + 2] === sorted[i]! + 2) {
        return [sorted[i], sorted[i + 1], sorted[i + 2]].map((v) => `${color} ${v}`);
      }
    }
  }
  return undefined;
}

async function placeIntoNewSet(page: Page, tileLabel: string): Promise<void> {
  await page.getByRole("button", { name: tileLabel, exact: true }).first().click();
  await page.getByRole("button", { name: /Start a new set/ }).click();
}
async function placeIntoSet(page: Page, tileLabel: string, setIndex: number): Promise<void> {
  await page.getByRole("button", { name: tileLabel, exact: true }).first().click();
  await page.locator(`[aria-label^="Set ${setIndex},"]`).first().click();
}

async function run(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  // 1. Home/dashboard, empty (no games yet).
  await withBrowser(async (browser) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await waitForReady(page);
    await capture("home-dashboard-empty", page);
    await context.close();
  });

  // 2. Home/dashboard, populated (one open room card).
  await withBrowser(async (browser) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await waitForReady(page);
    await claimUsername(page, "Phase8DashPop");
    await page.getByRole("link", { name: "Create Room" }).click();
    await page.getByRole("radio", { name: "3 players" }).check();
    await page.getByRole("radio", { name: "Private (invite by code)" }).check();
    await page.getByRole("button", { name: "Create room" }).click();
    await page.waitForURL(/\/rooms\//, { timeout: 15000 });
    await page.getByRole("link", { name: "Home" }).click();
    await page.getByRole("heading", { level: 2, name: "Your Games" }).waitFor();
    await capture("home-dashboard-populated", page);
    await context.close();
  });

  // 3. Public lobby.
  await withBrowser(async (browser) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await waitForReady(page);
    await page.getByRole("navigation").getByRole("link", { name: "Public Lobby" }).click();
    await page.getByRole("heading", { name: "Public lobby" }).waitFor();
    await capture("public-lobby", page);
    await context.close();
  });

  // 4. Create room.
  await withBrowser(async (browser) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await waitForReady(page);
    await page.getByRole("link", { name: "Create Room" }).click();
    await page.getByRole("heading", { name: "Create a room" }).waitFor();
    await capture("create-room", page);
    await context.close();
  });

  // 5. Join room.
  await withBrowser(async (browser) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await waitForReady(page);
    await page.getByRole("navigation").getByRole("link", { name: "Join Room by Name" }).click();
    await capture("join-room", page);
    await context.close();
  });

  // 6. Waiting room, vs computer (fallback portrait).
  let tabletopVsComputerPage: Page | undefined;
  await withBrowser(async (browser) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await waitForReady(page);
    await claimUsername(page, "Phase8VsBot");
    await page.getByRole("link", { name: "Meld Masters", exact: true }).click();
    const playVsComputer = page.getByRole("button", { name: /play vs computer/i });
    await playVsComputer.waitFor();
    await playVsComputer.click();
    await page.getByLabel("computer opponent").waitFor();
    await capture("waiting-room-computer-portrait", page);

    // 11. Tabletop, computer's turn (captured from this same game once started).
    await page.getByRole("button", { name: "Mark ready" }).click();
    await page.getByRole("button", { name: /Start game/ }).click();
    await page.waitForURL(/\/games\//, { timeout: 15000 });
    await page.getByRole("heading", { name: /Your rack \(14\)/ }).waitFor({ timeout: 15000 });
    const isMyTurn = await page.getByText("Your turn", { exact: true }).isVisible().catch(() => false);
    if (!isMyTurn) {
      await capture("tabletop-computer-turn", page);
    } else {
      // Draw/pass through until the bot's turn comes up, bounded.
      for (let i = 0; i < 5 && (await page.getByText("Your turn", { exact: true }).isVisible()); i++) {
        const draw = page.getByRole("button", { name: "Draw tile" });
        if (await draw.isEnabled()) await draw.click();
        else await page.getByRole("button", { name: "Pass" }).click();
        await page.waitForTimeout(500);
      }
      await capture("tabletop-computer-turn", page);
    }
    tabletopVsComputerPage = page;
    // Deliberately not closing this context -- reused by state 21 below.
  });

  // 7. Multiplayer waiting room, 3 of 4 seats -- multiple rival portraits.
  await withBrowser(async (browser) => {
    const contexts = await Promise.all(
      Array.from({ length: 3 }, () => browser.newContext({ baseURL: BASE_URL })),
    );
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    await Promise.all(pages.map((p) => waitForReady(p)));
    const hostUsername = await claimUsername(pages[0]!, "Phase8MultiHost");
    await claimUsername(pages[1]!, "Phase8MultiP2");
    await claimUsername(pages[2]!, "Phase8MultiP3");
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
    // Wait for all 3 seats to actually render (not just the host's own
    // name) -- an earlier run captured this state after only the host's
    // join had rendered, showing a single-seat room instead of the
    // intended multi-portrait state.
    await pages[0]!.locator(".seat-list li").nth(2).waitFor({ timeout: 15000 });
    await capture("waiting-room-multiplayer-portraits", pages[0]!);
    for (const c of contexts) await c.close();
  });

  // 8. Recovery. Identity bootstrap (AuthProvider) mints a fresh identity
  // and its one-time-reveal recovery secret automatically on first visit
  // -- dismiss it ("I've saved it") before capturing, both because the
  // dismissed/returning-user layout is the actually-representative final
  // state, and because a fullPage screenshot would otherwise capture a
  // real (if disposable/test-only) recovery secret, which must never be
  // in a committed screenshot.
  await withBrowser(async (browser) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await waitForReady(page);
    await page.getByRole("navigation").getByRole("link", { name: "Recovery" }).click();
    await page.getByRole("heading", { name: "Recovery", exact: true }).waitFor();
    const dismiss = page.getByRole("button", { name: "I've saved it" });
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
    await capture("recovery", page);
    await context.close();
  });

  // 9-10, 12-19. A live 2-human game covers: your turn, human-opponent
  // turn, selected tile, active drag, valid set, invalid set, multiple
  // sets, sorted rack, commit enabled, expanded chat.
  await withBrowser(async (browser) => {
    const hostContext = await browser.newContext({ baseURL: BASE_URL });
    const guestContext = await browser.newContext({ baseURL: BASE_URL });
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();
    await waitForReady(hostPage);
    await waitForReady(guestPage);
    const hostUsername = await claimUsername(hostPage, "Phase8Host");
    await claimUsername(guestPage, "Phase8Guest");
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
    await guestPage.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });
    const activePage = (await hostPage.getByText("Your turn", { exact: true }).isVisible())
      ? hostPage
      : guestPage;
    const waitingPage = activePage === hostPage ? guestPage : hostPage;

    // Each numbered state below is independently caught -- one state's
    // failure must not skip the states after it (a real bug in an
    // earlier version of this script: a single try/catch around this
    // whole block let one failure silently skip six later states).
    async function attempt(label: string, fn: () => Promise<void>): Promise<void> {
      try {
        await fn();
      } catch (err) {
        missing.push(`${label} -- ${(err as Error).message}`);
        console.error(`FAILED: ${label}: ${(err as Error).message}`);
      }
    }

    // 9. Tabletop, your turn.
    await attempt("tabletop-your-turn", () => capture("tabletop-your-turn", activePage));
    // 10. Tabletop, human-opponent turn (the other seat's view of the same moment).
    await attempt("tabletop-human-opponent-turn", () =>
      capture("tabletop-human-opponent-turn", waitingPage),
    );

    // 12. Selected tile.
    const firstTile = activePage.locator(".tabletop-rack .tile").first();
    await attempt("tabletop-selected-tile", async () => {
      await firstTile.click();
      await capture("tabletop-selected-tile", activePage);
      await firstTile.click(); // deselect, so later states start clean
    });

    // 13. Active drag/drop -- a live in-progress gesture; a single
    // representative capture (not repeated across all 4 viewports, which
    // would require re-staging the same live gesture 4 times over). Uses
    // the SECOND rack tile (not firstTile, already toggled twice above)
    // to avoid any residual selection-state ambiguity.
    await attempt("tabletop-active-drag", async () => {
      await activePage.setViewportSize(VIEWPORTS["1280x720"]);
      const dragTile = activePage.locator(".tabletop-rack .tile").nth(1);
      await dragTile.scrollIntoViewIfNeeded();
      const dropZone = activePage.getByRole("button", { name: /Start a new set/ });
      await dropZone.scrollIntoViewIfNeeded();
      const tileBox = await dragTile.boundingBox({ timeout: 10000 });
      const dropBox = await dropZone.boundingBox({ timeout: 10000 });
      if (!tileBox || !dropBox) throw new Error("could not compute tile/drop-zone bounding boxes");
      await activePage.mouse.move(tileBox.x + tileBox.width / 2, tileBox.y + tileBox.height / 2);
      await activePage.mouse.down();
      await activePage.mouse.move(dropBox.x + dropBox.width / 2, dropBox.y - 20, { steps: 8 });
      await activePage.waitForTimeout(100);
      await shootOne(activePage, "tabletop-active-drag", 1280, 720);
      await activePage.mouse.up();
      await activePage.keyboard.press("Escape").catch(() => {});
    });

    // 14/16/18. Valid set / multiple sets / commit enabled (if the
    // actual random hand contains a valid combination -- not fabricated).
    await attempt("tabletop-valid-set / multiple-sets / commit-enabled", async () => {
      const rackTiles = await readRackTiles(activePage);
      const validTriple = findValidTriple(rackTiles);
      if (!validTriple) {
        throw new Error(
          "this run's random 14-tile hand contained no valid run or group; not fabricated",
        );
      }
      await placeIntoNewSet(activePage, validTriple[0]!);
      await placeIntoSet(activePage, validTriple[1]!, 1);
      await placeIntoSet(activePage, validTriple[2]!, 1);
      await activePage.getByText(/^Set 1 --/).waitFor();
      await capture("tabletop-valid-set", activePage);

      const remaining = await readRackTiles(activePage);
      const extra = remaining.find((t) => !validTriple.includes(t.label));
      if (extra) {
        await placeIntoNewSet(activePage, extra.label);
        await activePage.getByText(/^Set 2 --/).waitFor();
        await capture("tabletop-multiple-sets", activePage);
      } else {
        missing.push("tabletop-multiple-sets -- no additional rack tile available to form a 2nd set");
      }
      await capture("tabletop-commit-enabled", activePage);
      await activePage.getByRole("button", { name: "Reset turn" }).click();
    });

    // 15. Invalid set -- any 3 tiles not already known-valid.
    await attempt("tabletop-invalid-set", async () => {
      const freshRack = await readRackTiles(activePage);
      const three = freshRack.filter((t) => !t.isJoker).slice(0, 3).map((t) => t.label);
      if (three.length !== 3) throw new Error("fewer than 3 non-joker tiles in rack");
      await placeIntoNewSet(activePage, three[0]!);
      await placeIntoSet(activePage, three[1]!, 1);
      await placeIntoSet(activePage, three[2]!, 1);
      await activePage.getByText(/^Set 1 --/).waitFor();
      const captionText = await activePage.getByText(/^Set 1 --/).textContent();
      if (captionText?.includes("not a valid run or group")) {
        await capture("tabletop-invalid-set", activePage);
      } else {
        // Accidentally valid -- still a legitimate captured state, just
        // relabel honestly rather than mislabel a valid set as invalid.
        await capture("tabletop-set-attempt-was-valid-not-invalid", activePage);
        missing.push(
          "tabletop-invalid-set -- the first 3 non-joker rack tiles happened to form a valid set; captured as tabletop-set-attempt-was-valid-not-invalid instead",
        );
      }
      await activePage.getByRole("button", { name: "Reset turn" }).click();
    });

    // 17. Sorted rack.
    await attempt("tabletop-sorted-rack", async () => {
      await activePage.getByRole("button", { name: "Sort by number" }).click();
      await capture("tabletop-sorted-rack", activePage);
    });

    // 19. Expanded chat (open by default; confirm and capture explicitly).
    await attempt("tabletop-chat-expanded", async () => {
      const chatToggle = activePage.locator(".tabletop-chat-toggle");
      if ((await chatToggle.getAttribute("aria-expanded")) === "false") await chatToggle.click();
      await capture("tabletop-chat-expanded", activePage);
    });

    await hostContext.close();
    await guestContext.close();
  });

  // 20. Completed / rematch (via resign, the deterministic path).
  await withBrowser(async (browser) => {
    const hostContext = await browser.newContext({ baseURL: BASE_URL });
    const guestContext = await browser.newContext({ baseURL: BASE_URL });
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();
    await waitForReady(hostPage);
    await waitForReady(guestPage);
    const hostUsername = await claimUsername(hostPage, "Phase8RematchHost");
    await claimUsername(guestPage, "Phase8RematchGuest");
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
    await guestPage.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });
    await hostPage.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });
    await guestPage.getByRole("button", { name: "Resign" }).click();
    await guestPage.getByRole("button", { name: "Confirm resign" }).click();
    await hostPage.getByRole("heading", { name: "Game over" }).waitFor({ timeout: 15000 });
    await capture("tabletop-completed-rematch", hostPage);
    await hostContext.close();
    await guestContext.close();
  });

  // 21. Unavailable game.
  await withBrowser(async (browser) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await waitForReady(page);
    await page.goto("/games/00000000-0000-0000-0000-000000000000");
    await page.getByText(/doesn't exist|not seated/i).waitFor({ timeout: 10000 });
    await capture("tabletop-unavailable-game", page);
    await context.close();
  });

  // 22. Skip link, visibly focused.
  await withBrowser(async (browser) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await waitForReady(page);
    await page.setViewportSize(VIEWPORTS["1280x720"]);
    await page.keyboard.press("Tab");
    await page.locator("a.skip-link").waitFor({ state: "visible" });
    await shootOne(page, "skip-link-focused", 1280, 720);
    await context.close();
  });

  // 23. Narrow 320px waiting room.
  await withBrowser(async (browser) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await waitForReady(page);
    const username = await claimUsername(page, "Phase8Narrow320");
    await page.getByRole("link", { name: "Create Room" }).click();
    await page.getByRole("radio", { name: "2 players" }).check();
    await page.getByRole("radio", { name: "Private (invite by code)" }).check();
    await clickUntilSettled(
      page,
      page.getByRole("button", { name: "Create room" }),
      page.getByRole("heading", { name: username }),
    );
    await shootOne(page, "waiting-room-narrow-320", 320, 568);
    await context.close();
  });

  // 24. Tabletop at 200% zoom.
  await withBrowser(async (browser) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const guestContext = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    const guestPage = await guestContext.newPage();
    await waitForReady(page);
    await waitForReady(guestPage);
    const username = await claimUsername(page, "Phase8Zoom");
    await claimUsername(guestPage, "Phase8ZoomGuest");
    await page.getByRole("link", { name: "Create Room" }).click();
    await page.getByRole("radio", { name: "2 players" }).check();
    await page.getByRole("radio", { name: "Private (invite by code)" }).check();
    await clickUntilSettled(
      page,
      page.getByRole("button", { name: "Create room" }),
      page.getByRole("heading", { name: username }),
    );
    await joinRoomByName(guestPage, username);
    await page.waitForURL(/\/games\//, { timeout: 15000 });
    await page.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });
    await page.setViewportSize(VIEWPORTS["1280x720"]);
    await page.evaluate(() => {
      (document.documentElement.style as unknown as { zoom: string }).zoom = "200%";
    });
    await page.waitForTimeout(150);
    await shootOne(page, "tabletop-200pct-zoom", 1280, 720);
    await context.close();
    await guestContext.close();
  });

  console.log(`\n${captured.length} screenshots captured to ${OUT_DIR}`);
  if (missing.length > 0) {
    console.error(`\n${missing.length} state(s) FAILED or fell back:`);
    for (const m of missing) console.error(`  - ${m}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
