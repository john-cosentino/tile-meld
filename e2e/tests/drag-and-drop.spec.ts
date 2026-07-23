import { test, expect } from "@playwright/test";
import { startTwoPlayerGame, dragTo, clickAndConfirm } from "./helpers.js";

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
  const setOneZone = activePage.locator('[aria-label^="Set 1,"]');
  const undoButton = activePage.getByRole("button", { name: "Undo" });

  // After EACH action, wait for the full authoritative draft state -- both the
  // rack count and the number of tiles in Set 1 -- before doing the next one,
  // so a not-yet-landed drag or a not-yet-applied undo can never be mistaken
  // for a completed one.
  await dragTo(activePage, rackTiles.first(), newSetZone);
  await expect(activePage.getByRole("heading", { name: "Your rack (13)" })).toBeVisible();
  await expect(setOneZone.locator(".tile")).toHaveCount(1);

  // Drag a second rack tile onto the set the first drag just created --
  // exercises the OTHER droppable type (an existing TableSet, not the
  // always-present "new set" zone), confirming drag-to-existing-set works
  // too, not only drag-to-empty-zone. Aim at the tile already IN Set 1 (firmly
  // inside that set's droppable) rather than the set container's centre, which
  // for a short one-tile set can sit close enough to the adjacent "new set"
  // zone that collision resolves there instead.
  await dragTo(activePage, rackTiles.first(), setOneZone.locator(".tile").first());
  await expect(activePage.getByRole("heading", { name: "Your rack (12)" })).toBeVisible();
  await expect(setOneZone.locator(".tile")).toHaveCount(2);

  // Undo unwinds one move at a time back to the original 14-tile rack. Each
  // Undo is verified by the full resulting state (rack count AND Set 1 count),
  // and the button becoming disabled proves the stack emptied cleanly.
  // clickAndConfirm (see helpers.ts) retries the click once if nothing
  // changes within a short window, rather than trusting a single click to
  // have landed -- see that helper's comment for why.
  const rack13 = activePage.getByRole("heading", { name: "Your rack (13)" });
  await clickAndConfirm(undoButton, rack13);
  await expect(setOneZone.locator(".tile")).toHaveCount(1);

  const rack14 = activePage.getByRole("heading", { name: "Your rack (14)" });
  await clickAndConfirm(undoButton, rack14);
  await expect(activePage.getByText(/^Set 1 --/)).toHaveCount(0);
  await expect(undoButton).toBeDisabled();
});
