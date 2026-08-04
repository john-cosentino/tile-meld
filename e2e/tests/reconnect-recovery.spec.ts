import { test, expect } from "@playwright/test";
import {
  E2E_PASSWORD,
  startTwoPlayerGame,
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

test("login: the same account signed in from a fresh browser context sees the exact same private game state", async ({
  browser,
}) => {
  // Accounts mode replaced recovery-code portability with plain login
  // (accounts plan, Phase E): signing in on a second device is now
  // username+password. This is the same cross-context identity-resume
  // guarantee the old recovery test proved, exercised through the real
  // login endpoint (10 req/min bucket) instead of the retired recovery
  // form. The legacy recovery/upgrade path itself stays covered by the
  // server and web unit suites -- an accepted e2e gap, documented in
  // docs/task.md.
  test.setTimeout(180000);
  const { activePage, hostPage, hostUsername, guestUsername } = await startTwoPlayerGame(browser);
  const gameUrl = activePage.url();
  const activeUsername = activePage === hostPage ? hostUsername : guestUsername;
  const originalRack = await activePage
    .locator('[aria-label="Your rack"] .tile')
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")).sort());

  const freshContext = await browser.newContext();
  const freshPage = await freshContext.newPage();
  // A fresh context has no session: the app itself lands on the login
  // gate. Signing in with the account's credentials must resume the exact
  // same player.
  await freshPage.goto("/login");
  await freshPage.getByLabel("Username").fill(activeUsername);
  await freshPage.getByLabel("Password").fill(E2E_PASSWORD);
  await clickUntilSettled(
    freshPage,
    freshPage.getByRole("button", { name: "Log in" }),
    freshPage.getByRole("heading", { name: "Meld Masters", level: 1 }),
  );

  await freshPage.goto(gameUrl);
  await expect(freshPage.getByRole("heading", { name: /Your rack \(\d+\)/ })).toBeVisible({
    timeout: 15000,
  });
  const resumedRack = await freshPage
    .locator('[aria-label="Your rack"] .tile')
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")).sort());

  // Not merely "some session was accepted" -- the exact same multiset of
  // tiles the original tab held, proving this is the same player's
  // server-authoritative rack, not a fresh/different one.
  expect(resumedRack).toEqual(originalRack);
});

// Stabilization pass (Phase 3/8): the two tests above cover a full page
// *reload* -- a fresh socket connection from scratch, going straight to
// "connecting". This is the different, previously-untested scenario: the
// page stays mounted and the live WebSocket itself drops and recovers.
// context.setOffline() is real browser-level network control, not a CSS
// class toggle -- Socket.IO genuinely loses its transport and the Manager
// genuinely auto-retries once back online.
test("a live connection drop shows 'Reconnecting…', recovers to 'Connected' once network returns, and never discards the visible game state", async ({
  browser,
  browserName,
}) => {
  // Chromium-only: verified live against both engines. On Chromium,
  // context.setOffline() genuinely severs the already-established
  // WebSocket transport (via CDP network emulation) and the status
  // reliably moves to "Reconnecting…" within the timeout below. On
  // Firefox, the same call blocks new HTTP requests but Playwright's
  // Juggler-protocol implementation does not sever an already-open
  // WebSocket the same way -- confirmed by a real run that stayed
  // "Connected" for the full 60s wait. That's a Playwright/browser-engine
  // network-emulation gap, not a difference in the application's own
  // reconnection logic (browser-engine-agnostic client code, already
  // covered against the mocked socket in useGame.test.tsx for every
  // engine). Manual verification for non-Chromium engines: same steps
  // (start a 2-player game, disable networking in OS/devtools, observe
  // the status text, re-enable) against a real Firefox build outside this
  // suite -- not automated here, per the instruction to document what
  // isn't reliably automatable rather than pretend full coverage.
  test.skip(browserName !== "chromium", "setOffline doesn't sever an open WebSocket on Firefox");

  // context.setOffline(true) blocks the network layer without sending the
  // WebSocket a close frame, so Socket.IO only notices via its own
  // heartbeat (default pingInterval 25s + pingTimeout 20s => up to ~45s
  // worst case) -- realistic for a silent network blackhole (e.g. wifi
  // dropping without a clean FIN/RST), not a test artifact. Generous
  // timeouts throughout to match.
  test.setTimeout(150000);
  const { activePage } = await startTwoPlayerGame(browser);

  const rackHeading = activePage.getByRole("heading", { name: "Your rack (14)" });
  await expect(rackHeading).toBeVisible();
  const status = activePage.locator(".tabletop-status");
  await expect(status).toContainText("Connected");

  await activePage.context().setOffline(true);
  try {
    // The board/rack must still be fully visible while disconnected -- a
    // dropped connection must never blank the screen or discard state.
    await expect(status).toContainText("Reconnecting…", { timeout: 60000 });
    await expect(rackHeading).toBeVisible();
  } finally {
    await activePage.context().setOffline(false);
  }

  await expect(status).toContainText("Connected", { timeout: 30000 });
  await expect(status).not.toContainText("Reconnecting");
  // The exact same server-authoritative rack survived the drop.
  await expect(rackHeading).toBeVisible();
});
