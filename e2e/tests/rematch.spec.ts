import { test, expect } from "@playwright/test";
import { startTwoPlayerGame, claimUsername, clickUntilSettled, waitForReady } from "./helpers.js";

// Phase 5 -- one-click rematch, exercised directly from the completed-game
// (Game Over) screen rather than by navigating back to the Waiting Room
// (that older path is still covered by full-lifecycle.spec.ts). Resigning
// (rather than actually playing a game to a natural conclusion, which the
// random deal makes unscriptable) is the deterministic way to reach
// game:over in these specs -- which also means neither seat has drawn or
// committed anything, so BOTH the just-completed game and the fresh
// rematch show a 14-tile rack: asserting on "Your rack (14)" alone can't
// tell the two apart. Every wait below is anchored on the extracted gameId
// changing (or the "Game over" heading disappearing) instead.

function gameIdOf(url: string): string | undefined {
  return /\/games\/([^/?#]+)/.exec(url)?.[1];
}

test("human vs human: host starts a one-click rematch from Game Over; the non-host is carried along automatically", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const { hostPage, guestPage } = await startTwoPlayerGame(browser);
  const firstGameId = gameIdOf(hostPage.url());
  expect(firstGameId).toBeTruthy();

  // Resigning doesn't require it to be your turn or being the host.
  await guestPage.getByRole("button", { name: "Resign" }).click();
  await guestPage.getByRole("button", { name: "Confirm resign" }).click();

  await expect(hostPage.getByRole("heading", { name: "Game over" })).toBeVisible({
    timeout: 10000,
  });
  await expect(guestPage.getByRole("heading", { name: "Game over" })).toBeVisible({
    timeout: 10000,
  });

  // The host sees a live Rematch control right here on the Game Over card --
  // no navigating back to the Waiting Room, no readying up first. The
  // non-host sees only the waiting message, never an active Rematch button.
  const rematchButton = hostPage.getByRole("button", { name: "Rematch" });
  await expect(rematchButton).toBeEnabled();
  await expect(guestPage.getByText("Waiting for the host to start a rematch.")).toBeVisible();
  await expect(guestPage.getByRole("button", { name: "Rematch" })).toHaveCount(0);

  await rematchButton.click();
  await expect.poll(() => gameIdOf(hostPage.url()), { timeout: 15000 }).not.toBe(firstGameId);
  const secondGameId = gameIdOf(hostPage.url());
  expect(secondGameId).toBeTruthy();
  await expect(hostPage.getByRole("heading", { name: "Game over" })).toHaveCount(0);
  await expect(hostPage.getByRole("heading", { name: "Your rack (14)" })).toBeVisible({
    timeout: 15000,
  });

  // The non-host is carried into the SAME new game automatically -- no
  // click, no reload -- via the Game Over screen's room-status poll.
  await expect.poll(() => gameIdOf(guestPage.url()), { timeout: 15000 }).toBe(secondGameId);
  await expect(guestPage.getByRole("heading", { name: "Game over" })).toHaveCount(0);
  await expect(guestPage.getByRole("heading", { name: "Your rack (14)" })).toBeVisible({
    timeout: 15000,
  });
});

test("play vs computer: one-click rematch from Game Over reseats the human and the bot immediately", async ({
  page,
}) => {
  test.setTimeout(60000);
  await waitForReady(page);
  const username = await claimUsername(page, "SoloRematch");
  await page.getByRole("link", { name: "Tile Meld", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your games" })).toBeVisible();

  await clickUntilSettled(
    page,
    page.getByRole("button", { name: /Play vs Computer/ }),
    page.getByRole("heading", { name: username }),
  );
  await page.getByRole("button", { name: "Mark ready" }).click();
  await page.getByRole("button", { name: /Start game/ }).click();
  await expect(page).toHaveURL(/\/games\//, { timeout: 15000 });
  await expect(page.getByRole("heading", { name: /Your rack \(14\)/ })).toBeVisible({
    timeout: 15000,
  });
  const firstGameId = gameIdOf(page.url());
  expect(firstGameId).toBeTruthy();

  // The lone human resigns to reach game:over deterministically -- no
  // second human is needed for a one-click rematch here.
  await page.getByRole("button", { name: "Resign" }).click();
  await page.getByRole("button", { name: "Confirm resign" }).click();
  await expect(page.getByRole("heading", { name: "Game over" })).toBeVisible({ timeout: 10000 });

  const rematchButton = page.getByRole("button", { name: "Rematch" });
  await expect(rematchButton).toBeEnabled();
  await rematchButton.click();

  await expect.poll(() => gameIdOf(page.url()), { timeout: 15000 }).not.toBe(firstGameId);
  await expect(page.getByRole("heading", { name: "Game over" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your rack (14)" })).toBeVisible({
    timeout: 15000,
  });
  // The bot seat is present again, immediately, without the human marking
  // ready or waiting on anyone.
  await expect(page.getByText(/🤖:\s*\d+\s*tiles/)).toBeVisible();
});
