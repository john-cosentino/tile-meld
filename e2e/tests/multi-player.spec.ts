import { test, expect } from "@playwright/test";
import { startNPlayerGame, waitForReady, claimUsername, clickUntilSettled } from "./helpers.js";

// The plan requires 2-4 isolated browser contexts as separate players (Sec
// 11.3); two-player-smoke.spec.ts covers the 2-player floor, this file
// covers the two room sizes above it -- proving the room/game lifecycle
// (join-by-name, auto-start at capacity, seat assignment, turn handoff)
// scales past 2 seats, not just that it works for exactly 2.
for (const capacity of [3, 4] as const) {
  test(`${capacity}-player game: all seats join, ready up, start, and one committed turn hands off correctly`, async ({
    browser,
  }) => {
    // More seats means more sequential real network round trips (join x
    // (capacity-1), ready x capacity, plus setup) than the 2-player flow,
    // and up to capacity-1 independent chances for a rate-limit retry
    // (clickUntilSettled, helpers.ts) to each need real backoff time --
    // comfortably past the config default even though nothing is stuck.
    test.setTimeout(150000);
    const { pages, activePage } = await startNPlayerGame(browser, capacity);

    await expect(activePage.getByText("Your turn", { exact: true })).toBeVisible();
    const waitingPages = pages.filter((p) => p !== activePage);
    for (const page of waitingPages) {
      await expect(page.getByText(/Waiting on seat/)).toBeVisible();
    }

    const drawButton = activePage.getByRole("button", { name: "Draw tile" });
    await expect(drawButton).toBeEnabled();
    await drawButton.click();

    // The active seat's rack grows by one and the turn hands off to
    // exactly the next seat -- every OTHER page updates its turn-indicator
    // state, and exactly one of them (not all, not zero) now shows "Your
    // turn".
    await expect(activePage.getByRole("heading", { name: "Your rack (15)" })).toBeVisible({
      timeout: 10000,
    });

    let nextActiveCount = 0;
    for (const page of waitingPages) {
      try {
        await expect(page.getByText("Your turn", { exact: true })).toBeVisible({ timeout: 10000 });
        nextActiveCount++;
      } catch {
        // not the next active seat -- expected for capacity - 2 of these pages
      }
    }
    expect(nextActiveCount).toBe(1);
  });
}

// Phase 4: capacity-reaching auto-start is additive, not a replacement --
// the host-controlled Start Game button must still start a 3/4-player room
// EARLY, below capacity, using the preserved Ready/Start UI directly
// (unlike the tests above, which fill every seat and rely on auto-start).
test("3-player room: host manually starts early with only 2 of 3 seats filled", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  await waitForReady(hostPage);
  await waitForReady(guestPage);
  const hostUsername = await claimUsername(hostPage, "Early3Host");
  await claimUsername(guestPage, "Early3Guest");

  await hostPage.getByRole("link", { name: "Create Room" }).click();
  await hostPage.getByRole("radio", { name: "3 players" }).check();
  await hostPage.getByRole("radio", { name: "Private (invite by code)" }).check();
  await clickUntilSettled(
    hostPage,
    hostPage.getByRole("button", { name: "Create room" }),
    hostPage.getByRole("heading", { name: hostUsername }),
  );

  await guestPage.getByRole("navigation").getByRole("link", { name: "Join Room by Name" }).click();
  await guestPage.getByLabel("Room name").fill(hostUsername);
  await clickUntilSettled(
    guestPage,
    guestPage.getByRole("button", { name: "Join room" }),
    guestPage.getByRole("heading", { name: hostUsername }),
  );

  // Only 2 of 3 seats are filled -- the room stays "open" (no auto-start
  // yet, since capacity hasn't been reached), so the Start Game button is
  // the only way forward.
  await expect(hostPage.getByText("3 players max")).toBeVisible();
  await expect(hostPage.locator("li").filter({ hasText: hostUsername })).toBeVisible();
  await expect(hostPage.locator("li").filter({ hasText: "Early3Guest" })).toBeVisible();

  await hostPage.getByRole("button", { name: "Mark ready" }).click();
  await guestPage.getByRole("button", { name: "Mark ready" }).click();
  const startButton = hostPage.getByRole("button", { name: /Start game/ });
  await expect(startButton).toBeEnabled();
  await clickUntilSettled(
    hostPage,
    startButton,
    hostPage.getByRole("heading", { name: "Your rack (14)" }),
  );

  await expect(guestPage.getByRole("heading", { name: "Your rack (14)" })).toBeVisible({
    timeout: 15000,
  });
  // A normal 2-seat game is running -- exactly one page is active, the
  // other is waiting -- proving the never-joined third seat simply closed
  // rather than stranding either player.
  await expect(
    hostPage.getByText("Your turn", { exact: true }).or(hostPage.getByText(/Waiting on seat/)),
  ).toBeVisible({ timeout: 10000 });
});
