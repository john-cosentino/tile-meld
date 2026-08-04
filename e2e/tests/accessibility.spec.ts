import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { startTwoPlayerGame, clickUntilSettled, registerAccount } from "./helpers.js";

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
  await registerAccount(page, "A11yHome");
  await assertNoSeriousViolations(page, "Home");
});

test("Create Room page has no serious/critical accessibility violations", async ({ page }) => {
  await registerAccount(page, "A11yCreate");
  await page.getByRole("link", { name: "New Game" }).click();
  await expect(page.getByRole("heading", { name: "Create a room" })).toBeVisible();
  await assertNoSeriousViolations(page, "Create Room");
});

test("Join Room by Name page has no serious/critical accessibility violations", async ({
  page,
}) => {
  await registerAccount(page, "A11yJoin");
  await page.getByRole("navigation").getByRole("link", { name: "Join Room by Name" }).click();
  await assertNoSeriousViolations(page, "Join Room by Name");
});

test("Public Lobby page has no serious/critical accessibility violations", async ({ page }) => {
  await registerAccount(page, "A11yLobby");
  await page.getByRole("navigation").getByRole("link", { name: "Public Lobby" }).click();
  await expect(page.getByRole("heading", { name: "Public lobby" })).toBeVisible();
  await assertNoSeriousViolations(page, "Public Lobby");
});

test("Login and Register pages have no serious/critical accessibility violations", async ({
  page,
}) => {
  // Pre-auth surfaces (accounts plan, Phase E): an unauthenticated visit
  // lands on /login; the register link reaches the sign-up form.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await assertNoSeriousViolations(page, "Login");
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
  await assertNoSeriousViolations(page, "Register");
});

test("Account page has no serious/critical accessibility violations", async ({ page }) => {
  await registerAccount(page, "A11yAcct");
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await assertNoSeriousViolations(page, "Account");
});

test("Waiting Room page has no serious/critical accessibility violations", async ({ page }) => {
  const username = await registerAccount(page, "A11y");
  await page.getByRole("link", { name: "New Game" }).click();
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

test("skip-to-content link reveals on focus and moves focus to main content on activation", async ({
  page,
}) => {
  await registerAccount(page, "A11ySkip");
  // A real page load (not the registration flow's client-side navigation)
  // so document focus starts at the top -- the skip link must be the very
  // first Tab stop of a freshly loaded page, which is what this verifies.
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main navigation" }).waitFor();

  await page.keyboard.press("Tab");
  const skipLink = page.locator("a.skip-link");
  await expect(skipLink).toBeFocused();
  const box = await skipLink.boundingBox();
  expect(box?.width).toBeGreaterThan(0);
  expect(box?.height).toBeGreaterThan(0);

  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

// Phase 7 §13.2 "Reduced motion: no animation anywhere with the preference
// set (global clamp verified to still apply to any new transitions)" --
// the global.css clamp (`@media (prefers-reduced-motion: reduce)`) forces
// every animation/transition duration to ~0; this asserts that clamp is
// still live against the current stylesheet by sampling real rendered
// elements, not just re-reading the CSS source.
test("prefers-reduced-motion: reduce clamps every transition/animation duration to ~0", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await registerAccount(page, "A11yMotion");
  const durations = await page.evaluate(() => {
    const els = document.querySelectorAll("button, a, .arcade-panel, .skip-link, .tile");
    return Array.from(els).map((el) => {
      const cs = getComputedStyle(el);
      return { transition: cs.transitionDuration, animation: cs.animationDuration };
    });
  });
  expect(durations.length).toBeGreaterThan(0);
  for (const d of durations) {
    expect(parseFloat(d.transition)).toBeLessThanOrEqual(0.001);
    expect(parseFloat(d.animation)).toBeLessThanOrEqual(0.001);
  }
});
