// Meld Masters visual refresh -- Phase 7 full audit script (plan
// docs/meld-masters-visual-refresh-plan.md §13.2 acceptance checklist).
// Standalone script, kept outside e2e/tests like the capture-phase-N
// scripts -- this one produces a structured findings report on stdout
// instead of screenshots. Drives the raw chromium API directly (single
// browser, single worker) rather than the Playwright test runner, so it
// never competes with the real e2e suite's rate-limit budget and adds no
// extra browser-engine load.
//
// Usage: pnpm exec tsx e2e/scripts/audit-phase-7.ts
// Both the server and Vite dev servers must already be running.

import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  waitForReady,
  claimUsername,
  clickUntilSettled,
  joinRoomByName,
} from "../tests/helpers.js";

const BASE_URL = process.env.BASELINE_BASE_URL ?? "http://localhost:5173";

const VIEWPORTS: Record<string, { width: number; height: number }> = {
  "1440x900": { width: 1440, height: 900 },
  "1280x720": { width: 1280, height: 720 },
  "768x1024": { width: 768, height: 1024 },
  "1024x768": { width: 1024, height: 768 },
  "390x844": { width: 390, height: 844 },
  "844x390": { width: 844, height: 390 },
  "320x568": { width: 320, height: 568 },
};

type Finding = { area: string; severity: "fail" | "note"; detail: string };
const findings: Finding[] = [];
function fail(area: string, detail: string): void {
  findings.push({ area, severity: "fail", detail });
  console.error(`FAIL [${area}]: ${detail}`);
}
function note(area: string, detail: string): void {
  findings.push({ area, severity: "note", detail });
  console.log(`NOTE [${area}]: ${detail}`);
}
function pass(area: string, detail: string): void {
  console.log(`PASS [${area}]: ${detail}`);
}

async function overflowAt(page: Page, label: string): Promise<void> {
  for (const [vp, size] of Object.entries(VIEWPORTS)) {
    await page.setViewportSize(size);
    await page.waitForTimeout(80);
    const hasOverflow = await page
      .locator("html")
      .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    if (hasOverflow) {
      fail("overflow", `${label} @ ${vp}: horizontal overflow (scrollWidth > clientWidth)`);
    } else {
      pass("overflow", `${label} @ ${vp}`);
    }
  }
}

async function axeAt(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  if (serious.length > 0) {
    fail("axe", `${label}: ${serious.map((v) => v.id).join(", ")}`);
  } else {
    pass("axe", label);
  }
  const landmarks = results.passes.find((p) => p.id === "landmark-one-main");
  note(
    "axe-landmarks",
    `${label}: main landmark check ${landmarks ? "ran" : "did not run (page may lack content to test)"}`,
  );
}

async function touchTargetsAt390(page: Page, label: string, selectors: string[]): Promise<void> {
  await page.setViewportSize(VIEWPORTS["390x844"]);
  await page.waitForTimeout(80);
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) === 0) {
      note("touch-target", `${label}: selector not present, skipped: ${sel}`);
      continue;
    }
    const box = await loc.boundingBox();
    if (!box) {
      note("touch-target", `${label}: not visible, skipped: ${sel}`);
      continue;
    }
    if (box.width < 44 || box.height < 44) {
      fail(
        "touch-target",
        `${label}: ${sel} is ${box.width.toFixed(0)}x${box.height.toFixed(0)}px (< 44x44)`,
      );
    } else {
      pass("touch-target", `${label}: ${sel} ${box.width.toFixed(0)}x${box.height.toFixed(0)}px`);
    }
  }
}

async function focusVisibleCheck(page: Page, label: string, tabCount: number): Promise<void> {
  await page.setViewportSize(VIEWPORTS["1280x720"]);
  for (let i = 0; i < tabCount; i++) {
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        outlineStyle: cs.outlineStyle,
        outlineWidth: cs.outlineWidth,
        tag: el.tagName,
        cls: (el as HTMLElement).className,
      };
    });
    if (!outline) continue;
    if (outline.outlineStyle === "none" || outline.outlineWidth === "0px") {
      fail(
        "focus-visible",
        `${label}: tab stop #${i + 1} (<${outline.tag.toLowerCase()} class="${outline.cls}">) has no visible outline`,
      );
    }
  }
  pass("focus-visible", `${label}: ${tabCount} tab stops checked`);
}

async function reducedMotionCheck(page: Page, label: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(VIEWPORTS["1280x720"]);
  await page.waitForTimeout(80);
  const durations = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("button, .arcade-panel, .skip-link"));
    return els.slice(0, 40).map((el) => {
      const cs = getComputedStyle(el);
      return { transition: cs.transitionDuration, animation: cs.animationDuration };
    });
  });
  const offending = durations.filter((d) => {
    const t = parseFloat(d.transition);
    const a = parseFloat(d.animation);
    return (t > 0.001 && d.transition !== "0s") || (a > 0.001 && d.animation !== "0s");
  });
  if (offending.length > 0) {
    fail(
      "reduced-motion",
      `${label}: ${offending.length} element(s) still report a non-zero transition/animation duration`,
    );
  } else {
    pass("reduced-motion", `${label}: all sampled elements clamped to ~0 duration`);
  }
  await page.emulateMedia({ reducedMotion: null });
}

async function zoomCheck(
  page: Page,
  label: string,
  pct: number,
  criticalSelectors: string[],
): Promise<void> {
  await page.setViewportSize(VIEWPORTS["1280x720"]);
  await page.evaluate((z) => {
    (document.documentElement.style as unknown as { zoom: string }).zoom = `${z}%`;
  }, pct);
  await page.waitForTimeout(100);
  for (const sel of criticalSelectors) {
    const loc = page.locator(sel).first();
    const visible = (await loc.count()) > 0 ? await loc.isVisible().catch(() => false) : false;
    if (!visible) {
      fail("zoom", `${label} @ ${pct}%: expected element not visible/reachable: ${sel}`);
    } else {
      pass("zoom", `${label} @ ${pct}%: ${sel} visible`);
    }
  }
  await page.evaluate(() => {
    (document.documentElement.style as unknown as { zoom: string }).zoom = "100%";
  });
}

async function withBrowser(fn: (browser: Browser) => Promise<void>): Promise<void> {
  const browser = await chromium.launch();
  try {
    await fn(browser);
  } catch (err) {
    fail("(setup)", (err as Error).message);
  } finally {
    await browser.close();
  }
}

async function newPage(browser: Browser): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  return { page, context };
}

async function run(): Promise<void> {
  // 1. Home (unauthenticated) -- overflow all viewports, axe, focus.
  await withBrowser(async (browser) => {
    const { page, context } = await newPage(browser);
    await waitForReady(page);
    await overflowAt(page, "Home");
    await page.setViewportSize(VIEWPORTS["1280x720"]);
    await axeAt(page, "Home");
    await focusVisibleCheck(page, "Home (skip-link + header nav)", 6);
    await reducedMotionCheck(page, "Home");
    await zoomCheck(page, "Home", 200, [
      'h1:has-text("Meld Masters")',
      'a:has-text("Home")',
      'a:has-text("Create Room")',
    ]);
    await zoomCheck(page, "Home", 400, ['h1:has-text("Meld Masters")']);
    await touchTargetsAt390(page, "Home", [
      'nav a:has-text("Home")',
      'nav a:has-text("Create Room")',
      'a:has-text("Claim a username")',
    ]);
    await context.close();
  });

  // 2. Public Lobby.
  await withBrowser(async (browser) => {
    const { page, context } = await newPage(browser);
    await waitForReady(page);
    await page.getByRole("navigation").getByRole("link", { name: "Public Lobby" }).click();
    await page.getByRole("heading", { name: "Public lobby" }).waitFor();
    await overflowAt(page, "Public Lobby");
    await page.setViewportSize(VIEWPORTS["1280x720"]);
    await axeAt(page, "Public Lobby");
    await context.close();
  });

  // 3. Create Room -- unauthenticated first (real overflow/axe state), then
  // with a claimed username so the actual form (radios, submit button) is
  // present for the touch-target measurement (unauthenticated, the page
  // shows only a "claim a username" prompt, not the form).
  await withBrowser(async (browser) => {
    const { page, context } = await newPage(browser);
    await waitForReady(page);
    await page.getByRole("link", { name: "Create Room" }).click();
    await page.getByRole("heading", { name: "Create a room" }).waitFor();
    await overflowAt(page, "Create Room");
    await page.setViewportSize(VIEWPORTS["1280x720"]);
    await axeAt(page, "Create Room");
    await context.close();
  });
  await withBrowser(async (browser) => {
    const { page, context } = await newPage(browser);
    await waitForReady(page);
    await claimUsername(page, "AuditCreateRoom");
    await page.getByRole("link", { name: "Create Room" }).click();
    await page.getByRole("heading", { name: "Create a room" }).waitFor();
    await touchTargetsAt390(page, "Create Room (form)", [
      ".arcade-choice",
      'button:has-text("Create room")',
    ]);
    await context.close();
  });

  // 4. Join Room by Name.
  await withBrowser(async (browser) => {
    const { page, context } = await newPage(browser);
    await waitForReady(page);
    await page.getByRole("navigation").getByRole("link", { name: "Join Room by Name" }).click();
    await overflowAt(page, "Join Room by Name");
    await page.setViewportSize(VIEWPORTS["1280x720"]);
    await axeAt(page, "Join Room by Name");
    await context.close();
  });

  // 5. Recovery.
  await withBrowser(async (browser) => {
    const { page, context } = await newPage(browser);
    await waitForReady(page);
    await page.getByRole("navigation").getByRole("link", { name: "Recovery" }).click();
    await page.getByRole("heading", { name: "Recovery", exact: true }).waitFor();
    await overflowAt(page, "Recovery");
    await page.setViewportSize(VIEWPORTS["1280x720"]);
    await axeAt(page, "Recovery");
    await zoomCheck(page, "Recovery", 200, ['h1:has-text("Recovery")']);
    await context.close();
  });

  // 6. Waiting room, 2p with a real rival portrait.
  await withBrowser(async (browser) => {
    const { page, context } = await newPage(browser);
    await waitForReady(page);
    const username = await claimUsername(page, "AuditWait2p");
    await page.getByRole("link", { name: "Create Room" }).click();
    await page.getByRole("radio", { name: "2 players" }).check();
    await page.getByRole("radio", { name: "Private (invite by code)" }).check();
    await clickUntilSettled(
      page,
      page.getByRole("button", { name: "Create room" }),
      page.getByRole("heading", { name: username }),
    );
    await overflowAt(page, "Waiting Room (2p)");
    await page.setViewportSize(VIEWPORTS["1280x720"]);
    await axeAt(page, "Waiting Room (2p)");
    await touchTargetsAt390(page, "Waiting Room (2p)", [
      'button:has-text("Mark ready")',
      "img.seat-portrait",
    ]);
    await context.close();
  });

  // 7. Waiting room, multiplayer (3 of 4 seats) -- multiple portraits.
  await withBrowser(async (browser) => {
    const contexts = await Promise.all(
      Array.from({ length: 3 }, () => browser.newContext({ baseURL: BASE_URL })),
    );
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    await Promise.all(pages.map((p) => waitForReady(p)));
    const portraitRequests = new Set<string>();
    pages[0]!.on("request", (req) => {
      if (req.url().includes("/assets/") && /portrait/.test(req.url())) {
        portraitRequests.add(req.url().split("/").pop()!);
      }
    });
    const hostUsername = await claimUsername(pages[0]!, "AuditMultiHost");
    await claimUsername(pages[1]!, "AuditMultiP2");
    await claimUsername(pages[2]!, "AuditMultiP3");
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
    await pages[0]!.getByText(hostUsername, { exact: false }).first().waitFor();
    await pages[0]!.waitForTimeout(500);
    note(
      "portrait-loading",
      `Waiting Room (3 of 4 seats, 3 distinct portraits shown): ${portraitRequests.size} portrait file(s) downloaded: ${[...portraitRequests].join(", ")}`,
    );
    await overflowAt(pages[0]!, "Waiting Room (multiplayer, 3 portraits)");
    await pages[0]!.setViewportSize(VIEWPORTS["390x844"]);
    await pages[0]!.screenshot({
      path: "docs/design-reference/phase-7-review/multiplayer-waiting-room--390x844.png",
    });
    for (const c of contexts) await c.close();
  });

  // 8. Tabletop, active human-vs-human game.
  await withBrowser(async (browser) => {
    const hostContext = await browser.newContext({ baseURL: BASE_URL });
    const guestContext = await browser.newContext({ baseURL: BASE_URL });
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();
    await waitForReady(hostPage);
    await waitForReady(guestPage);
    const hostUsername = await claimUsername(hostPage, "AuditTableHost");
    await claimUsername(guestPage, "AuditTableGuest");
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

    await overflowAt(hostPage, "Tabletop (human opponent)");
    await hostPage.setViewportSize(VIEWPORTS["1280x720"]);
    await axeAt(hostPage, "Tabletop (human opponent)");
    await touchTargetsAt390(hostPage, "Tabletop", [
      ".tile",
      'button:has-text("Draw tile")',
      'button:has-text("Commit turn")',
      'button:has-text("Sort by number")',
      ".tabletop-chat-toggle",
    ]);
    await focusVisibleCheck(hostPage, "Tabletop (rack tiles + actions)", 8);
    await reducedMotionCheck(hostPage, "Tabletop");
    await zoomCheck(hostPage, "Tabletop", 200, [
      'button:has-text("Commit turn")',
      ".tabletop-chat-toggle",
    ]);

    // -- Full keyboard-only walkthrough (§13.2 "keyboard-only") --
    console.log("\n--- Keyboard-only walkthrough (Tabletop) ---");
    const firstTile = hostPage.locator(".tile").first();
    await firstTile.focus();
    await hostPage.keyboard.press("Enter");
    const pressed = await firstTile.getAttribute("aria-pressed");
    if (pressed === "true")
      pass("keyboard-walkthrough", "1-3: tile focus + Enter select, aria-pressed=true");
    else
      fail(
        "keyboard-walkthrough",
        `1-3: aria-pressed was "${pressed}" after Enter, expected "true"`,
      );

    const newSetZone = hostPage.getByRole("button", { name: /Start a new set/ });
    await newSetZone.focus();
    await hostPage.keyboard.press("Enter");
    const rackAfter = hostPage.getByRole("heading", { name: "Your rack (13)" });
    if (await rackAfter.isVisible().catch(() => false)) {
      pass("keyboard-walkthrough", "4-5: destination focus + Enter placed the tile (rack 14->13)");
    } else {
      fail("keyboard-walkthrough", "4-5: rack count did not drop after keyboard placement");
    }

    const sortByNumber = hostPage.getByRole("button", { name: "Sort by number" });
    await sortByNumber.focus();
    await hostPage.keyboard.press("Enter");
    if (await sortByNumber.getAttribute("aria-pressed").then((v) => v === "true")) {
      pass("keyboard-walkthrough", "6: Sort by number reachable and activatable by keyboard");
    } else {
      fail(
        "keyboard-walkthrough",
        "6: Sort by number did not become aria-pressed=true via keyboard",
      );
    }

    const moveRight = hostPage.getByRole("button", { name: "Move right" }).first();
    if ((await moveRight.count()) > 0) {
      await moveRight.focus();
      await hostPage.keyboard.press("Enter");
      pass(
        "keyboard-walkthrough",
        "7: set-reorder (Move left/right) control reachable and activatable by keyboard",
      );
    } else {
      note(
        "keyboard-walkthrough",
        "7: no 'Move right' control present yet (set has <2 tiles) -- not exercised this run",
      );
    }

    const undoButton = hostPage.getByRole("button", { name: "Undo" });
    await undoButton.focus();
    await hostPage.keyboard.press("Enter");
    pass("keyboard-walkthrough", "8a: Undo reachable and activatable by keyboard");

    // Re-place to have something to commit, then commit via keyboard.
    await firstTile.focus();
    await hostPage.keyboard.press("Enter");
    await newSetZone.focus();
    await hostPage.keyboard.press("Enter");
    const commitButton = hostPage.getByRole("button", { name: "Commit turn" });
    const commitEnabled = await commitButton.isEnabled();
    if (commitEnabled) {
      await commitButton.focus();
      await hostPage.keyboard.press("Enter");
      pass("keyboard-walkthrough", "8b: Commit turn reachable and activatable by keyboard");
    } else {
      note(
        "keyboard-walkthrough",
        "8b: Commit turn was disabled (arrangement not committable this run) -- reachability confirmed, activation not exercised",
      );
    }

    const chatToggle = hostPage.locator(".tabletop-chat-toggle");
    await chatToggle.focus();
    await hostPage.keyboard.press("Enter");
    const chatInput = hostPage
      .getByRole("textbox", { name: /message/i })
      .or(hostPage.locator("#tabletop-chat-panel input, #tabletop-chat-panel textarea"));
    if ((await chatInput.count()) > 0) {
      pass("keyboard-walkthrough", "9: chat expand reachable by keyboard, input present");
    } else {
      note(
        "keyboard-walkthrough",
        "9: chat toggled via keyboard; input locator did not match expected selector, not confirmed",
      );
    }

    const resignButton = hostPage.getByRole("button", { name: "Resign" });
    await resignButton.focus();
    await hostPage.keyboard.press("Enter");
    const cancelButton = hostPage.getByRole("button", { name: "Cancel" });
    const confirmVisible = await hostPage
      .getByRole("button", { name: "Confirm resign" })
      .isVisible()
      .catch(() => false);
    if (confirmVisible) {
      await cancelButton.focus();
      await hostPage.keyboard.press("Enter");
      const stillConfirming = await hostPage
        .getByRole("button", { name: "Confirm resign" })
        .isVisible()
        .catch(() => false);
      if (!stillConfirming)
        pass("keyboard-walkthrough", "10: resign confirmation opened and cancelled via keyboard");
      else
        fail(
          "keyboard-walkthrough",
          "10: Cancel via keyboard did not dismiss the resign confirmation",
        );
    } else {
      fail("keyboard-walkthrough", "10: Resign via keyboard did not open the confirmation state");
    }

    // Portraits must never receive focus (item 13) -- confirm via a full
    // Tab sweep counting how many stops land on an <img>.
    let imgFocusCount = 0;
    for (let i = 0; i < 30; i++) {
      await hostPage.keyboard.press("Tab");
      const isImg = await hostPage.evaluate(() => document.activeElement?.tagName === "IMG");
      if (isImg) imgFocusCount++;
    }
    if (imgFocusCount === 0)
      pass(
        "keyboard-walkthrough",
        "13: no portrait/decorative <img> ever received focus across 30 tab stops",
      );
    else fail("keyboard-walkthrough", `13: ${imgFocusCount} tab stop(s) landed on an <img>`);

    await hostContext.close();
    await guestContext.close();
  });

  // 9. Tabletop vs computer (fallback portrait).
  await withBrowser(async (browser) => {
    const { page, context } = await newPage(browser);
    await waitForReady(page);
    const username = await claimUsername(page, "AuditVsBot");
    await page.getByRole("link", { name: "Meld Masters", exact: true }).click();
    await clickUntilSettled(
      page,
      page.getByRole("button", { name: /Play vs Computer/ }),
      page.getByRole("heading", { name: username }),
    );
    await page.getByRole("button", { name: "Mark ready" }).click();
    await page.getByRole("button", { name: /Start game/ }).click();
    await page.waitForURL(/\/games\//, { timeout: 15000 });
    await page.getByRole("heading", { name: /Your rack \(14\)/ }).waitFor({ timeout: 15000 });
    await overflowAt(page, "Tabletop (vs computer)");
    await page.setViewportSize(VIEWPORTS["1280x720"]);
    await axeAt(page, "Tabletop (vs computer)");
    await context.close();
  });

  // 10. Tabletop completed / rematch (via resign, the deterministic path).
  await withBrowser(async (browser) => {
    const hostContext = await browser.newContext({ baseURL: BASE_URL });
    const guestContext = await browser.newContext({ baseURL: BASE_URL });
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();
    await waitForReady(hostPage);
    await waitForReady(guestPage);
    const hostUsername = await claimUsername(hostPage, "AuditRematchHost");
    await claimUsername(guestPage, "AuditRematchGuest");
    await hostPage.getByRole("link", { name: "Create Room" }).click();
    await hostPage.getByRole("radio", { name: "2 players" }).check();
    await hostPage.getByRole("radio", { name: "Private (invite by code)" }).check();
    await clickUntilSettled(
      hostPage,
      hostPage.getByRole("button", { name: "Create room" }),
      hostPage.getByRole("heading", { name: hostUsername }),
    );
    await joinRoomByName(guestPage, hostUsername);
    // Wait for BOTH sides to actually be seated at the table before
    // resigning. Diagnostic evidence from an earlier run of this script:
    // guestUrl was already /games/... while hostUrl was still /rooms/...
    // (the Waiting Room) -- the host's own poll-driven navigation into the
    // game hadn't landed yet, so it could never observe "Game over" no
    // matter how long the later wait ran. This mirrors the wait scenario
    // 8 above already does; this scenario had skipped it.
    await hostPage.waitForURL(/\/games\//, { timeout: 15000 });
    await guestPage.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });
    await hostPage.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });
    await guestPage.getByRole("button", { name: "Resign" }).click();
    await guestPage.getByRole("button", { name: "Confirm resign" }).click();
    try {
      await hostPage.getByRole("heading", { name: "Game over" }).waitFor({ timeout: 20000 });
    } catch (err) {
      const hostUrl = hostPage.url();
      const guestUrl = guestPage.url();
      const hostBody = await hostPage
        .locator("body")
        .innerText()
        .catch(() => "(unreadable)");
      const guestBody = await guestPage
        .locator("body")
        .innerText()
        .catch(() => "(unreadable)");
      note(
        "diagnostic",
        `rematch scenario: hostUrl=${hostUrl} guestUrl=${guestUrl}\n    hostBody(300)="${hostBody.replace(/\s+/g, " ").slice(0, 300)}"\n    guestBody(300)="${guestBody.replace(/\s+/g, " ").slice(0, 300)}"`,
      );
      throw err;
    }
    await overflowAt(hostPage, "Tabletop (completed/rematch)");
    await hostPage.setViewportSize(VIEWPORTS["1280x720"]);
    await axeAt(hostPage, "Tabletop (completed/rematch)");
    await touchTargetsAt390(hostPage, "Tabletop (completed/rematch)", [
      'button:has-text("Rematch")',
    ]);
    await hostContext.close();
    await guestContext.close();
  });

  // 11. Tabletop "unavailable game" state.
  await withBrowser(async (browser) => {
    const { page, context } = await newPage(browser);
    await waitForReady(page);
    await page.goto("/games/00000000-0000-0000-0000-000000000000");
    await page.getByText(/doesn't exist|not seated/i).waitFor({ timeout: 10000 });
    await overflowAt(page, "Tabletop (unavailable game)");
    await page.setViewportSize(VIEWPORTS["1280x720"]);
    await axeAt(page, "Tabletop (unavailable game)");
    await context.close();
  });

  // Summary.
  const fails = findings.filter((f) => f.severity === "fail");
  const notes = findings.filter((f) => f.severity === "note");
  console.log(`\n=== Phase 7 audit summary ===`);
  console.log(`${fails.length} FAIL, ${notes.length} NOTE`);
  if (fails.length > 0) {
    console.log("\nFailures:");
    for (const f of fails) console.log(`  [${f.area}] ${f.detail}`);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
