import { test, expect } from "@playwright/test";
import { startTwoPlayerGame } from "./helpers.js";

// Exercises the invalid-commit penalty (plan Sec 7.6) through the real UI:
// the client never blocks a Commit -- it only offers hints -- so any
// arrangement can be submitted and the server is the sole judge of
// legality. A single tile in its own set is never a legal run or group
// (both require >= 3 tiles), making it a deterministic way to trigger a
// real rejection regardless of the random deal, the same trick
// two-player-smoke.spec.ts uses "Draw tile" for instead of a constructed
// valid meld. The companion guarantee -- that malformed/stale/duplicate
// submits do NOT cost tiles (plan Sec 7.6, steps 1-4 vs. step 5) -- is
// covered by apps/server's Phase 5 integration tests, which can drive
// version/turnId mismatches directly; reproducing that race through real
// browser timing here would be slow and non-deterministic for no added
// coverage.
test("committing a genuinely invalid arrangement costs a 3-tile penalty and forfeits the turn", async ({
  browser,
}) => {
  const { activePage, waitingPage } = await startTwoPlayerGame(browser);

  const poolText = await activePage.getByText(/^Pool: \d+ tiles$/).textContent();
  const poolCount = Number(/Pool: (\d+) tiles/.exec(poolText ?? "")?.[1]);
  expect(poolCount).toBeGreaterThan(3);

  const rackTiles = activePage.locator('[aria-label="Your rack"] .tile');
  await rackTiles.first().click();
  await activePage.getByRole("button", { name: /Start a new set/ }).click();
  await expect(activePage.getByRole("heading", { name: "Your rack (13)" })).toBeVisible();

  const commitButton = activePage.getByRole("button", { name: "Commit turn" });
  await expect(commitButton).toBeEnabled();
  await commitButton.click();

  await expect(activePage.getByText(/3 penalty tiles were drawn and your turn ended/)).toBeVisible({
    timeout: 10000,
  });

  // The rejected arrangement never touched the server's canonical rack --
  // the draft is discarded and the player ends up with their original 14
  // tiles plus the 3 penalty tiles, not 13 (the draft's leftover count)
  // plus 3, and not the single tile from the invalid set lost.
  await expect(activePage.getByRole("heading", { name: "Your rack (17)" })).toBeVisible({
    timeout: 10000,
  });
  await expect(activePage.getByText(/^Set 1 --/)).toHaveCount(0);

  // The turn forfeits and hands off to the other seat even though nothing
  // legal was played.
  await expect(waitingPage.getByText("Your turn", { exact: true })).toBeVisible({
    timeout: 10000,
  });
  await expect(activePage.getByText(/Waiting on seat/)).toBeVisible();
});
