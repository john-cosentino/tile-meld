import { test, expect } from "@playwright/test";
import {
  startTwoPlayerGame,
  waitForReady,
  reloadUntilReady,
  clickUntilSettled,
} from "./helpers.js";

test("refresh mid-game discards the local draft but keeps server-committed state", async ({
  browser,
}) => {
  const { activePage } = await startTwoPlayerGame(browser);

  const rackTiles = activePage.locator('[aria-label="Your rack"] .tile');
  await rackTiles.first().click();
  await activePage.getByRole("button", { name: /Start a new set/ }).click();
  await expect(activePage.getByRole("heading", { name: "Your rack (13)" })).toBeVisible();
  await expect(activePage.getByText(/^Set 1 --/)).toBeVisible();

  // The draft placement above only ever lived in this tab's local
  // useDraftState -- nothing was committed to the server (no "Commit turn"
  // click), so a reload must restore exactly the last server-canonical
  // state: the full 14-tile rack, no table sets. A reload also re-runs the
  // identity bootstrap (session recovery), which is why this tolerates a
  // transient rate limit like every other cross-reload wait in this suite.
  await reloadUntilReady(activePage, activePage.getByRole("heading", { name: "Your rack (14)" }));
  await expect(activePage.getByText(/^Set 1 --/)).toHaveCount(0);
});

test("recovery: the same identity recovered in a fresh browser context sees the exact same private game state", async ({
  browser,
}) => {
  // retryOnRateLimit (helpers.ts) can wait out several real ~20s backoffs
  // on the recovery endpoint's especially tight bucket -- particularly
  // when this file runs back-to-back with other tests that also reload,
  // as the full CI matrix (all 5 projects against one server) does -- well
  // past the 30s default.
  test.setTimeout(120000);
  const { activePage } = await startTwoPlayerGame(browser);
  const gameUrl = activePage.url();
  const originalRack = await activePage
    .locator('[aria-label="Your rack"] .tile')
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")).sort());

  // The recovery secret is httpOnly-cookie-adjacent but not itself
  // server-secret from the client's point of view -- it's exactly what
  // RecoveryPage would display and what a real player would copy to a
  // second device. Reading it straight out of localStorage is equivalent
  // to that copy/paste without depending on whether the one-time "save
  // your recovery code" banner is still showing in this tab.
  const stored = await activePage.evaluate(() => localStorage.getItem("tilemeld.identity"));
  expect(stored).toBeTruthy();
  const { playerId, recoverySecret } = JSON.parse(stored!) as {
    playerId: string;
    recoverySecret: string;
  };

  const recoveredContext = await browser.newContext();
  const recoveredPage = await recoveredContext.newPage();
  await waitForReady(recoveredPage);

  await recoveredPage.getByRole("navigation").getByRole("link", { name: "Recovery" }).click();
  await recoveredPage.getByLabel("Player ID").fill(playerId);
  await recoveredPage.getByLabel("Recovery secret").fill(recoverySecret);

  // onRecoverSubmit navigates home and reloads on success -- this fresh
  // context is then authenticated as the original player. The recovery
  // endpoint has the tightest rate limit in the app (5 req/min,
  // deliberately, as recovery-secret brute-force protection), so this
  // tolerates a transient 429 the same way reloadUntilReady does.
  await clickUntilSettled(
    recoveredPage,
    recoveredPage.getByRole("button", { name: "Recover session" }),
    recoveredPage.getByRole("heading", { name: "Your games" }),
  );

  await recoveredPage.goto(gameUrl);
  await expect(recoveredPage.getByRole("heading", { name: /Your rack \(\d+\)/ })).toBeVisible({
    timeout: 15000,
  });
  const recoveredRack = await recoveredPage
    .locator('[aria-label="Your rack"] .tile')
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")).sort());

  // Not merely "some session was accepted" -- the exact same multiset of
  // tiles the original tab held, proving this is the same player's
  // server-authoritative rack, not a fresh/different one.
  expect(recoveredRack).toEqual(originalRack);
});
