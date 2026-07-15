import { test, expect } from "@playwright/test";
import { startTwoPlayerGame, clickUntilSettled } from "./helpers.js";

// Exercises the complete room/game state machine end to end with a
// deterministic shortened fixture -- resign (rather than actually playing
// a game to a natural conclusion, which the random deal makes
// unscriptable) to reach game:over, back to the waiting room, ready up,
// rematch, and a fresh game with its own chat, proving the room survives
// and correctly resets across multiple games rather than being a
// one-shot object.
test("full lifecycle: resign ends the game, both players return to the room, ready up, and a rematch starts a fresh game", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const { hostPage, guestPage, roomId } = await startTwoPlayerGame(browser);

  const firstGameId = /\/games\/([^/?#]+)/.exec(hostPage.url())?.[1];
  expect(firstGameId).toBeTruthy();

  const oldMessage = `first game message ${Date.now()}`;
  await hostPage.getByPlaceholder("Say something…").fill(oldMessage);
  await hostPage.getByRole("button", { name: "Send" }).click();
  await expect(guestPage.getByText(oldMessage)).toBeVisible({ timeout: 10000 });

  // Resigning doesn't require it to be your turn -- exercised from the
  // guest seat specifically to prove that.
  await guestPage.getByRole("button", { name: "Resign" }).click();
  await guestPage.getByRole("button", { name: "Confirm resign" }).click();

  await expect(guestPage.getByRole("heading", { name: "Game over" })).toBeVisible({
    timeout: 10000,
  });
  await expect(hostPage.getByRole("heading", { name: "Game over" })).toBeVisible({
    timeout: 10000,
  });

  // Both players return to the room, which is now between games rather
  // than gone. Navigated to directly by roomId rather than through Home:
  // once a room has a latestGameId, HomePage's per-room link always
  // prefers `/games/:id` over `/rooms/:id` -- even after that game ends,
  // so a player can review the just-finished table -- so clicking through
  // Home here would just land back on this same "Game over" screen.
  await hostPage.goto(`/rooms/${roomId}`);
  await guestPage.goto(`/rooms/${roomId}`);
  await expect(
    hostPage.getByText(
      "The last game finished. Ready up for a rematch when you're ready to play again.",
    ),
  ).toBeVisible({ timeout: 10000 });

  await hostPage.getByRole("button", { name: "Mark ready" }).click();
  await guestPage.getByRole("button", { name: "Mark ready" }).click();
  const rematchButton = hostPage.getByRole("button", { name: /Start rematch/ });
  await expect(rematchButton).toBeEnabled();
  await clickUntilSettled(
    hostPage,
    rematchButton,
    hostPage.getByRole("heading", { name: "Your rack (14)" }),
  );

  await expect(guestPage.getByRole("heading", { name: "Your rack (14)" })).toBeVisible({
    timeout: 15000,
  });
  const secondGameId = /\/games\/([^/?#]+)/.exec(hostPage.url())?.[1];
  expect(secondGameId).toBeTruthy();
  expect(secondGameId).not.toBe(firstGameId);

  // A fresh game means fresh chat -- the old message doesn't carry over,
  // even though it's the same room and the same two players.
  await expect(hostPage.getByText(oldMessage)).toHaveCount(0);
  await expect(guestPage.getByText(oldMessage)).toHaveCount(0);

  const newMessage = `second game message ${Date.now()}`;
  await guestPage.getByPlaceholder("Say something…").fill(newMessage);
  await guestPage.getByRole("button", { name: "Send" }).click();
  await expect(hostPage.getByText(newMessage)).toBeVisible({ timeout: 10000 });
});
