import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { waitForReady, startTwoPlayerGame, clickUntilSettled, claimUsername } from "./helpers.js";

// Automated accessibility checks (plan Sec 11.3: "automated accessibility
// checks (axe) where practical") across every screen a player can reach
// without another party's cooperation, plus the two that need a live
// 2-player game (Waiting Room, Tabletop). Only serious/critical violations
// fail the check -- axe's minor/moderate findings are frequently
// stylistic judgment calls (e.g. landmark/heading-order preferences) with
// real false-positive/debatable rates; serious/critical are the ones with
// a concrete, unambiguous barrier to a screen-reader or keyboard user,
// matching this plan's hard requirements (Sec 10.3).
async function assertNoSeriousViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious, `${label}: ${JSON.stringify(serious, null, 2)}`).toEqual([]);
}

test("Home page has no serious/critical accessibility violations", async ({ page }) => {
  await waitForReady(page);
  await assertNoSeriousViolations(page, "Home");
});

test("Create Room page has no serious/critical accessibility violations", async ({ page }) => {
  await waitForReady(page);
  await page.getByRole("link", { name: "Create Room" }).click();
  await expect(page.getByRole("heading", { name: "Create a room" })).toBeVisible();
  await assertNoSeriousViolations(page, "Create Room");
});

test("Join by Code page has no serious/critical accessibility violations", async ({ page }) => {
  await waitForReady(page);
  await page.getByRole("navigation").getByRole("link", { name: "Join by Code" }).click();
  await assertNoSeriousViolations(page, "Join by Code");
});

test("Public Lobby page has no serious/critical accessibility violations", async ({ page }) => {
  await waitForReady(page);
  await page.getByRole("navigation").getByRole("link", { name: "Public Lobby" }).click();
  await expect(page.getByRole("heading", { name: "Public lobby" })).toBeVisible();
  await assertNoSeriousViolations(page, "Public Lobby");
});

test("Recovery page has no serious/critical accessibility violations", async ({ page }) => {
  await waitForReady(page);
  await page.getByRole("navigation").getByRole("link", { name: "Recovery" }).click();
  await expect(page.getByRole("heading", { name: "Recovery", exact: true })).toBeVisible();
  await assertNoSeriousViolations(page, "Recovery");
});

test("Waiting Room page has no serious/critical accessibility violations", async ({ page }) => {
  await waitForReady(page);
  const username = await claimUsername(page, "A11y");
  await page.getByRole("link", { name: "Create Room" }).click();
  await page.getByRole("radio", { name: "2 players" }).check();
  await page.getByRole("radio", { name: "Private (invite by code)" }).check();
  await clickUntilSettled(
    page,
    page.getByRole("button", { name: "Create room" }),
    page.getByRole("heading", { name: username }),
  );
  await assertNoSeriousViolations(page, "Waiting Room");
});

test("Tabletop page has no serious/critical accessibility violations", async ({ browser }) => {
  const { activePage } = await startTwoPlayerGame(browser);
  await assertNoSeriousViolations(activePage, "Tabletop");
});
