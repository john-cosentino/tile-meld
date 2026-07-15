import { test, expect } from "@playwright/test";
import { waitForReady, clickUntilSettled } from "./helpers.js";

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

  // Capacity 2 so the room fills (and self-excludes from future Quick Join
  // matches) as soon as the explicit-join guest below completes it -- keeps
  // repeat local runs from accumulating permanently-open public rooms.
  await hostPage.getByRole("link", { name: "Create Room" }).click();
  await hostPage.getByLabel("Your display name").fill("PubHost");
  await hostPage.getByRole("radio", { name: "2 players" }).check();
  await hostPage.getByRole("radio", { name: "Public (listed in the lobby)" }).check();
  const hostHeading = hostPage.getByRole("heading", { name: /^Room / });
  await clickUntilSettled(
    hostPage,
    hostPage.getByRole("button", { name: "Create room" }),
    hostHeading,
  );
  const code = (await hostHeading.textContent())!.replace("Room ", "").trim();

  // The guest browses the public lobby and joins this room explicitly,
  // scoped by room code -- robust even if older public rooms from previous
  // local runs are still listed alongside it.
  await guestPage.getByRole("navigation").getByRole("link", { name: "Public Lobby" }).click();
  await expect(guestPage.getByRole("heading", { name: "Public lobby" })).toBeVisible();
  await guestPage.getByLabel("Your display name").fill("PubGuest");
  const roomRow = guestPage.locator("li").filter({ hasText: `Room ${code}` });
  await expect(roomRow).toBeVisible({ timeout: 15000 });
  await expect(roomRow.getByText(/1\/2 players/)).toBeVisible();
  await clickUntilSettled(
    guestPage,
    roomRow.getByRole("button", { name: "Join" }),
    guestPage.getByRole("heading", { name: `Room ${code}` }),
  );

  // The room above is now full (2/2) and no longer Quick-Join-eligible, so
  // a second public room is created and deliberately left short a player --
  // guaranteeing at least one eligible target exists -- before a third,
  // separate player uses Quick Join instead of browsing the list. Not
  // asserted to land in THIS specific room: findQuickJoinableRoom
  // (apps/server/src/db/repositories/rooms.ts) intentionally matches the
  // oldest-idle eligible open public room system-wide, which in a
  // long-lived local dev database could be a different leftover room. What
  // matters here is that the endpoint places the player into *some* open
  // public room's waiting view, end to end.
  await quickJoinHostPage.getByRole("link", { name: "Create Room" }).click();
  await quickJoinHostPage.getByLabel("Your display name").fill("QuickHost");
  await quickJoinHostPage.getByRole("radio", { name: "2 players" }).check();
  await quickJoinHostPage.getByRole("radio", { name: "Public (listed in the lobby)" }).check();
  await clickUntilSettled(
    quickJoinHostPage,
    quickJoinHostPage.getByRole("button", { name: "Create room" }),
    quickJoinHostPage.getByRole("heading", { name: /^Room / }),
  );

  await quickJoinPage.getByRole("navigation").getByRole("link", { name: "Public Lobby" }).click();
  await quickJoinPage.getByLabel("Your display name").fill("PubQuick");
  await clickUntilSettled(
    quickJoinPage,
    quickJoinPage.getByRole("button", { name: "Quick Join" }),
    quickJoinPage.getByRole("heading", { name: /^Room / }),
  );
  await expect(quickJoinPage.getByRole("button", { name: "Leave room" })).toBeVisible();
});
