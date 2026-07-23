import { expect, type Browser, type Locator, type Page } from "@playwright/test";

// The waiting room navigates into the game only after its own poll observes
// the room flip to `in_game` (a Socket.IO/DB-driven transition), so entering
// the game is authoritative state to wait for, not something guaranteed within
// a few seconds -- especially when that poll is competing for the shared per-IP
// rate-limit bucket late in a long serial run. 30s gives that transition real
// headroom without masking a genuinely stuck game (the per-test timeout is 90s).
const GAME_ENTRY_TIMEOUT = 30000;

/** Builds a short, human-readable dump of `page`'s current state for a
 * failure message: URL, the first visible heading, whether the
 * username-claim prompt is showing (the exact state JoinRoomPage.tsx
 * renders instead of its form when identity bootstrap hasn't resolved a
 * username yet), and a short body-text excerpt. Every `.catch` here
 * exists because this itself only runs while something has ALREADY gone
 * wrong -- it must never throw a second, more confusing error on top of
 * the original failure it's trying to explain. */
async function describePageState(page: Page): Promise<string> {
  const url = page.url();
  const heading = await page
    .getByRole("heading")
    .first()
    .textContent()
    .catch(() => null);
  const usernamePromptVisible = await page
    .getByText(/you need a username/i)
    .isVisible()
    .catch(() => false);
  const bodyExcerpt = (
    await page
      .locator("body")
      .innerText()
      .catch(() => "")
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  return (
    `  URL: ${url}\n` +
    `  Heading: ${heading ?? "(none found)"}\n` +
    `  Username-claim prompt present: ${usernamePromptVisible}\n` +
    `  Body excerpt: "${bodyExcerpt}"`
  );
}

/** Retries `attempt` (a navigation, reload, or click that may land on the
 * app's own transient-rate-limit UI) until `target` becomes visible.
 * Several of this app's endpoints -- identity creation, session recovery
 * (the tightest: 5 req/min, see apps/server/src/http/rateLimits.ts,
 * deliberately strict as recovery-secret brute-force protection) -- are
 * real per-IP token buckets (an intentional anti-abuse decision, not
 * something this suite should weaken -- see e2e/playwright.config.ts). In
 * CI and local runs, E2E_DISABLE_RATE_LIMITS (apps/server/src/env.ts) means
 * this loop's retry branch should never actually trigger against this
 * app's own server -- but this helper is also the thing that would notice
 * if that bypass were ever misconfigured or absent (a stale server
 * process, a manual run against a real deployment), so it stays a real,
 * hardened retry loop rather than a thin wrapper that assumes the bypass
 * is always active. Both RootLayout's full-page error view and
 * RecoveryPage's own inline error banner render the exact same "Rate limit
 * exceeded, retry in N seconds" text for this; this waits out the
 * indicated backoff and repeats `attempt`, mirroring what a real user
 * clicking the app's own "Retry" affordance would do, instead of treating
 * a transient 429 as a broken test. */
async function retryOnRateLimit(
  page: Page,
  attempt: () => Promise<unknown>,
  target: Locator,
): Promise<void> {
  const rateLimited = page.getByText(/Rate limit exceeded, retry in (\d+) second/);
  const maxAttempts = 6;
  let lastSawRateLimit = false;
  for (let i = 0; i < maxAttempts; i++) {
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
    try {
      await expect(target.or(rateLimited)).toBeVisible({ timeout: 60000 });
    } catch {
      break;
    }
    // Check for the EXCEPTIONAL condition (the rate-limit banner) rather
    // than re-checking `target` itself. A real, reproduced bug in the
    // previous version of this check (`if (await target.isVisible())
    // return`) treated "target isn't visible *this exact instant*" as
    // proof of rate-limiting -- but the combined toBeVisible() above only
    // proves target WAS visible at some point during its own wait, not
    // that it still is right now. A target that's part of a fast
    // multi-step transition (e.g. Waiting Room -> Tabletop once a room
    // auto-starts) can legitimately have a brief gap where neither the
    // old nor the new page content is rendered yet -- landing exactly in
    // that gap made this `isVisible()` call return false on a genuinely
    // successful path, which made the loop wrongly assume rate-limiting,
    // back off, and re-click a submit button that had already navigated
    // away for good -- confirmed via a real CI trace (guest already on
    // /games/... , `isVisible()` still returned false, then the retried
    // click hung forever waiting for a "Join room" button that no longer
    // existed). Checking for the banner specifically, and defaulting to
    // success when it's absent, can't make that mistake: the banner
    // doesn't have a transient "briefly gone" state the way a
    // multi-step navigation's content does.
    if (!(await rateLimited.isVisible())) return;
    lastSawRateLimit = true;

    // Read the banner's backoff seconds atomically, with its own short
    // bounded timeout, and tolerate it having already disappeared. The
    // previous version called an *unbounded* .textContent() here after a
    // separate .isVisible() check -- a real, reproduced race: the banner
    // can be removed (re-rendered away by the app's own retry affordance,
    // or replaced once the underlying request settles) in the gap between
    // that check and this read, and an unbounded read on a since-vanished
    // locator throws instead of resolving, crashing this whole helper
    // rather than just falling back to a safe default backoff.
    let seconds = 5;
    try {
      const text = await rateLimited.first().textContent({ timeout: 2000 });
      const match = text ? /retry in (\d+) second/.exec(text) : null;
      if (match) seconds = Number(match[1]);
    } catch {
      // Banner vanished before it could be read, or never fully attached --
      // fall through with the default backoff instead of failing the loop.
    }
    // The only wait in this loop that isn't itself an authoritative
    // state-based `expect`: it mirrors a real duration the server told the
    // client to wait, not an arbitrary guess.
    await page.waitForTimeout((seconds + 1) * 1000);
  }
  await expect(
    target,
    `${target} never became visible after ${maxAttempts} attempts` +
      (lastSawRateLimit
        ? " (last attempt was still showing a rate-limit banner)"
        : " (no rate-limit banner was ever observed -- likely a real failure, not rate-limit backoff)"),
  ).toBeVisible({ timeout: 30000 });
}

/** Navigates to "/" and waits for the identity bootstrap to complete,
 * tolerating a transient rate limit (see retryOnRateLimit). Waits on the
 * dashboard's large page-title heading (Phase 6) -- the one heading that's
 * always rendered the instant the Home page mounts, before its own
 * separate room-list fetch resolves. */
export async function waitForReady(page: Page): Promise<void> {
  await retryOnRateLimit(
    page,
    () => page.goto("/"),
    page.getByRole("heading", { name: "Tile Meld", level: 1 }),
  );
}

/** Generates a per-call-unique username from a readable base (Phase 2:
 * docs/next-changes-implementation-plan.md). The whole matrix runs
 * serially against one long-lived, never-truncated dev database (see
 * playwright.config.ts), so a fixed literal like "Host" would collide with
 * an identical claim from an earlier spec in the same run -- unlike the
 * unit-test suite, which gets a freshly truncated DB per test. Stays
 * within UsernameSchema's bounds (3-24 chars, [A-Za-z0-9_-]). */
function uniqueUsername(base: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}${suffix}`.slice(0, 24);
}

/** Claims a username for `page`'s identity via the Recovery page -- room
 * creation (Phase 2) now requires one. Returns the actual claimed username
 * (suffixed for uniqueness -- see uniqueUsername) so callers can assert
 * against the friendly room name it produces. Tolerates a transient rate
 * limit like every other mutating action in this file.
 *
 * Navigates straight to "/recovery" rather than clicking the nav bar's
 * "Recovery" link: the previous version's click depended on the nav being
 * already rendered and immediately clickable on whatever page the caller
 * happened to be on, which is one more thing that can transiently fail
 * under load for no reason related to what this helper is actually
 * establishing. AuthProvider (apps/web/src/auth/AuthProvider.tsx) mounts
 * at the app root and bootstraps identity on every page, "/recovery"
 * included, so this loses nothing -- and RecoveryPage's username `<input>`
 * literally does not exist in the DOM until that bootstrap resolves
 * (UsernameSection returns null before `state.status === "ready"`), so
 * waiting for it via retryOnRateLimit's `target` is itself an explicit,
 * authoritative wait for both identity bootstrap AND the form being ready
 * -- not two separate waits bolted together.
 *
 * Only returns once `clickUntilSettled` has confirmed the "your username
 * is <name>" confirmation text is showing, not merely once the claim
 * request was sent -- that text is rendered from AuthProvider's own
 * `state.username`, the same shared context every other page (including
 * the "/rooms/join" form this claim usually precedes) reads, so seeing it
 * IS proof the authenticated client state has actually updated, not a
 * separate, weaker signal bolted on afterward. */
export async function claimUsername(page: Page, base: string): Promise<string> {
  const username = uniqueUsername(base);
  const usernameField = page.getByLabel("Username");
  await retryOnRateLimit(page, () => page.goto("/recovery"), usernameField);
  await usernameField.fill(username);
  await clickUntilSettled(
    page,
    page.getByRole("button", { name: "Claim username" }),
    page.getByText(/your username is/i),
  );
  return username;
}

/** Reads a room's invite code from WaitingRoomPage's dedicated "Room
 * code:" line. The heading now shows the room's friendly name (Phase 2),
 * which may differ from the code, so the code can no longer be parsed out
 * of the heading the way it could before. */
export async function readRoomCode(page: Page): Promise<string> {
  const codeLine = page.getByText(/^Room code: /);
  await codeLine.waitFor();
  return (await codeLine.textContent())!.replace("Room code:", "").trim();
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
 * the recovery endpoint's especially tight 5 req/min bucket directly.
 *
 * Only for a `submit` that is already known to exist on the current page
 * (e.g. a button in a form the caller just navigated to and confirmed is
 * rendered) -- it is NOT a substitute for waiting on a page/form that
 * might not have loaded yet. A bare `submit.click()` with no timeout of
 * its own would otherwise wait, unbounded, for the whole test timeout to
 * expire if `submit` never appears at all, producing a confusing
 * "Test ended -- waiting for <role>" failure with no indication of what
 * the page actually looked like. Failing fast here, with a bounded
 * precondition and real diagnostics, catches that case immediately
 * instead. */
export async function clickUntilSettled(
  page: Page,
  submit: Locator,
  target: Locator,
): Promise<void> {
  try {
    await expect(submit).toBeVisible({ timeout: 15000 });
    await expect(submit).toBeEnabled({ timeout: 15000 });
  } catch (err) {
    throw new Error(
      `clickUntilSettled: submit locator never became visible/enabled before clicking.\n` +
        `${await describePageState(page)}\n` +
        `  Original error: ${String(err)}`,
    );
  }
  await retryOnRateLimit(page, () => submit.click(), target);
}

/** Navigates `page` directly to "/rooms/join" and waits until the Join
 * Room by Name form is authoritatively ready -- not just the page
 * heading (which renders identically whether or not a username is
 * claimed -- see JoinRoomPage.tsx's early `if (!username)` return, which
 * shows the SAME "Join Room by Name" <h1> with no form at all), but the
 * actual "Room name" input and an enabled "Join room" submit button.
 * Never relies on the nav bar's own link being already rendered and
 * clickable (same reasoning as claimUsername's direct "/recovery"
 * navigation). `page.goto` here is itself a full page reload -- it
 * re-runs identity bootstrap via session recovery -- so waiting on the
 * form fields specifically (not just the heading) is what actually
 * distinguishes "still bootstrapping" and "bootstrapped but no username"
 * from "genuinely ready," rather than racing into a fill/click against a
 * page that only looks ready. */
export async function openJoinRoomByNamePage(page: Page): Promise<void> {
  const heading = page.getByRole("heading", { name: "Join Room by Name" });
  const roomNameField = page.getByLabel("Room name");
  const submitButton = page.getByRole("button", { name: "Join room" });
  try {
    await retryOnRateLimit(page, () => page.goto("/rooms/join"), heading);
    await expect(page).toHaveURL(/\/rooms\/join/, { timeout: 15000 });
    await expect(roomNameField).toBeVisible({ timeout: 15000 });
    await expect(submitButton).toBeVisible({ timeout: 15000 });
    await expect(submitButton).toBeEnabled({ timeout: 15000 });
  } catch (err) {
    throw new Error(
      `openJoinRoomByNamePage: the Join Room by Name form never became ready.\n` +
        `${await describePageState(page)}\n` +
        `  Original error: ${String(err)}`,
    );
  }
}

/** Fills and submits the Join Room by Name form (already navigated to via
 * openJoinRoomByNamePage) with `roomName`, then waits for one of the
 * three legitimate outcomes: the Waiting Room (still filling), the
 * Tabletop (capacity auto-start, Phase 4, already redirected before this
 * wait even started), or a visible, actionable server error (e.g. "room
 * not found") -- never silently returning on a request that was merely
 * *sent*.
 *
 * Deliberately a single click, not clickUntilSettled's retry loop: once
 * submitted, the button either produces one of the three outcomes above
 * or a genuine, distinct error -- there is no legitimate reason to click
 * "Join room" a second time. A real CI failure (traced in detail --
 * docs/ci-e2e-join-navigation-followup.md) showed exactly what goes
 * wrong when a generic retry helper's own transient-visibility check
 * misfires here: the join had already succeeded and the guest had
 * already navigated to the Tabletop, but the retry loop wrongly
 * concluded it needed to try again and clicked a "Join room" button that
 * no longer existed anywhere on the page, hanging until the whole test
 * timed out. */
export async function joinRoomByName(page: Page, roomName: string): Promise<void> {
  await openJoinRoomByNamePage(page);

  const roomNameField = page.getByLabel("Room name");
  await roomNameField.fill(roomName);
  await expect(roomNameField).toHaveValue(roomName);

  const joinButton = page.getByRole("button", { name: "Join room" });
  await expect(joinButton).toBeVisible();
  await expect(joinButton).toBeEnabled();
  await joinButton.click();

  const waitingRoomHeading = page.getByRole("heading", { name: roomName });
  const tabletopHeading = page.getByRole("heading", { name: "Your rack (14)" });
  const serverError = page.locator(".error-banner[role='alert']");
  try {
    await expect(waitingRoomHeading.or(tabletopHeading).or(serverError)).toBeVisible({
      timeout: GAME_ENTRY_TIMEOUT,
    });
  } catch (err) {
    throw new Error(
      `joinRoomByName: no outcome (Waiting Room, Tabletop, or a server error) appeared after ` +
        `clicking "Join room".\n${await describePageState(page)}\n  Original error: ${String(err)}`,
    );
  }
  if (await serverError.isVisible()) {
    const message = await serverError.textContent();
    throw new Error(`joinRoomByName: the server rejected the join -- ${message}`);
  }
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

  // Room creation now requires a claimed username (Phase 2), and the
  // resulting room is named after it.
  const hostUsername = await claimUsername(hostPage, "Host");
  await claimUsername(guestPage, "Guest");

  await hostPage.getByRole("link", { name: "Create Room" }).click();
  await hostPage.getByRole("radio", { name: "2 players" }).check();
  await hostPage.getByRole("radio", { name: "Private (invite by code)" }).check();
  const hostHeading = hostPage.getByRole("heading", { name: hostUsername });
  await clickUntilSettled(
    hostPage,
    hostPage.getByRole("button", { name: "Create room" }),
    hostHeading,
  );
  // Still verifies the preserved "Room code:" compatibility/fallback line
  // renders (Phase 3), even though the guest below no longer needs it.
  await readRoomCode(hostPage);
  const roomId = /\/rooms\/([^/?#]+)/.exec(hostPage.url())?.[1];
  if (!roomId) throw new Error("startTwoPlayerGame: could not parse roomId from URL after create");

  // The normal join path is now exact-name (Phase 3, corrected DR-8) -- the
  // room's name IS the host's username for a private room, already known.
  // Capacity 2: this join fills the room and auto-starts it immediately
  // (Phase 4) -- no manual ready/start round trip is needed. joinRoomByName
  // (see its own comment) already tolerates landing on either the
  // (possibly momentary) Waiting Room or -- if the redirect already
  // happened -- the Tabletop directly.
  await joinRoomByName(guestPage, hostUsername);

  // Auto-start (Phase 4) already dealt the game -- both pages get carried
  // there by their own waiting-room poll (or may already be there). The
  // host reliably reaches /games/ on its own; give the guest a brief
  // window, then fall back to the known game URL. This is test SETUP
  // getting both clients seated, not the behavior under test (the in-app
  // auto-navigation is exercised directly by turn-timeout/reconnect specs);
  // it does not change any production polling or rate limit.
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

  // Room creation now requires a claimed username (Phase 2), and the
  // resulting room is named after it.
  const hostUsername = await claimUsername(hostPage, "P1");
  for (const [index, guestPage] of guestPages.entries()) {
    await claimUsername(guestPage, `P${index + 2}`);
  }

  await hostPage.getByRole("link", { name: "Create Room" }).click();
  await hostPage.getByRole("radio", { name: `${capacity} players` }).check();
  await hostPage.getByRole("radio", { name: "Private (invite by code)" }).check();
  const hostHeading = hostPage.getByRole("heading", { name: hostUsername });
  await clickUntilSettled(
    hostPage,
    hostPage.getByRole("button", { name: "Create room" }),
    hostHeading,
  );
  // Still verifies the preserved "Room code:" compatibility/fallback line
  // renders (Phase 3), even though the guests below no longer need it.
  await readRoomCode(hostPage);

  // The normal join path is now exact-name (Phase 3, corrected DR-8) -- the
  // room's name IS the host's username for a private room, already known.
  // The LAST join fills the room to capacity and auto-starts it (Phase 4);
  // earlier joins leave it open. joinRoomByName (see its own comment)
  // already tolerates landing on either the Waiting Room or -- if already
  // redirected -- the Tabletop.
  for (const guestPage of guestPages) {
    await joinRoomByName(guestPage, hostUsername);
  }

  // Auto-start (Phase 4) already dealt the game once the room filled. Same
  // safe setup fallback as startTwoPlayerGame: the host enters the game
  // reliably; each other seat's waiting-room poll normally follows, but if
  // it lags under load, send that page straight to the known game URL.
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

/** Clicks `button`, then waits for `expected` to become visible; if it
 * doesn't show up within a short bounded window, clicks once more before
 * falling through to a longer, final wait. A CI-only, non-reproducing-
 * locally failure (real mouse drag: rack tile onto a new table set...,
 * e2e/tests/drag-and-drop.spec.ts) showed a click on the Undo button
 * immediately after a drag settle producing no observable state change at
 * all -- not a slow transition, a transition that never started. 30 local
 * repro attempts (including real rate-limit contention) never reproduced
 * it, and a full read of the draft-history reducer
 * (apps/web/src/tabletop/useDraftState.ts, draftState.ts) found it pure
 * and correct, so the working theory is a rare, CI-slowness-only click-
 * delivery gap immediately after the preceding drag's drop, not an
 * application bug. This does not change what must ultimately be true --
 * `expected` is still the caller's real, full assertion -- it only makes
 * *reaching* that state more robust against one missed click, the same
 * "retry a user-equivalent action" spirit as retryOnRateLimit and the
 * extra settle-moves already in dragTo above, neither of which this
 * touches. */
export async function clickAndConfirm(button: Locator, expected: Locator): Promise<void> {
  await button.click();
  try {
    await expect(expected).toBeVisible({ timeout: 5000 });
    return;
  } catch {
    // Fall through to a single defensive retry click.
  }
  await button.click();
  await expect(expected).toBeVisible({ timeout: 15000 });
}
