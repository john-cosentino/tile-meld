import { expect, type Browser, type Locator, type Page } from "@playwright/test";

/** Retries `attempt` (a navigation, reload, or click that may land on the
 * app's own transient-rate-limit UI) until `target` becomes visible.
 * Several of this app's endpoints -- identity creation, session recovery
 * (the tightest: 5 req/min, see apps/server/src/http/rateLimits.ts,
 * deliberately strict as recovery-secret brute-force protection) -- are
 * real per-IP token buckets (an intentional anti-abuse decision, not
 * something this suite should weaken -- see e2e/playwright.config.ts), and
 * tests that spin up several browser contexts or reload/recover in quick
 * succession can, cumulatively across a run, burst past them even with the
 * whole suite serialized to one worker. Both RootLayout's full-page error
 * view and RecoveryPage's own inline error banner render the exact same
 * "Rate limit exceeded, retry in N seconds" text for this; this waits out
 * the indicated backoff and repeats `attempt`, mirroring what a real user
 * clicking the app's own "Retry" affordance would do, instead of treating a
 * transient 429 as a broken test. */
async function retryOnRateLimit(
  page: Page,
  attempt: () => Promise<unknown>,
  target: Locator,
): Promise<void> {
  const rateLimited = page.getByText(/Rate limit exceeded, retry in (\d+) second/);
  for (let i = 0; i < 6; i++) {
    await attempt();
    // 30s (not the usual 15s) because some targets sit behind a page that
    // polls the server itself (e.g. WaitingRoomPage, every 3s) and quietly
    // swallows anything but a 404 while retrying -- under the same
    // cumulative rate-limit pressure this whole function exists for, that
    // self-healing poll needs several cycles' worth of headroom, not just
    // one, with no inline "Rate limit exceeded" banner of its own to detect.
    await expect(target.or(rateLimited)).toBeVisible({ timeout: 30000 });
    if (await target.isVisible()) return;

    const text = (await rateLimited.textContent()) ?? "";
    const seconds = Number(/retry in (\d+) second/.exec(text)?.[1] ?? "5");
    await page.waitForTimeout((seconds + 1) * 1000);
  }
  await expect(target).toBeVisible({ timeout: 30000 });
}

/** Navigates to "/" and waits for the identity bootstrap to complete,
 * tolerating a transient rate limit (see retryOnRateLimit). */
export async function waitForReady(page: Page): Promise<void> {
  await retryOnRateLimit(
    page,
    () => page.goto("/"),
    page.getByRole("heading", { name: "Your games" }),
  );
}

/** Reloads `page` and waits for `target`, tolerating a transient rate
 * limit (see retryOnRateLimit) -- e.g. a mid-game reload re-runs the
 * identity bootstrap (session recovery) against the same tight token
 * bucket used by RecoveryPage's explicit recovery form. */
export async function reloadUntilReady(page: Page, target: Locator): Promise<void> {
  await retryOnRateLimit(page, () => page.reload(), target);
}

/** Clicks `submit`, tolerating a transient rate limit (see
 * retryOnRateLimit) -- e.g. RecoveryPage's "Recover session" button hits
 * the recovery endpoint's especially tight 5 req/min bucket directly. */
export async function clickUntilSettled(
  page: Page,
  submit: Locator,
  target: Locator,
): Promise<void> {
  await retryOnRateLimit(page, () => submit.click(), target);
}

/** Gets two pages seated in a fresh, started 2-player game and returns
 * both, plus which one is currently active, which is the room host (only
 * the host can start a rematch), and the roomId -- once a room has a
 * latestGameId, HomePage's per-room link always prefers `/games/:id` over
 * `/rooms/:id` (even after that game ends, so players can review the
 * finished table), so navigating back to the *waiting* room after a game
 * needs this id directly, not a click through Home. Shared setup for every
 * test that needs a live 2-player game rather than just the lobby/waiting-
 * room flow. */
export async function startTwoPlayerGame(browser: Browser): Promise<{
  activePage: Page;
  waitingPage: Page;
  hostPage: Page;
  guestPage: Page;
  roomId: string;
}> {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  await waitForReady(hostPage);
  await waitForReady(guestPage);

  await hostPage.getByRole("link", { name: "Create Room" }).click();
  await hostPage.getByLabel("Your display name").fill("Host");
  await hostPage.getByRole("radio", { name: "2 players" }).check();
  await hostPage.getByRole("radio", { name: "Private (invite by code)" }).check();
  const hostHeading = hostPage.getByRole("heading", { name: /^Room / });
  await clickUntilSettled(
    hostPage,
    hostPage.getByRole("button", { name: "Create room" }),
    hostHeading,
  );
  const code = (await hostHeading.textContent())!.replace("Room ", "").trim();
  const roomId = /\/rooms\/([^/?#]+)/.exec(hostPage.url())?.[1];
  if (!roomId) throw new Error("startTwoPlayerGame: could not parse roomId from URL after create");

  await guestPage.getByRole("navigation").getByRole("link", { name: "Join by Code" }).click();
  await guestPage.getByLabel("Room code").fill(code);
  await guestPage.getByLabel("Your display name").fill("Guest");
  await clickUntilSettled(
    guestPage,
    guestPage.getByRole("button", { name: "Join room" }),
    guestPage.getByRole("heading", { name: `Room ${code}` }),
  );

  await hostPage.getByRole("button", { name: "Mark ready" }).click();
  await guestPage.getByRole("button", { name: "Mark ready" }).click();
  await hostPage.getByRole("button", { name: /Start game/ }).click();

  await expect(hostPage).toHaveURL(/\/games\//, { timeout: 15000 });
  await expect(guestPage).toHaveURL(/\/games\//, { timeout: 15000 });
  await expect(hostPage.getByRole("heading", { name: "Your rack (14)" })).toBeVisible({
    timeout: 15000,
  });
  await expect(guestPage.getByRole("heading", { name: "Your rack (14)" })).toBeVisible({
    timeout: 15000,
  });

  const hostIsActive = await hostPage.getByText("Your turn", { exact: true }).isVisible();
  return hostIsActive
    ? { activePage: hostPage, waitingPage: guestPage, hostPage, guestPage, roomId }
    : { activePage: guestPage, waitingPage: hostPage, hostPage, guestPage, roomId };
}

/** Gets `capacity` pages (3 or 4) seated in a fresh, started private game,
 * named "P1".."Pn" in join order (P1 is the host). Returns all pages plus
 * the one currently active. Generalizes startTwoPlayerGame for room sizes
 * beyond 2, since RACK_SIZE (apps/server/src/db/repositories/games.ts) is
 * fixed at 14 regardless of player count. */
export async function startNPlayerGame(
  browser: Browser,
  capacity: 3 | 4,
): Promise<{ pages: Page[]; activePage: Page }> {
  const contexts = await Promise.all(Array.from({ length: capacity }, () => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  await Promise.all(pages.map((p) => waitForReady(p)));

  const hostPage = pages[0]!;
  const guestPages = pages.slice(1);

  await hostPage.getByRole("link", { name: "Create Room" }).click();
  await hostPage.getByLabel("Your display name").fill("P1");
  await hostPage.getByRole("radio", { name: `${capacity} players` }).check();
  await hostPage.getByRole("radio", { name: "Private (invite by code)" }).check();
  const hostHeading = hostPage.getByRole("heading", { name: /^Room / });
  await clickUntilSettled(
    hostPage,
    hostPage.getByRole("button", { name: "Create room" }),
    hostHeading,
  );
  const code = (await hostHeading.textContent())!.replace("Room ", "").trim();

  for (const [index, guestPage] of guestPages.entries()) {
    await guestPage.getByRole("navigation").getByRole("link", { name: "Join by Code" }).click();
    await guestPage.getByLabel("Room code").fill(code);
    await guestPage.getByLabel("Your display name").fill(`P${index + 2}`);
    await clickUntilSettled(
      guestPage,
      guestPage.getByRole("button", { name: "Join room" }),
      guestPage.getByRole("heading", { name: `Room ${code}` }),
    );
  }

  for (const page of pages) {
    await page.getByRole("button", { name: "Mark ready" }).click();
  }
  await hostPage.getByRole("button", { name: /Start game/ }).click();

  for (const page of pages) {
    await expect(page).toHaveURL(/\/games\//, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Your rack (14)" })).toBeVisible({
      timeout: 15000,
    });
  }

  for (const page of pages) {
    if (await page.getByText("Your turn", { exact: true }).isVisible()) {
      return { pages, activePage: page };
    }
  }
  throw new Error("startNPlayerGame: no page shows 'Your turn' after start");
}

/** Drags the element at `source`'s center onto `target`'s center via a real
 * multi-step mouse sequence (not a single jump), so dnd-kit's PointerSensor
 * -- which requires >8px of pointer movement before it will treat a
 * pointerdown as a drag rather than a click (see
 * apps/web/src/pages/TabletopPage.tsx) -- actually activates. */
export async function dragTo(
  page: Page,
  source: import("@playwright/test").Locator,
  target: import("@playwright/test").Locator,
): Promise<void> {
  // mouse.move/down/up, unlike .click(), never auto-scrolls -- coordinates
  // outside the current viewport silently hit no element at all (dnd-kit's
  // pointerdown listener then never fires), so both ends of the drag must
  // be scrolled into view first.
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  await target.scrollIntoViewIfNeeded();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("dragTo: source or target has no bounding box (not visible/attached)");
  }

  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Intermediate moves, each well past the 8px activation distance, give
  // dnd-kit's PointerSensor real pointermove events to activate the drag
  // and track the dragged item before the final drop.
  await page.mouse.move(startX + 20, startY + 20, { steps: 5 });
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
}
