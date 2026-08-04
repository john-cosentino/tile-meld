import { test, expect } from "@playwright/test";
import { waitForReady, clickUntilSettled, registerAccount, readRoomCode } from "./helpers.js";

// Distinct from every other room-entry path already covered elsewhere
// (private room by code, in two-player-smoke.spec.ts /multi-player.spec.ts):
// this exercises the public lobby listing (browse + explicit Join) and the
// separate Quick Join endpoint, both server round trips of their own
// (GET /api/rooms/public, POST /api/rooms/quick-join).
test("public lobby: create a public room, join it via the lobby listing, and Quick Join into an open public room", async ({
  browser,
}) => {
  // 4 contexts, 2 room creations, and possible rate-limit retries
  // (clickUntilSettled, helpers.ts) push comfortably past the 30s default.
  test.setTimeout(90000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const quickJoinHostContext = await browser.newContext();
  const quickJoinContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();
  const quickJoinHostPage = await quickJoinHostContext.newPage();
  const quickJoinPage = await quickJoinContext.newPage();

  // Room creation AND joining (Phase 2/3) both require a claimed username --
  // every identity here needs one.
  const hostUsername = await registerAccount(hostPage, "PubHost");
  await registerAccount(guestPage, "PubGuest");
  const quickHostUsername = await registerAccount(quickJoinHostPage, "QuickHost");
  await registerAccount(quickJoinPage, "PubQuick");

  // Capacity 4 (not 2, Phase 4): a capacity-2 room would auto-start the
  // instant the guest below joins, racing this test's own waiting-room
  // assertions (heading, "Room code:" line) against that redirect. Capacity
  // 4 with only 2 members keeps the room deliberately "open" -- with
  // headroom to spare even after the Quick Join arrival further below --
  // so this test can verify the lobby-join UI itself, not auto-start
  // (already covered by two-player-smoke.spec.ts / multi-player.spec.ts).
  await waitForReady(hostPage);
  await hostPage.getByRole("link", { name: "New Game" }).click();
  await hostPage.getByRole("radio", { name: "4 players" }).check();
  await hostPage.getByRole("radio", { name: "Public (listed in the lobby)" }).check();
  const hostRoomName = `public_${hostUsername}`;
  const hostHeading = hostPage.getByRole("heading", { name: hostRoomName });
  await clickUntilSettled(
    hostPage,
    hostPage.getByRole("button", { name: "Create room" }),
    hostHeading,
  );
  const code = await readRoomCode(hostPage);

  // The guest browses the public lobby and joins this room explicitly,
  // scoped by the room's friendly name -- robust even if older public
  // rooms from previous local runs are still listed alongside it (their
  // names are derived from a different, globally-unique username, so they
  // can never collide with this one).
  await guestPage.getByRole("navigation").getByRole("link", { name: "Public Lobby" }).click();
  await expect(guestPage.getByRole("heading", { name: "Public lobby" })).toBeVisible();
  const roomRow = guestPage.locator("li").filter({ hasText: hostRoomName });
  await expect(roomRow).toBeVisible({ timeout: 15000 });
  await expect(roomRow.getByText(/1\/4 players/)).toBeVisible();
  await clickUntilSettled(
    guestPage,
    roomRow.getByRole("button", { name: "Join" }),
    guestPage.getByRole("heading", { name: hostRoomName }),
  );
  // The code read from the waiting room matches what was allocated at
  // creation -- confirms the friendly name and the opaque code still refer
  // to the same room.
  expect(await readRoomCode(guestPage)).toBe(code);

  // A second public room is created (capacity 3, only its host as a
  // member) before a third, separate player uses Quick Join instead of
  // browsing the list. Not asserted to land in THIS specific room:
  // findQuickJoinableRoom (apps/server/src/db/repositories/rooms.ts)
  // intentionally matches the oldest-idle eligible open public room
  // system-wide -- which, in a long-lived local dev database OR across
  // repeated runs of THIS spec itself, is not necessarily one of the two
  // rooms just created above. Confirmed by direct investigation (Meld
  // Masters Phase 1, Checkpoint A -- see docs/meld-masters-phase-1-summary.md):
  // running this spec repeatedly (`--repeat-each`) against a single
  // database, with no other spec involved at all, reproduces an
  // intermittent failure starting from the second run onward. The cause
  // isn't a bug in this test's own two rooms (both are deliberately left
  // with >= 2 free seats, so quick-joining either one here can never fill
  // it) -- it's that a *previous* run's successful Quick Join leaves
  // whichever room it joined with exactly 1 free seat, still open. A later
  // run's Quick Join can legitimately match that leftover room (oldest
  // idle first, by design) and complete it to capacity, which correctly
  // triggers the same real, shared auto-start-on-capacity behavior any
  // last-seat join uses (game/roomStart.ts) -- redirecting straight to the
  // Tabletop instead of leaving the player in the Waiting Room. Nothing in
  // this app promises Quick Join will never fill a room; that was an
  // assumption this test made about its OWN two rooms, which doesn't
  // extend to whatever a prior run left behind. So the assertion below
  // accepts BOTH real outcomes production can produce: landing in the
  // Waiting Room ("Leave room"), or -- if the matched room happened to
  // fill and auto-start -- landing directly on the Tabletop with a dealt
  // rack. Either one proves the same thing this test cares about: the
  // endpoint placed the player into a real, live public room, end to end.
  await waitForReady(quickJoinHostPage);
  await quickJoinHostPage.getByRole("link", { name: "New Game" }).click();
  await quickJoinHostPage.getByRole("radio", { name: "3 players" }).check();
  await quickJoinHostPage.getByRole("radio", { name: "Public (listed in the lobby)" }).check();
  await clickUntilSettled(
    quickJoinHostPage,
    quickJoinHostPage.getByRole("button", { name: "Create room" }),
    quickJoinHostPage.getByRole("heading", { name: `public_${quickHostUsername}` }),
  );

  await quickJoinPage.getByRole("navigation").getByRole("link", { name: "Public Lobby" }).click();
  // Which specific room is intentionally not asserted, per the comment
  // above -- only that Quick Join actually placed the player somewhere
  // real: either the Waiting Room, or (if the matched room filled and
  // auto-started) straight onto a dealt Tabletop.
  const quickJoinLanded = quickJoinPage
    .getByRole("button", { name: "Leave room" })
    .or(quickJoinPage.getByRole("heading", { name: /Your rack \(\d+\)/ }));
  await clickUntilSettled(
    quickJoinPage,
    quickJoinPage.getByRole("button", { name: "Quick Join" }),
    quickJoinLanded,
  );
});
