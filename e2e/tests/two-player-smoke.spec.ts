import { test, expect } from "@playwright/test";
import { startTwoPlayerGame } from "./helpers.js";

// The Phase 6 smoke test docs/opus-implementation-plan.md promises: 2
// isolated browser contexts as separate players, a private room, and one
// committed turn. "Draw tile" is the committed turn here rather than a
// constructed valid meld -- the server deals real, randomly-shuffled racks
// (no seeding hook exposed to the browser), so scripting a guaranteed-legal
// initial meld from an unknown hand would make this test either flaky or
// fragile. Draw is a legal turn for whichever seat is active, always, and
// exercises the exact same round trip (browser -> Socket.IO -> engine ->
// Postgres -> broadcast -> both browsers) that a commit would. Real commit
// validity, including the invalid-commit penalty, is covered by
// invalid-commit-penalty.spec.ts, apps/server's integration tests (Phase 5),
// and this phase's hintEngine unit tests.

test("two-player smoke: private room, ready up, start, one committed turn", async ({ browser }) => {
  const { activePage, waitingPage } = await startTwoPlayerGame(browser);

  await expect(activePage.getByText("Your turn", { exact: true })).toBeVisible();
  await expect(waitingPage.getByText(/Waiting on seat/)).toBeVisible();

  const drawButton = activePage.getByRole("button", { name: "Draw tile" });
  await expect(drawButton).toBeEnabled();
  await drawButton.click();

  // Round trip complete: the active seat's own rack grew by one, the turn
  // handed off, and the *other* browser -- which never saw the drawn
  // tile's identity, only the count -- observes the same handoff.
  await expect(activePage.getByRole("heading", { name: "Your rack (15)" })).toBeVisible({
    timeout: 10000,
  });
  await expect(waitingPage.getByText("Your turn", { exact: true })).toBeVisible({ timeout: 10000 });
});

test("click/tap tile selection and move -- the keyboard/tap-accessible alternative to drag-and-drop", async ({
  browser,
}) => {
  const { activePage } = await startTwoPlayerGame(browser);

  const firstTile = activePage.locator(".tile").first();
  await expect(firstTile).toHaveAttribute("aria-pressed", "false");
  await firstTile.click();
  await expect(firstTile).toHaveAttribute("aria-pressed", "true");

  const newSetZone = activePage.getByRole("button", { name: /Start a new set/ });
  await newSetZone.click();

  // The tile left the rack (14 -> 13) and landed in a freshly-created
  // table set, all without any pointer movement -- a plain click end to
  // end. Selection also clears after a successful move.
  await expect(activePage.getByRole("heading", { name: "Your rack (13)" })).toBeVisible();
  await expect(activePage.getByText(/^Set 1 --/)).toBeVisible();

  await activePage.getByRole("button", { name: "Undo" }).click();
  await expect(activePage.getByRole("heading", { name: "Your rack (14)" })).toBeVisible();
});

test("real keyboard (Tab + Enter) tile selection and move -- not just a synthetic .click()", async ({
  browser,
}) => {
  // The test above exercises this same flow via Playwright's .click(),
  // which dispatches a pointer event and does NOT prove a keyboard user
  // can do the same thing. Phase 7 finding: dnd-kit's KeyboardSensor
  // claimed Enter/Space as its own drag activator keys and preventDefault()
  // ed them, silently blocking Tile's native <button> click activation for
  // real keyboard input even though the mouse/tap path worked fine --
  // fixed by removing KeyboardSensor (TabletopPage.tsx) since nothing uses
  // its arrow-key-driven drag. This test presses real keys, not .click().
  const { activePage } = await startTwoPlayerGame(browser);

  const firstTile = activePage.locator(".tile").first();
  await firstTile.focus();
  await expect(firstTile).toHaveAttribute("aria-pressed", "false");
  await activePage.keyboard.press("Enter");
  await expect(firstTile).toHaveAttribute("aria-pressed", "true");

  const newSetZone = activePage.getByRole("button", { name: /Start a new set/ });
  await newSetZone.focus();
  await activePage.keyboard.press("Enter");

  await expect(activePage.getByRole("heading", { name: "Your rack (13)" })).toBeVisible();
  await expect(activePage.getByText(/^Set 1 --/)).toBeVisible();
});

test("chat: a message sent from one browser appears in both (game-scoped, live)", async ({
  browser,
}) => {
  const { activePage, waitingPage } = await startTwoPlayerGame(browser);

  await activePage.getByPlaceholder("Say something…").fill("hello from the active player");
  await activePage.getByRole("button", { name: "Send" }).click();

  // The broadcast includes the sender, not just the other browser -- both
  // must see it.
  await expect(activePage.getByText("hello from the active player")).toBeVisible({
    timeout: 10000,
  });
  await expect(waitingPage.getByText("hello from the active player")).toBeVisible({
    timeout: 10000,
  });
});
