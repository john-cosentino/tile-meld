// Meld Masters visual refresh -- Phase 4 review screenshot capture
// (docs/meld-masters-visual-refresh-plan.md Phase 4, "Done when: ...
// screenshots at all 4 viewports approved vs concepts 01/03/04"). A focused
// sibling of the Phase 0/2/3 capture scripts: same approach (standalone
// script outside e2e/tests so it never runs as part of `npx playwright
// test` / CI, same reused e2e helpers). Covers 13 tabletop states: the six
// Phase 0's baseline already captured once (pre-redesign), plus seven more
// added during Phase 4 closure to round out the review set (opponent turn,
// an active drop-target/drag substitute, a valid set, multiple sets, a
// non-default rack sort, Commit turn enabled, and chat with messages).
// Every identity/room/message this script creates is disposable test data
// in whatever database the target server is running against.
//
// Usage:
//   pnpm exec tsx e2e/scripts/capture-phase-4-review.ts [outDir]
//
// outDir defaults to docs/design-reference/phase-4-review. Both
// `pnpm --filter @tile-meld/server run dev` and
// `pnpm --filter @tile-meld/web run dev` must already be running.

import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  waitForReady,
  claimUsername,
  joinRoomByName,
  clickUntilSettled,
} from "../tests/helpers.js";

const BASE_URL = process.env.BASELINE_BASE_URL ?? "http://localhost:5173";
const OUT_DIR = path.resolve(process.argv[2] ?? "docs/design-reference/phase-4-review");

const VIEWPORTS: Record<string, { width: number; height: number }> = {
  "1440x900": { width: 1440, height: 900 },
  "1280x720": { width: 1280, height: 720 },
  "390x844": { width: 390, height: 844 },
  "844x390": { width: 844, height: 390 },
};

const missing: string[] = [];
const captured: string[] = [];
const substitutions: string[] = [];

async function shootAllViewports(page: Page, name: string): Promise<void> {
  for (const [label, size] of Object.entries(VIEWPORTS)) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    const file = `${name}--${label}.png`;
    await page.screenshot({ path: path.join(OUT_DIR, file), fullPage: true });
    captured.push(file);
  }
}

async function capture(name: string, page: Page, fn?: () => Promise<void>): Promise<void> {
  try {
    if (fn) await fn();
    await shootAllViewports(page, name);
    console.log(`captured: ${name}`);
  } catch (err) {
    missing.push(`${name} -- ${(err as Error).message}`);
    console.error(`FAILED: ${name}: ${(err as Error).message}`);
  }
}

// A genuinely valid Rummikub-style meld needs 3+ tiles, but building one
// via automated drag-and-drop turned out to be unreliable in this app past
// 2 sequential drags into the same still-small set container: a 3rd
// follow-up drag would occasionally have dnd-kit's collision detection
// resolve to the adjacent, ever-present "start a new set" zone instead of
// the set just being built -- CLAUDE.md's documented drag-precision risk
// ("target a tile INSIDE the set, not the container centre") holds even
// when the target genuinely is a tile inside the set, once that set is
// small enough to sit close to the boundary. Two earlier attempts at a
// rack-scanning 3-tile meld-finder both still hit this, scattering tiles
// into several stray one-tile sets instead of one real meld -- not a
// scripting bug (confirmed by switching from index- to label-based tile
// lookups, which changed nothing). So every self-constructed set here is
// capped at exactly the 2-drag pattern already proven reliable by the
// invalid-set capture above (1 tile onto "start a new set", 1 more onto
// that set's own tile) -- "valid" table-set content instead relies on the
// computer opponent's own already-committed meld, which every capture run
// this phase has had on the table by this point (see the substitution
// logged below on the rare run where it doesn't).

async function run(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  // -- State: opponent-turn (human opponent, distinct from computer-turn).
  // A separate, self-contained two-player game via the same helper the real
  // e2e suite uses. Closed before the main vs-computer flow below.
  {
    const browser: Browser = await chromium.launch();
    try {
      // Not startTwoPlayerGame (e2e/tests/helpers.ts): that helper creates
      // its contexts via a bare `browser.newContext()`, relying on the
      // baseURL Playwright's test runner injects from playwright.config.ts.
      // This script drives the raw chromium API directly (no test runner),
      // so that config never applies -- every context here must pass
      // baseURL explicitly, same as the main vs-computer flow below.
      const hostContext = await browser.newContext({ baseURL: BASE_URL });
      const guestContext = await browser.newContext({ baseURL: BASE_URL });
      const hostPage = await hostContext.newPage();
      const guestPage = await guestContext.newPage();

      await waitForReady(hostPage);
      await waitForReady(guestPage);
      const hostUsername = await claimUsername(hostPage, "Phase4Host");
      await claimUsername(guestPage, "Phase4Guest");

      await hostPage.getByRole("link", { name: "Create Room" }).click();
      await hostPage.getByRole("radio", { name: "2 players" }).check();
      await hostPage.getByRole("radio", { name: "Private (invite by code)" }).check();
      await clickUntilSettled(
        hostPage,
        hostPage.getByRole("button", { name: "Create room" }),
        hostPage.getByRole("heading", { name: hostUsername }),
      );
      await joinRoomByName(guestPage, hostUsername);

      await hostPage.waitForURL(/\/games\//, { timeout: 15000 });
      const gameUrl = hostPage.url();
      try {
        await guestPage.waitForURL(/\/games\//, { timeout: 10000 });
      } catch {
        await guestPage.goto(gameUrl);
      }
      await hostPage.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });
      await guestPage.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });

      await hostPage
        .getByText("Your turn", { exact: true })
        .or(hostPage.getByText(/Waiting on seat/))
        .first()
        .waitFor({ timeout: 15000 });
      const hostIsActive = await hostPage.getByText("Your turn", { exact: true }).isVisible();
      const waitingPage = hostIsActive ? guestPage : hostPage;

      await capture("tabletop-opponent-turn", waitingPage);
      await hostContext.close();
      await guestContext.close();
    } catch (err) {
      missing.push(`tabletop-opponent-turn -- ${(err as Error).message}`);
      console.error(`FAILED: tabletop-opponent-turn: ${(err as Error).message}`);
    } finally {
      await browser.close();
    }
  }

  // -- Main vs-computer game: every other state. --
  const browser: Browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();

    await waitForReady(page);
    await claimUsername(page, "Phase4Review");
    await page.getByRole("link", { name: "Meld Masters", exact: true }).click();
    const playVsComputer = page.getByRole("button", { name: /play vs computer/i });
    await playVsComputer.waitFor();
    await playVsComputer.click();
    await page.getByLabel("computer opponent").waitFor();
    await page.getByRole("button", { name: "Mark ready" }).click();
    await page.getByRole("button", { name: /Start game/ }).click();
    await page.waitForURL(/\/games\//, { timeout: 15000 });
    await page.getByRole("heading", { name: /Your rack \(14\)/ }).waitFor({ timeout: 15000 });
    await page.getByText("Your turn", { exact: true }).waitFor({ timeout: 20000 });

    // 1. Tabletop, the player's turn -- clean 14-tile rack, empty table.
    await capture("tabletop-your-turn", page);

    // 2. Tabletop, the computer's turn.
    await capture("tabletop-computer-turn", page, async () => {
      await page.getByRole("button", { name: "Draw tile" }).click();
      await page.getByText(/Computer is playing…/).waitFor({ timeout: 10000 });
    });
    await page.getByText("Your turn", { exact: true }).waitFor({ timeout: 20000 });

    // 3. Tabletop, a rack tile selected (Phase 4: gold ring via .is-selected).
    const rackTiles = page.locator('[aria-label="Your rack"] .tile');
    await capture("tabletop-tile-selected", page, async () => {
      await rackTiles.first().click();
    });
    await rackTiles.first().click();

    // Adds the current first rack tile to a set via click-to-select then
    // click-to-place (the app's own accessible drag alternative --
    // e2e/tests/two-player-smoke.spec.ts's "click/tap tile selection and
    // move" test), never raw mouse drag. This is the reliable primitive
    // for the states below: a raw mouse drag's target is resolved by
    // dnd-kit from live pointer coordinates via rectangle-intersection
    // collision, which -- confirmed by two earlier attempts at this
    // script, including one using pixel-precise locators -- can resolve a
    // drop near a small set's edge to the adjacent "start a new set" zone
    // instead of the set actually being targeted, scattering tiles into
    // stray one-tile sets. A click, by contrast, resolves via each zone's
    // own bound `onClick` handler (`DropZone.tsx`/`TableSet.tsx`
    // `onActivateZone`) -- an ordinary DOM event on a specific element,
    // with no coordinate ambiguity at all.
    async function clickTileToZone(zone: ReturnType<Page["locator"]>): Promise<void> {
      await rackTiles.first().click();
      await zone.click();
    }

    // Builds one new set of `count` tiles from the rack via the reliable
    // click-to-select/click-to-place primitive above. Addresses the
    // resulting set by its *exact ordinal* (`beforeCount`, i.e. however
    // many sets already exist), never a hardcoded "Set 1," -- the
    // computer opponent may already have its own committed meld or two on
    // the table by this point, in which case a fresh set is Set 2 or
    // later, not Set 1. An earlier version of this script hardcoded "Set
    // 1," and, whenever the board wasn't actually empty, ended up adding
    // rack tiles onto the *opponent's* already-valid set instead of a new
    // one of its own.
    async function buildSetOfSize(count: number): Promise<void> {
      const beforeCount = await page.locator('[aria-label^="Set "]').count();
      const newSetZone = page.locator('[aria-label="Start a new set"]');
      await clickTileToZone(newSetZone);
      const mySetZone = page.locator(`[aria-label^="Set ${beforeCount + 1},"]`);
      await mySetZone.locator(".tile").first().waitFor();
      for (let i = 1; i < count; i++) {
        await clickTileToZone(mySetZone);
      }
    }

    // 4. Tabletop, an invalid set (Phase 4: red border via .is-invalid --
    // hintEngine.ts only classifies a set "invalid" at 3+ tiles that don't
    // form a run/group; fewer tiles read as "neutral" ("needs N more"), so
    // this needs a real 3-tile set, not 2).
    //
    // The rack count to return to after Undo is whatever it is *right
    // now*, not a hardcoded 14 -- the earlier "computer-turn" capture's
    // Draw tile click (`game.draw()`, useGame.ts) is a real, immediately-
    // committed server call, not part of the undoable local draft, so the
    // rack permanently gained a tile then and reads 15 for the rest of
    // this game (confirmed via the `tabletop-tile-selected` capture,
    // which already shows "(15)"). A hardcoded "(14)" here would never be
    // satisfied, and an earlier version of this script fell through that
    // wait's timeout with the board silently left non-empty, which is
    // what actually caused every "stray extra set" symptom chased above
    // -- not a targeting bug in buildSetOfSize at all.
    await page.setViewportSize({ width: 1280, height: 2200 });
    const setCountBeforeInvalid = await page.locator('[aria-label^="Set "]').count();
    const rackCountBeforeInvalid = await rackTiles.count();
    await capture("tabletop-invalid-set", page, async () => {
      await buildSetOfSize(3);
      await page.getByText(new RegExp(`^Set ${setCountBeforeInvalid + 1} --`)).waitFor();
    });
    const invalidSetIsGenuinelyInvalid = await page
      .getByText("not a valid run or group")
      .isVisible()
      .catch(() => false);
    if (!invalidSetIsGenuinelyInvalid) {
      substitutions.push(
        "tabletop-invalid-set: the 3 arbitrary rack tiles used happened to form a valid run/group by chance -- captured as-is rather than retrying (see the caption in the screenshot itself).",
      );
    }
    // Undo is a single-step history pop (useDraftState.ts), not a
    // full-draft revert -- click it once per move made above (bounded,
    // not an unbounded retry loop) so the rack/board are back to the
    // clean slate captured above (`setCountBeforeInvalid`/
    // `rackCountBeforeInvalid`) for the meld-construction states below.
    // The target is NOT unconditionally "0 sets": the computer opponent
    // plays its own turn autonomously in between captures and may have
    // already committed a real meld of its own before this point, which
    // Undo correctly leaves alone (it only reverts this turn's draft).
    const setsZone = page.locator('[aria-label^="Set "]');
    for (
      let i = 0;
      i < 6 &&
      !(
        (await rackTiles.count()) === rackCountBeforeInvalid &&
        (await setsZone.count()) === setCountBeforeInvalid
      );
      i++
    ) {
      await page.getByRole("button", { name: "Undo" }).click();
      await page.waitForTimeout(250);
    }
    if (
      (await rackTiles.count()) !== rackCountBeforeInvalid ||
      (await setsZone.count()) !== setCountBeforeInvalid
    ) {
      throw new Error(
        `Undo did not fully clear the invalid-set draft: rack ${await rackTiles.count()} (expected ${rackCountBeforeInvalid}), ${await setsZone.count()} set(s) (expected ${setCountBeforeInvalid})`,
      );
    }

    // 7. Rack with a non-default sort control active.
    await page.setViewportSize({ width: 1280, height: 900 });
    await capture("tabletop-rack-sorted", page, async () => {
      await page.getByRole("button", { name: "Sort by number" }).click();
      await page.getByRole("button", { name: "Sort by number" }).waitFor({ state: "visible" });
    });
    await page.getByRole("button", { name: "Manual" }).click();

    // The computer opponent has had its own valid meld already on the
    // table by this point in every capture run this phase (its hand and
    // dealing are deterministic in this environment) -- if so, that alone
    // already satisfies "a valid table set" with zero moves from me. If
    // not, build a real 3-tile set of my own; it may or may not happen to
    // be a genuine run/group (the 3 tiles are arbitrary, not chosen for
    // meldability), so this is a documented, honest substitution either
    // way rather than a guarantee.
    const boardAlreadyHasValidSet = await page
      .getByText(/-- valid (run|group)/)
      .first()
      .isVisible()
      .catch(() => false);

    if (!boardAlreadyHasValidSet) {
      substitutions.push(
        "tabletop-valid-set: the computer opponent had no meld on the table this deal -- captured a self-built 3-tile set instead, which may or may not itself be a genuine valid run/group (its 3 tiles were not selected for meldability; see the caption in the screenshot).",
      );
      await buildSetOfSize(3);
    }

    // 3 (closure item). A valid table set (the computer opponent's, or the
    // documented substitute above).
    await capture("tabletop-valid-set", page);

    // A set of my own, so Commit turn is enabled (draft.sets.length > 0 --
    // TabletopPage.tsx -- which the computer opponent's own prior meld
    // never counts toward) and there are multiple sets on the table
    // either way.
    await buildSetOfSize(2);
    await capture("tabletop-commit-enabled", page);

    // 9 (closure item). A second set alongside the first.
    await capture("tabletop-multiple-sets", page);

    // 2 (closure item). Active drop-target / drag-in-progress, per
    // viewport. A true mid-drag frame IS captured here (mouse held down,
    // not released) rather than a static substitute -- re-done per
    // viewport since resizing mid-drag would leave stale coordinates.
    // Each viewport drags a different spare rack tile onto the "start a
    // new set" zone and completes the drop after the screenshot (cheap,
    // harmless in a disposable game).
    for (const [label, size] of Object.entries(VIEWPORTS)) {
      await page.setViewportSize(size);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150);
      try {
        const spareRack = page.locator('[aria-label="Your rack"] .tile');
        const source = spareRack.first();
        const target = page.locator('[aria-label="Start a new set"]');
        await source.scrollIntoViewIfNeeded();
        const sourceBox = await source.boundingBox();
        await target.scrollIntoViewIfNeeded();
        const targetBox = await target.boundingBox();
        if (!sourceBox || !targetBox) throw new Error("drag-state: missing bounding box");
        const startX = sourceBox.x + sourceBox.width / 2;
        const startY = sourceBox.y + sourceBox.height / 2;
        const endX = targetBox.x + targetBox.width / 2;
        const endY = targetBox.y + targetBox.height / 2;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 20, startY + 20, { steps: 5 });
        await page.mouse.move(endX, endY, { steps: 10 });
        await page.waitForTimeout(100);
        const file = `tabletop-drag-active--${label}.png`;
        await page.screenshot({ path: path.join(OUT_DIR, file), fullPage: true });
        captured.push(file);
        await page.mouse.up();
        await page.waitForTimeout(100);
      } catch (err) {
        missing.push(`tabletop-drag-active--${label} -- ${(err as Error).message}`);
        console.error(`FAILED: tabletop-drag-active--${label}: ${(err as Error).message}`);
        await page.mouse.up().catch(() => {});
      }
    }
    console.log("captured: tabletop-drag-active");

    // 10 (closure item). Chat expanded with representative disposable
    // messages -- fake, clearly-test content only.
    await capture("tabletop-chat-messages", page, async () => {
      const input = page.getByPlaceholder("Say something…");
      const send = page.getByRole("button", { name: "Send" });
      for (const text of ["Nice move!", "gg", "Phase 4 review test message"]) {
        await input.fill(text);
        await send.click();
        await page.getByText(text).first().waitFor({ timeout: 5000 });
      }
    });

    // 5. Tabletop, completed game + one-click Rematch (Phase 4: .card--accent-gold).
    await capture("tabletop-completed-rematch", page, async () => {
      await page.getByRole("button", { name: "Resign" }).click();
      await page.getByRole("button", { name: "Confirm resign" }).click();
      await page.getByRole("heading", { name: "Game over" }).waitFor({ timeout: 10000 });
    });

    await context.close();

    // 6. Unavailable/error game state.
    const errorContext = await browser.newContext({ baseURL: BASE_URL });
    const errorPage = await errorContext.newPage();
    await capture("tabletop-unavailable-game", errorPage, async () => {
      await waitForReady(errorPage);
      await claimUsername(errorPage, "Phase4ReviewErr");
      await errorPage.goto("/games/00000000-0000-0000-0000-000000000000");
      await errorPage.getByText(/doesn't exist|no longer available/i).waitFor();
    });
    await errorContext.close();
  } finally {
    // Always close the browser, even on an uncaught error in setup above
    // (not just the per-state failures `capture()` already tolerates) --
    // an unclosed headless Chromium keeps this process alive indefinitely.
    await browser.close();
  }

  console.log(`\n${captured.length} screenshots captured to ${OUT_DIR}`);
  if (substitutions.length > 0) {
    console.log(`\n${substitutions.length} documented substitution(s):`);
    for (const s of substitutions) console.log(`  - ${s}`);
  }
  if (missing.length > 0) {
    console.error(`\n${missing.length} state(s) FAILED to capture:`);
    for (const m of missing) console.error(`  - ${m}`);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
