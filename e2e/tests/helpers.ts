import { expect, type Browser, type Locator, type Page } from "@playwright/test";

// The waiting room navigates into the game only after its own poll observes
// the room flip to `in_game` (a Socket.IO/DB-driven transition), so entering
// the game is authoritative state to wait for, not something guaranteed within
// a few seconds -- especially when that poll is competing for the shared per-IP
// rate-limit bucket late in a long serial run. 30s gives that transition real
// headroom without masking a genuinely stuck game (the per-test timeout is 90s).
const GAME_ENTRY_TIMEOUT = 30000;

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
    // `attempt` is triggered once here, and again only after an *observed*
    // rate-limit banner + its backoff (below). It is deliberately NOT
    // re-triggered while we are merely waiting: a create/join click has by
    // then navigated the page, so re-clicking would target a vanished button
    // and the actual failure state under load is not a banner at all but a
    // page silently retrying its own data fetch (e.g. WaitingRoomPage's
    // "Loading room…", which swallows anything but a 404 and shows no banner).
    await attempt();

    // 60s ceiling: enough headroom for that self-healing poll to succeed on a
    // later cycle once the shared per-IP bucket refills, rather than assuming
    // it completes in a few seconds. Either the target appears (done) or a
    // rate-limit banner appears (back off and re-attempt); if neither does,
    // fall through to the final assertion, which reports the real state.
    let sawRateLimit = false;
    try {
      await expect(target.or(rateLimited)).toBeVisible({ timeout: 60000 });
      if (await target.isVisible()) return;
      sawRateLimit = true;
    } catch {
      break;
    }
    if (!sawRateLimit) break;

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

  // The host reliably lands on the game once Start succeeds; the game URL is
  // then known. The guest's waiting-room poll normally follows on its own, but
  // under cumulative rate-limit pressure that poll can lag -- so give it a
  // brief window, then send the guest straight to the same game URL. This is
  // test SETUP getting both clients seated, not the behavior under test (the
  // in-app auto-navigation is exercised directly by turn-timeout/reconnect
  // specs); it does not change any production polling or rate limit.
  await expect(hostPage).toHaveURL(/\/games\//, { timeout: GAME_ENTRY_TIMEOUT });
  const gameUrl = hostPage.url();
  try {
    await expect(guestPage).toHaveURL(/\/games\//, { timeout: 10000 });
  } catch {
    await guestPage.goto(gameUrl);
  }

  await expect(hostPage.getByRole("heading", { name: "Your rack (14)" })).toBeVisible({
    timeout: GAME_ENTRY_TIMEOUT,
  });
  await expect(guestPage.getByRole("heading", { name: "Your rack (14)" })).toBeVisible({
    timeout: GAME_ENTRY_TIMEOUT,
  });

  // Both pages are in the game; give the initial game:state a beat to resolve
  // whose turn it is before reading it, so the active/waiting split is based on
  // observed state rather than a race with the first render.
  await expect(
    hostPage
      .getByText("Your turn", { exact: true })
      .or(hostPage.getByText(/Waiting on seat|Computer is playing/)),
  ).toBeVisible({ timeout: GAME_ENTRY_TIMEOUT });
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

  // Same safe setup fallback as startTwoPlayerGame: the host enters the game
  // reliably; each other seat's waiting-room poll normally follows, but if it
  // lags under load, send that page straight to the known game URL.
  await expect(hostPage).toHaveURL(/\/games\//, { timeout: GAME_ENTRY_TIMEOUT });
  const gameUrl = hostPage.url();
  for (const page of guestPages) {
    try {
      await expect(page).toHaveURL(/\/games\//, { timeout: 10000 });
    } catch {
      await page.goto(gameUrl);
    }
  }
  for (const page of pages) {
    await expect(page.getByRole("heading", { name: "Your rack (14)" })).toBeVisible({
      timeout: GAME_ENTRY_TIMEOUT,
    });
  }

  // Wait for the initial game:state to resolve the active seat on at least one
  // page before reading it, rather than racing the first render.
  await expect(pages[0]!.getByText(/Your turn|Waiting on seat/)).toBeVisible({
    timeout: GAME_ENTRY_TIMEOUT,
  });
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
  // Settle the pointer AT the target with a couple more pointermove events
  // before releasing. dnd-kit resolves the drop's `over` droppable from the
  // dragged item's position via rect-intersection collision; a single arrival
  // move can leave `over` resolved to a neighbouring zone (e.g. the "new set"
  // zone just below a short existing set) when the target sits near a
  // boundary. These small in-target moves let collision settle on the droppable
  // actually under the pointer before pointerup commits it.
  await page.mouse.move(endX + 2, endY + 2, { steps: 2 });
  await page.mouse.move(endX, endY, { steps: 2 });
  await page.mouse.up();
  // Move the pointer well off the drop target after releasing. dnd-kit tears
  // down its drag overlay / pointer tracking on pointerup; leaving the mouse
  // parked on the target can keep a transient overlay or hover state over the
  // spot a following interaction needs (the next drag's source, or the Undo
  // button), which otherwise reads as a dropped drag or a swallowed click.
  await page.mouse.move(0, 0);
}
