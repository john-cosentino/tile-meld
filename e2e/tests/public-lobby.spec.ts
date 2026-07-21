import { test, expect } from "@playwright/test";
import { waitForReady, clickUntilSettled, claimUsername, readRoomCode } from "./helpers.js";

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

  await waitForReady(hostPage);
  await waitForReady(guestPage);
  await waitForReady(quickJoinHostPage);
  await waitForReady(quickJoinPage);

  // Room creation AND joining (Phase 2/3) both require a claimed username --
  // every identity here needs one.
  const hostUsername = await claimUsername(hostPage, "PubHost");
  await claimUsername(guestPage, "PubGuest");
  const quickHostUsername = await claimUsername(quickJoinHostPage, "QuickHost");
  await claimUsername(quickJoinPage, "PubQuick");

  // Capacity 4 (not 2, Phase 4): a capacity-2 room would auto-start the
  // instant the guest below joins, racing this test's own waiting-room
  // assertions (heading, "Room code:" line) against that redirect. Capacity
  // 4 with only 2 members keeps the room deliberately "open" -- with
  // headroom to spare even after the Quick Join arrival further below --
  // so this test can verify the lobby-join UI itself, not auto-start
  // (already covered by two-player-smoke.spec.ts / multi-player.spec.ts).
  await hostPage.getByRole("link", { name: "Create Room" }).click();
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
  // system-wide, which in a long-lived local dev database could be a
  // different leftover room -- or even the room above, which still has
  // headroom (2/4). Both candidate rooms are deliberately left with at
  // least 2 free seats, so the Quick Join arrival below can never be the
  // one that reaches capacity and auto-starts (Phase 4) whichever it
  // picks -- what matters here is that the endpoint places the player into
  // *some* open public room's waiting view, end to end, and that waiting
  // view is reliably still the Waiting Room afterward.
  await quickJoinHostPage.getByRole("link", { name: "Create Room" }).click();
  await quickJoinHostPage.getByRole("radio", { name: "3 players" }).check();
  await quickJoinHostPage.getByRole("radio", { name: "Public (listed in the lobby)" }).check();
  await clickUntilSettled(
    quickJoinHostPage,
    quickJoinHostPage.getByRole("button", { name: "Create room" }),
    quickJoinHostPage.getByRole("heading", { name: `public_${quickHostUsername}` }),
  );

  await quickJoinPage.getByRole("navigation").getByRole("link", { name: "Public Lobby" }).click();
  // Landing anywhere in a waiting room (the "Leave room" control) is the
  // definitive signal here -- which specific room is intentionally not
  // asserted, per the comment above.
  await clickUntilSettled(
    quickJoinPage,
    quickJoinPage.getByRole("button", { name: "Quick Join" }),
    quickJoinPage.getByRole("button", { name: "Leave room" }),
  );
});
