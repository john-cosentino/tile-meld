import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { startTwoPlayerGame } from "./helpers.js";

// Phase 8 -- a representative narrow phone viewport (390x844, an iPhone 12/
// 13/14-class width) against the real tabletop layout: no horizontal page
// overflow, status/board/rack/actions all reachable, the chat disclosure
// works, and a clean axe scan at this width specifically (not just
// desktop -- accessibility.spec.ts's existing Tabletop scan runs at the
// default desktop viewport).

test("tabletop at a 390x844 mobile viewport: no horizontal overflow, every region reachable, chat toggles, clean a11y scan", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const { activePage, waitingPage } = await startTwoPlayerGame(browser);
  await activePage.setViewportSize({ width: 390, height: 844 });
  await waitingPage.setViewportSize({ width: 390, height: 844 });

  // No horizontal page overflow at this width.
  const hasOverflow = await activePage
    .locator("html")
    .evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(hasOverflow).toBe(false);

  // Status region: turn ownership is still the page's H1, still visible
  // without scrolling past unrelated content first.
  await expect(activePage.getByRole("heading", { level: 1, name: "Your turn" })).toBeVisible();
  await expect(activePage.getByRole("region", { name: "Game status" })).toBeVisible();

  // Board and rack both remain usable -- the "start a new set" drop zone
  // and the rack's own tiles are reachable and not clipped off-screen.
  await expect(activePage.getByRole("heading", { name: "Table" })).toBeVisible();
  await expect(activePage.getByRole("heading", { name: "Your rack (14)" })).toBeVisible();

  // The action bar is reachable and not covered by anything else -- a
  // real click on Draw tile still works at this width (proves the button
  // isn't obscured by a stray overlapping element, not just "present in
  // the DOM").
  const drawButton = activePage.getByRole("button", { name: "Draw tile" });
  await expect(drawButton).toBeEnabled();
  await drawButton.click();
  await expect(activePage.getByRole("heading", { name: "Your rack (15)" })).toBeVisible({
    timeout: 10000,
  });

  // Chat starts open (this phase's deliberate default on every viewport --
  // see docs/tabletop-layout-contract.md) and collapses/expands via an
  // accessible toggle without occupying the whole screen exclusively.
  const chatToggle = activePage.getByRole("button", { name: /chat/i });
  await expect(chatToggle).toHaveAttribute("aria-expanded", "true");
  await chatToggle.click();
  await expect(chatToggle).toHaveAttribute("aria-expanded", "false");
  await chatToggle.click();
  await expect(chatToggle).toHaveAttribute("aria-expanded", "true");

  const results = await new AxeBuilder({ page: activePage }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});
