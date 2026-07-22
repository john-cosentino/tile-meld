import { test, expect } from "@playwright/test";
import { waitForReady, claimUsername, clickUntilSettled, readRoomCode } from "./helpers.js";

// Phase 6 -- Home dashboard layout and game-status cards. Covers the
// hierarchy/labels/empty-state a brand-new player sees, then drives real
// rooms through Open -> Active -> Completed/Resigned -> Active-again (via
// rematch) and asserts the dashboard card reflects each transition, purely
// by navigating Home and reading what's on screen -- no direct API calls.

test("new user: empty Your Games section, full dashboard hierarchy, and username-gated actions", async ({
  page,
}) => {
  await waitForReady(page);

  await expect(page.getByRole("heading", { level: 1, name: "Tile Meld" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Create a Game" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Your Games" })).toBeVisible();
  await expect(page.getByText(/no rooms yet/i)).toBeVisible();

  // Every creation action is present, with Play vs Computer gated on a
  // claimed username (no username has been claimed yet in this context).
  const playVsComputer = page.getByRole("button", { name: /play vs computer/i });
  await expect(playVsComputer).toBeDisabled();
  await expect(page.getByText(/claim a username/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "New Game" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join Room by Name" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Browse Public Lobby" })).toBeVisible();

  await claimUsername(page, "DashNew");
  await page.getByRole("link", { name: "Tile Meld", exact: true }).click();
  await expect(page.getByRole("button", { name: /play vs computer/i })).toBeEnabled();
});

test("New Game, Join Room by Name, and Browse Public Lobby navigate to their routes", async ({
  page,
}) => {
  await waitForReady(page);
  await claimUsername(page, "DashNav");

  await page.getByRole("link", { name: "Tile Meld", exact: true }).click();
  await page.getByRole("button", { name: "New Game" }).click();
  await expect(page.getByRole("heading", { name: "Create a room" })).toBeVisible();

  await page.getByRole("link", { name: "Tile Meld", exact: true }).click();
  await page.getByRole("button", { name: "Join Room by Name" }).click();
  await expect(page.getByLabel("Room name")).toBeVisible();

  await page.getByRole("link", { name: "Tile Meld", exact: true }).click();
  await page.getByRole("button", { name: "Browse Public Lobby" }).click();
  await expect(page.getByRole("heading", { name: "Public lobby" })).toBeVisible();
});

test("a private room shows Open before it fills, then Active once the host manually starts it early", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();
  await waitForReady(hostPage);
  await waitForReady(guestPage);
  const hostUsername = await claimUsername(hostPage, "DashOpen");
  await claimUsername(guestPage, "DashOpenGuest");

  // Capacity 3: two members joining leaves it below capacity, so it stays
  // "open" until the host explicitly starts early -- auto-start only fires
  // at exactly-capacity (Phase 4).
  await hostPage.getByRole("link", { name: "Tile Meld", exact: true }).click();
  await hostPage.getByRole("button", { name: "New Game" }).click();
  await hostPage.getByRole("radio", { name: "3 players" }).check();
  await hostPage.getByRole("radio", { name: "Private (invite by code)" }).check();
  await clickUntilSettled(
    hostPage,
    hostPage.getByRole("button", { name: "Create room" }),
    hostPage.getByRole("heading", { name: hostUsername }),
  );

  await guestPage.getByRole("link", { name: "Tile Meld", exact: true }).click();
  await guestPage.getByRole("button", { name: "Join Room by Name" }).click();
  await guestPage.getByLabel("Room name").fill(hostUsername);
  await clickUntilSettled(
    guestPage,
    guestPage.getByRole("button", { name: "Join room" }),
    guestPage.getByRole("heading", { name: hostUsername }),
  );

  await hostPage.getByRole("link", { name: "Tile Meld", exact: true }).click();
  const openCard = hostPage.getByRole("link", { name: new RegExp(hostUsername) });
  await expect(openCard).toBeVisible();
  await expect(openCard).toContainText("Open");
  expect(await openCard.evaluate((el) => el.className)).toContain("dashboard-card--neutral");

  await openCard.click();
  await hostPage.getByRole("button", { name: "Mark ready" }).click();
  await guestPage.getByRole("button", { name: "Mark ready" }).click();
  await clickUntilSettled(
    hostPage,
    hostPage.getByRole("button", { name: /Start game/ }),
    hostPage.getByRole("heading", { name: "Your rack (14)" }),
  );

  await hostPage.getByRole("link", { name: "Tile Meld", exact: true }).click();
  const activeCard = hostPage.getByRole("link", { name: new RegExp(hostUsername) });
  await expect(activeCard).toBeVisible();
  await expect(activeCard).toContainText("Active");
  expect(await activeCard.evaluate((el) => el.className)).toContain("dashboard-card--active");
});

test("a 2-player room shows Active on the dashboard immediately after capacity auto-start", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();
  await waitForReady(hostPage);
  await waitForReady(guestPage);
  const hostUsername = await claimUsername(hostPage, "DashAuto");
  await claimUsername(guestPage, "DashAutoGuest");

  await hostPage.getByRole("link", { name: "Tile Meld", exact: true }).click();
  await hostPage.getByRole("button", { name: "New Game" }).click();
  await hostPage.getByRole("radio", { name: "2 players" }).check();
  await hostPage.getByRole("radio", { name: "Private (invite by code)" }).check();
  await clickUntilSettled(
    hostPage,
    hostPage.getByRole("button", { name: "Create room" }),
    hostPage.getByRole("heading", { name: hostUsername }),
  );

  await guestPage.getByRole("link", { name: "Tile Meld", exact: true }).click();
  await guestPage.getByRole("button", { name: "Join Room by Name" }).click();
  await guestPage.getByLabel("Room name").fill(hostUsername);
  await clickUntilSettled(
    guestPage,
    guestPage.getByRole("button", { name: "Join room" }),
    guestPage
      .getByRole("heading", { name: hostUsername })
      .or(guestPage.getByRole("heading", { name: "Your rack (14)" })),
  );

  await hostPage.getByRole("link", { name: "Tile Meld", exact: true }).click();
  const card = hostPage.getByRole("link", { name: new RegExp(hostUsername) });
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card).toContainText("Active");
});

test("Completed vs Resigned: the resigning player sees Resigned, the other sees Completed -- a rematch returns both to Active", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();
  await waitForReady(hostPage);
  await waitForReady(guestPage);
  const hostUsername = await claimUsername(hostPage, "DashEnd");
  await claimUsername(guestPage, "DashEndGuest");

  await hostPage.getByRole("link", { name: "Tile Meld", exact: true }).click();
  await hostPage.getByRole("button", { name: "New Game" }).click();
  await hostPage.getByRole("radio", { name: "2 players" }).check();
  await hostPage.getByRole("radio", { name: "Private (invite by code)" }).check();
  await clickUntilSettled(
    hostPage,
    hostPage.getByRole("button", { name: "Create room" }),
    hostPage.getByRole("heading", { name: hostUsername }),
  );
  const roomCode = await readRoomCode(hostPage);

  await guestPage.getByRole("link", { name: "Tile Meld", exact: true }).click();
  await guestPage.getByRole("button", { name: "Join Room by Name" }).click();
  await guestPage.getByLabel("Room name").fill(hostUsername);
  await clickUntilSettled(
    guestPage,
    guestPage.getByRole("button", { name: "Join room" }),
    guestPage
      .getByRole("heading", { name: hostUsername })
      .or(guestPage.getByRole("heading", { name: "Your rack (14)" })),
  );
  expect(await readRoomCode(hostPage)).toBe(roomCode);

  await expect(hostPage.getByRole("heading", { name: "Your rack (14)" })).toBeVisible({
    timeout: 15000,
  });
  await expect(guestPage.getByRole("heading", { name: "Your rack (14)" })).toBeVisible({
    timeout: 15000,
  });

  // The guest resigns -- ends the 2-player game outright.
  await guestPage.getByRole("button", { name: "Resign" }).click();
  await guestPage.getByRole("button", { name: "Confirm resign" }).click();
  await expect(guestPage.getByRole("heading", { name: "Game over" })).toBeVisible({
    timeout: 10000,
  });
  await expect(hostPage.getByRole("heading", { name: "Game over" })).toBeVisible({
    timeout: 10000,
  });

  await guestPage.getByRole("link", { name: "Tile Meld", exact: true }).click();
  const guestCard = guestPage.getByRole("link", { name: new RegExp(hostUsername) });
  await expect(guestCard).toBeVisible();
  await expect(guestCard).toContainText("Resigned");

  await hostPage.getByRole("link", { name: "Tile Meld", exact: true }).click();
  const hostCard = hostPage.getByRole("link", { name: new RegExp(hostUsername) });
  await expect(hostCard).toBeVisible();
  await expect(hostCard).toContainText("Completed");
  await expect(hostCard).not.toContainText("Resigned");

  // A rematch flips the SAME room's card back to Active for both players.
  await hostCard.click();
  await clickUntilSettled(
    hostPage,
    hostPage.getByRole("button", { name: "Rematch" }),
    hostPage.getByRole("heading", { name: "Your rack (14)" }),
  );
  // A plain nav-link click here can race the just-completed rematch
  // navigation (react-router keeps the same /games/:gameId route element
  // mounted across the gameId change rather than remounting it) --
  // goto("/") sidesteps that entirely with a fresh navigation.
  await hostPage.goto("/");
  await expect(hostPage.getByRole("link", { name: new RegExp(hostUsername) })).toContainText(
    "Active",
  );

  // The guest already navigated away from the completed game to check the
  // dashboard earlier, so Phase 5's completed-game auto-navigation (which
  // only runs while that screen is mounted) never fires for them here --
  // by design, the dashboard itself has no live polling (Phase 6 only
  // added one-shot fetches, per the plan). A reload is exactly what a
  // player checking back on their dashboard later would see.
  await guestPage.reload();
  await expect(guestPage.getByRole("link", { name: new RegExp(hostUsername) })).toContainText(
    "Active",
    { timeout: 15000 },
  );
});

test("a Play vs Computer room shows its computer indicator on the dashboard card", async ({
  page,
}) => {
  test.setTimeout(60000);
  await waitForReady(page);
  await claimUsername(page, "DashBot");
  await page.getByRole("link", { name: "Tile Meld", exact: true }).click();

  await clickUntilSettled(
    page,
    page.getByRole("button", { name: /play vs computer/i }),
    page.getByRole("button", { name: "Leave room" }),
  );

  await page.getByRole("link", { name: "Tile Meld", exact: true }).click();
  const card = page.getByRole("link").filter({ hasText: "vs Computer" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Open");
});

test("dashboard fits a narrow mobile viewport without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForReady(page);

  await expect(page.getByRole("heading", { level: 1, name: "Tile Meld" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New Game" })).toBeVisible();

  const hasOverflow = await page.locator("html").evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(hasOverflow).toBe(false);
});
