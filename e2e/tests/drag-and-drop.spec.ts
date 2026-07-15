import { test, expect } from "@playwright/test";
import { startTwoPlayerGame, dragTo } from "./helpers.js";

// Complements the click/tap path already covered in two-player-smoke.spec.ts
// with a genuine pointer drag, proving the dnd-kit PointerSensor
// activation-distance fix (apps/web/src/pages/TabletopPage.tsx, distance: 8)
// works for real drags, not just clicks -- a real drag must move the mouse
// past that 8px threshold before dnd-kit will treat it as a drag rather
// than a click, and a naive single-jump "move + drop" can land inside that
// threshold and silently no-op.
//
// A tall viewport keeps the rack and the table both fully on-screen at
// once: unlike .click(), raw mouse.move/down/up never auto-scrolls, and
// coordinates outside the current viewport hit no element at all (dnd-kit's
// pointerdown listener then never fires) -- a real drag can't span a
// scroll boundary either, so this sidesteps needing to simulate dnd-kit's
// separate drag-triggered auto-scroll behavior.
test.use({ viewport: { width: 1280, height: 2200 } });

test("real mouse drag: rack tile onto a new table set, then a second tile onto that set", async ({
  browser,
}) => {
  const { activePage } = await startTwoPlayerGame(browser);

  // The Table section renders above the rack in the DOM, and both rack and
  // table tiles share the same ".tile" class -- once a set exists on the
  // table, an unscoped ".tile" locator would pick up a table tile instead
  // of a rack tile, so rack tiles are always selected via the rack's own
  // "Your rack" group.
  const rackTiles = activePage.locator('[aria-label="Your rack"] .tile');
  const newSetZone = activePage.locator('[aria-label="Start a new set"]');

  await dragTo(activePage, rackTiles.first(), newSetZone);

  await expect(activePage.getByRole("heading", { name: "Your rack (13)" })).toBeVisible();
  await expect(activePage.getByText(/^Set 1 --/)).toBeVisible();

  // Drag a second rack tile onto the set the first drag just created --
  // exercises the OTHER droppable type (an existing TableSet, not the
  // always-present "new set" zone), confirming drag-to-existing-set works
  // too, not only drag-to-empty-zone.
  const setOneZone = activePage.locator('[aria-label^="Set 1,"]');
  await dragTo(activePage, rackTiles.first(), setOneZone);

  await expect(activePage.getByRole("heading", { name: "Your rack (12)" })).toBeVisible();
  await expect(setOneZone.locator(".tile")).toHaveCount(2);

  // Undo unwinds one move at a time back to the original 14-tile rack.
  await activePage.getByRole("button", { name: "Undo" }).click();
  await expect(activePage.getByRole("heading", { name: "Your rack (13)" })).toBeVisible();
  await activePage.getByRole("button", { name: "Undo" }).click();
  await expect(activePage.getByRole("heading", { name: "Your rack (14)" })).toBeVisible();
});
