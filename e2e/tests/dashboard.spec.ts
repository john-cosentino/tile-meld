import { test, expect } from "@playwright/test";
import { waitForReady, registerAccount, clickUntilSettled, readRoomCode } from "./helpers.js";

// Phase 6 -- Home dashboard layout and game-status cards. Covers the
// hierarchy/labels/empty-state a brand-new player sees, then drives real
// rooms through Open -> Active -> Completed/Resigned -> Active-again (via
// rematch) and asserts the dashboard card reflects each transition, purely
// by navigating Home and reading what's on screen -- no direct API calls.

test("new user: the login gate, then a fresh account sees the full dashboard with every action enabled", async ({
  page,
}) => {
  // Accounts mode: an unauthenticated visitor never reaches the dashboard
  // -- RequireAuth sends them to /login with a return path.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();

  await registerAccount(page, "DashNew");

  await expect(page.getByRole("heading", { level: 1, name: "Meld Masters" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Create a Game" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Your Games" })).toBeVisible();
  await expect(page.getByText(/no rooms yet/i)).toBeVisible();

  // Registration claims a username, so nothing is gated: every creation
  // action is present and enabled (the legacy claim-a-username prompt is
  // a guest-mode artifact that must not appear here).
  await expect(page.getByRole("button", { name: /play vs computer/i })).toBeEnabled();
  await expect(page.getByText(/claim a username/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "New Game" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Join Room by Name" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse Public Lobby" })).toBeVisible();
});

test("New Game, Join Room by Name, and Browse Public Lobby navigate to their routes", async ({
  page,
}) => {
  await registerAccount(page, "DashNav");

  await waitForReady(page);
  await page.getByRole("link", { name: "New Game" }).click();
  await expect(page.getByRole("heading", { name: "Create a room" })).toBeVisible();

  await waitForReady(page);
  await page.getByRole("link", { name: "Join Room by Name" }).click();
  await expect(page.getByLabel("Room name")).toBeVisible();

  await waitForReady(page);
  await page.getByRole("link", { name: "Browse Public Lobby" }).click();
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
  const hostUsername = await registerAccount(hostPage, "DashOpen");
  await registerAccount(guestPage, "DashOpenGuest");

  // Capacity 3: two members joining leaves it below capacity, so it stays
  // "open" until the host explicitly starts early -- auto-start only fires
  // at exactly-capacity (Phase 4).
  await waitForReady(hostPage);
  await hostPage.getByRole("link", { name: "New Game" }).click();
  await hostPage.getByRole("radio", { name: "3 players" }).check();
  await hostPage.getByRole("radio", { name: "Private (invite by code)" }).check();
  await clickUntilSettled(
    hostPage,
    hostPage.getByRole("button", { name: "Create room" }),
    hostPage.getByRole("heading", { name: hostUsername }),
  );

  await waitForReady(guestPage);
  await guestPage.getByRole("link", { name: "Join Room by Name" }).click();
  await guestPage.getByLabel("Room name").fill(hostUsername);
  await clickUntilSettled(
    guestPage,
    guestPage.getByRole("button", { name: "Join room" }),
    guestPage.getByRole("heading", { name: hostUsername }),
  );

  await waitForReady(hostPage);
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

  await waitForReady(hostPage);
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
  const hostUsername = await registerAccount(hostPage, "DashAuto");
  await registerAccount(guestPage, "DashAutoGuest");

  await waitForReady(hostPage);
  await hostPage.getByRole("link", { name: "New Game" }).click();
  await hostPage.getByRole("radio", { name: "2 players" }).check();
  await hostPage.getByRole("radio", { name: "Private (invite by code)" }).check();
  await clickUntilSettled(
    hostPage,
    hostPage.getByRole("button", { name: "Create room" }),
    hostPage.getByRole("heading", { name: hostUsername }),
  );

  await waitForReady(guestPage);
  await guestPage.getByRole("link", { name: "Join Room by Name" }).click();
  await guestPage.getByLabel("Room name").fill(hostUsername);
  await clickUntilSettled(
    guestPage,
    guestPage.getByRole("button", { name: "Join room" }),
    guestPage
      .getByRole("heading", { name: hostUsername })
      .or(guestPage.getByRole("heading", { name: "Your rack (14)" })),
  );

  await waitForReady(hostPage);
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
  const hostUsername = await registerAccount(hostPage, "DashEnd");
  await registerAccount(guestPage, "DashEndGuest");

  await waitForReady(hostPage);
  await hostPage.getByRole("link", { name: "New Game" }).click();
  await hostPage.getByRole("radio", { name: "2 players" }).check();
  await hostPage.getByRole("radio", { name: "Private (invite by code)" }).check();
  await clickUntilSettled(
    hostPage,
    hostPage.getByRole("button", { name: "Create room" }),
    hostPage.getByRole("heading", { name: hostUsername }),
  );
  const roomCode = await readRoomCode(hostPage);

  await waitForReady(guestPage);
  await guestPage.getByRole("link", { name: "Join Room by Name" }).click();
  await guestPage.getByLabel("Room name").fill(hostUsername);
  await clickUntilSettled(
    guestPage,
    guestPage.getByRole("button", { name: "Join room" }),
    guestPage
      .getByRole("heading", { name: hostUsername })
      .or(guestPage.getByRole("heading", { name: "Your rack (14)" })),
  );
  // The guest's join fills the 2-seat room, so capacity auto-start can
  // navigate the host off the waiting room at any moment now -- the room
  // code line only exists until then. Assert code stability only if the
  // waiting room is still observable; otherwise the game heading below
  // covers the same successful-join fact.
  const hostCodeLine = hostPage.getByText(/^Room code: /);
  const hostRack = hostPage.getByRole("heading", { name: "Your rack (14)" });
  await hostCodeLine.or(hostRack).first().waitFor({ timeout: 15000 });
  if (await hostCodeLine.count()) {
    expect(await readRoomCode(hostPage)).toBe(roomCode);
  }

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

  await waitForReady(guestPage);
  const guestCard = guestPage.getByRole("link", { name: new RegExp(hostUsername) });
  await expect(guestCard).toBeVisible();
  await expect(guestCard).toContainText("Resigned");

  await waitForReady(hostPage);
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
  await registerAccount(page, "DashBot");

  await clickUntilSettled(
    page,
    page.getByRole("button", { name: /play vs computer/i }),
    page.getByRole("button", { name: "Leave room" }),
  );

  await waitForReady(page);
  const card = page.getByRole("link").filter({ hasText: "vs Computer" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Open");
});

test("dashboard fits a narrow mobile viewport without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await registerAccount(page, "DashMobile");

  await expect(page.getByRole("heading", { level: 1, name: "Meld Masters" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New Game" })).toBeVisible();

  const hasOverflow = await page.locator("html").evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(hasOverflow).toBe(false);
});
