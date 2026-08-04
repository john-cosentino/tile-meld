import { test, expect, type Page } from "@playwright/test";
import { registerAccount, clickUntilSettled } from "./helpers.js";

// Phase 7 §13.2 "Phone portrait 390×844: zero horizontal overflow
// (e2e-enforced)" -- automated across every pre-game/identity route in one
// place. Tabletop's own 390px overflow check already exists
// (tabletopMobile.spec.ts, which also covers chat/axe/region reachability
// at that width) and isn't duplicated here. vs-computer.spec.ts's 320px
// long-username check is also kept as-is, not folded into this file.

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.locator("html").evaluate((el) => el.scrollWidth > el.clientWidth);
}

test.describe("390px mobile viewport: no horizontal overflow", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("Home", async ({ page }) => {
    await registerAccount(page, "MobHome");
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });

  test("Public Lobby", async ({ page }) => {
    await registerAccount(page, "MobLobby");
    await page.getByRole("navigation").getByRole("link", { name: "Public Lobby" }).click();
    await expect(page.getByRole("heading", { name: "Public lobby" })).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });

  test("Create Room", async ({ page }) => {
    await registerAccount(page, "MobCreate");
    await page.getByRole("link", { name: "New Game" }).click();
    await expect(page.getByRole("heading", { name: "Create a room" })).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });

  test("Login and Account", async ({ page }) => {
    // Pre-auth: the login gate itself must fit a phone.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
    // Post-auth: the account page (portrait picker grid) must fit too.
    await registerAccount(page, "MobAcct");
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });

  test("Waiting Room with a portrait", async ({ page }) => {
    const username = await registerAccount(page, "MobileOverflowWait");
    await page.getByRole("link", { name: "New Game" }).click();
    await page.getByRole("radio", { name: "2 players" }).check();
    await page.getByRole("radio", { name: "Private (invite by code)" }).check();
    await clickUntilSettled(
      page,
      page.getByRole("button", { name: "Create room" }),
      page.getByRole("heading", { name: username }),
    );
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });
});
