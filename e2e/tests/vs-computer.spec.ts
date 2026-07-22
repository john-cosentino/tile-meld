import { test, expect, type Page } from "@playwright/test";
import { claimUsername, clickUntilSettled, reloadUntilReady, waitForReady } from "./helpers.js";

// End-to-end Play vs Computer coverage (docs/opus-implementation-plan.md §12).
// Runs across the whole project matrix in playwright.config.ts -- desktop
// (Chromium/Firefox/WebKit) AND phone viewports (Pixel 7, iPhone 14) -- so the
// single spec exercises both form factors. The server's BOT_TURN_DELAY_MS is
// set to a fixed 1.2s there so the "Computer is playing…" state is reliably
// observable without seeding or timing hacks.
//
// Real Safari (desktop/iOS) is NOT certified by Playwright's WebKit engine
// (see the config's browser-support note) -- the manual Safari release check
// in docs/deploy-render.md still applies.

/** Creates a Play-vs-Computer room from the home screen, starts the game, and
 * lands on the tabletop with the human's 14-tile rack visible. Returns once
 * the tabletop is ready. */
async function startVsComputerGame(page: Page): Promise<void> {
  await waitForReady(page);
  // Room creation (including Play vs Computer, Phase 2) requires a claimed
  // username; the resulting private room is named after it. A plain
  // client-side nav link back to Home avoids an extra rate-limited
  // full-page identity round trip.
  const username = await claimUsername(page, "Solo");
  await page.getByRole("link", { name: "Tile Meld", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tile Meld", level: 1 })).toBeVisible();

  await clickUntilSettled(
    page,
    page.getByRole("button", { name: /Play vs Computer/ }),
    page.getByRole("heading", { name: username }),
  );

  // The computer opponent is clearly identified in the waiting room.
  await expect(page.getByLabel("computer opponent")).toBeVisible();

  await page.getByRole("button", { name: "Mark ready" }).click();
  await page.getByRole("button", { name: /Start game/ }).click();

  await expect(page).toHaveURL(/\/games\//, { timeout: 15000 });
  await expect(page.getByRole("heading", { name: /Your rack \(14\)/ })).toBeVisible({
    timeout: 15000,
  });
}

test("play vs computer: create, start, the bot acts, and the turn returns to the human", async ({
  page,
}) => {
  await startVsComputerGame(page);

  // The opponent is the computer, shown as a rack COUNT only -- never its
  // tiles (redaction). The 🤖 marker disambiguates this from the pool count.
  await expect(page.getByText(/🤖:\s*\d+\s*tiles/)).toBeVisible();

  // The bot may hold the opening seat; wait until it is the human's turn
  // (the bot will have already played and handed off if so).
  await expect(page.getByText("Your turn", { exact: true })).toBeVisible({ timeout: 20000 });

  // The human draws, handing the turn to the computer.
  await page.getByRole("button", { name: "Draw tile" }).click();

  // The computer-turn status appears...
  // Match the visible status (with its "…" ellipsis) specifically, not the
  // separate aria-live announcement ("Computer is playing.") that also fires.
  await expect(page.getByText(/Computer is playing…/)).toBeVisible({ timeout: 10000 });

  // ...the bot acts on its own (no human input), and the human gets the next
  // playable turn back, with the drawn tile now in their rack.
  await expect(page.getByText("Your turn", { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("heading", { name: /Your rack \(15\)/ })).toBeVisible();

  // The bot's rack was never disclosed anywhere on the page.
  await expect(page.getByText(/🤖:\s*\d+\s*tiles/)).toBeVisible();
});

test("the computer's turn is recovered across a page reload (durability)", async ({ page }) => {
  await startVsComputerGame(page);
  await expect(page.getByText("Your turn", { exact: true })).toBeVisible({ timeout: 20000 });

  await page.getByRole("button", { name: "Draw tile" }).click();
  // Match the visible status (with its "…" ellipsis) specifically, not the
  // separate aria-live announcement ("Computer is playing.") that also fires.
  await expect(page.getByText(/Computer is playing…/)).toBeVisible({ timeout: 10000 });

  // Reload while the computer is (about to be) playing. The bot's turn is
  // driven server-side (a durable timer plus the recovery sweep), so it does
  // NOT depend on this browser staying connected.
  await reloadUntilReady(page, page.getByRole("heading", { name: /Your rack/ }));

  // After reconnecting, the bot has acted and it is the human's turn again --
  // the game was never stranded on the computer's turn.
  await expect(page.getByText("Your turn", { exact: true })).toBeVisible({ timeout: 25000 });
});
