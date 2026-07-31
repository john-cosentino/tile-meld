// Meld Masters arcade integration -- quick visual capture of the real,
// live TabletopPage after the ChatGPT production-asset integration
// (docs/design-reference/chatgpt/). Standalone, disposable-data script
// (same pattern as capture-phase-8-final.ts), scoped to just the
// tabletop screen at the 3 contract viewports rather than the whole
// site, since that is the only screen this pass touched.
//
// Usage: pnpm exec tsx e2e/scripts/capture-tabletop-arcade-integration.ts [outDir]
// Both the server and Vite dev servers must already be running.

import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  waitForReady,
  claimUsername,
  joinRoomByName,
  clickUntilSettled,
} from "../tests/helpers.js";

const BASE_URL = process.env.BASELINE_BASE_URL ?? "http://localhost:5173";
const OUT_DIR = path.resolve(
  process.argv[2] ??
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../docs/design-reference/tabletop-arcade-integration-review",
    ),
);

const VIEWPORTS: Record<string, { width: number; height: number }> = {
  "desktop-1440x900": { width: 1440, height: 900 },
  "phone-portrait-390x844": { width: 390, height: 844 },
  "phone-landscape-844x390": { width: 844, height: 390 },
};

async function shoot(page: Page, name: string): Promise<void> {
  for (const [label, size] of Object.entries(VIEWPORTS)) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT_DIR, `${name}--${label}.png`), fullPage: true });
    console.log(`captured: ${name}--${label}`);
  }
}

// Same pattern as capture-phase-8-final.ts's own helpers -- finds a real,
// valid run/group in whatever hand this run's random deal actually
// produced, rather than fabricating one. Draw and Pass are mutually
// exclusive by game rule (Draw requires pool > 0, Pass requires pool ===
// 0), so they can never both be enabled at once -- Draw + Commit is the
// strongest simultaneous state actually reachable.
type ParsedTile = { label: string; color?: string; value?: number; isJoker: boolean };

async function readRackTiles(page: Page): Promise<ParsedTile[]> {
  const labels = await page
    .locator(".tabletop-rack .tile")
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  return labels.map((label) => {
    if (/joker/i.test(label)) return { label, isJoker: true };
    const m = /^(\w+)\s+(\d+)$/.exec(label);
    return m
      ? { label, color: m[1], value: Number(m[2]), isJoker: false }
      : { label, isJoker: false };
  });
}

function findValidTriple(tiles: ParsedTile[]): string[] | undefined {
  const numbered = tiles.filter(
    (t): t is ParsedTile & { color: string; value: number } => !t.isJoker && !!t.color,
  );
  const byValue = new Map<number, ParsedTile[]>();
  for (const t of numbered) byValue.set(t.value, [...(byValue.get(t.value) ?? []), t]);
  for (const group of byValue.values()) {
    const distinctColors = new Map<string, ParsedTile>();
    for (const t of group) distinctColors.set(t.color, t);
    if (distinctColors.size >= 3)
      return [...distinctColors.values()].slice(0, 3).map((t) => t.label);
  }
  const byColor = new Map<string, number[]>();
  for (const t of numbered) byColor.set(t.color, [...(byColor.get(t.color) ?? []), t.value]);
  for (const [color, values] of byColor) {
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    for (let i = 0; i + 2 < sorted.length; i++) {
      if (sorted[i + 1] === sorted[i]! + 1 && sorted[i + 2] === sorted[i]! + 2) {
        return [sorted[i], sorted[i + 1], sorted[i + 2]].map((v) => `${color} ${v}`);
      }
    }
  }
  return undefined;
}

async function placeIntoNewSet(page: Page, tileLabel: string): Promise<void> {
  await page.getByRole("button", { name: tileLabel, exact: true }).first().click();
  await page.getByRole("button", { name: /Start a new set/ }).click();
}
async function placeIntoSet(page: Page, tileLabel: string, setIndex: number): Promise<void> {
  await page.getByRole("button", { name: tileLabel, exact: true }).first().click();
  await page.locator(`[aria-label^="Set ${setIndex},"]`).first().click();
}

async function run(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const browser: Browser = await chromium.launch();
  try {
    const h2 = await browser.newContext({ baseURL: BASE_URL });
    const g2 = await browser.newContext({ baseURL: BASE_URL });
    const hp = await h2.newPage();
    const gp = await g2.newPage();
    await waitForReady(hp);
    await waitForReady(gp);
    const host2 = await claimUsername(hp, "ArcadeInt2Host");
    await claimUsername(gp, "ArcadeInt2Guest");
    await hp.getByRole("link", { name: "Create Room" }).click();
    await hp.getByRole("radio", { name: "2 players" }).check();
    await hp.getByRole("radio", { name: "Private (invite by code)" }).check();
    await clickUntilSettled(
      hp,
      hp.getByRole("button", { name: "Create room" }),
      hp.getByRole("heading", { name: host2 }),
    );
    await joinRoomByName(gp, host2);
    await hp.waitForURL(/\/games\//, { timeout: 15000 });
    await hp.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });
    await gp.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });

    const activePage = (await hp.getByText("Your turn", { exact: true }).isVisible()) ? hp : gp;

    await shoot(activePage, "tabletop-arcade");

    // A close-up of the action bar at desktop width, to check plate/icon rendering clearly.
    await activePage.setViewportSize(VIEWPORTS["desktop-1440x900"]);
    await activePage.locator(".tabletop-actions").scrollIntoViewIfNeeded();
    await activePage.waitForTimeout(150);
    await activePage.screenshot({
      path: path.join(OUT_DIR, "tabletop-actions-closeup--desktop.png"),
    });
    console.log("captured: tabletop-actions-closeup--desktop");

    // Enabled-state validation: place a real valid run/group (found in
    // this run's actual dealt hand, never fabricated) so Commit Turn
    // becomes genuinely enabled alongside Draw (pool is non-empty this
    // early in a fresh game, so Draw stays enabled too). Pass requires
    // pool === 0, mutually exclusive with Draw by game rule -- it stays
    // disabled here, which is the correct, expected state, not a flaw.
    const rackTiles = await readRackTiles(activePage);
    const validTriple = findValidTriple(rackTiles);
    if (validTriple) {
      await placeIntoNewSet(activePage, validTriple[0]!);
      await placeIntoSet(activePage, validTriple[1]!, 1);
      await placeIntoSet(activePage, validTriple[2]!, 1);
      await activePage.getByText(/^Set 1 --/).waitFor();
      const commitButton = activePage.getByRole("button", { name: "Commit turn" });
      await commitButton.waitFor({ state: "visible" });
      if (!(await commitButton.isEnabled())) {
        throw new Error("placed a valid triple but Commit turn is still disabled -- investigate");
      }
      await activePage.locator(".tabletop-actions").scrollIntoViewIfNeeded();
      await activePage.waitForTimeout(150);
      await activePage.screenshot({
        path: path.join(OUT_DIR, "tabletop-actions-enabled--desktop.png"),
      });
      console.log(
        `captured: tabletop-actions-enabled--desktop (Draw+Commit enabled via valid set [${validTriple.join(", ")}]; Pass correctly stays disabled -- pool > 0)`,
      );

      // Also capture Commit Turn's hover and keyboard-focus states while
      // it's genuinely enabled, not disabled -- both are otherwise
      // unverifiable from the standard capture above.
      await commitButton.hover();
      await activePage.waitForTimeout(100);
      await activePage.screenshot({
        path: path.join(OUT_DIR, "tabletop-commit-hover--desktop.png"),
      });
      console.log("captured: tabletop-commit-hover--desktop");

      // `.focus()` is a programmatic call and Chromium's :focus-visible
      // heuristic generally does NOT show the ring for that -- real
      // keyboard Tab navigation is what actually exercises the focus
      // style, so drive it with the keyboard instead of Locator.focus().
      let focusedCommit = false;
      for (let i = 0; i < 40 && !focusedCommit; i++) {
        await activePage.keyboard.press("Tab");
        focusedCommit = await activePage.evaluate(
          () => document.activeElement?.textContent?.trim() === "Commit turn",
        );
      }
      if (focusedCommit) {
        await activePage.waitForTimeout(100);
        await activePage.screenshot({
          path: path.join(OUT_DIR, "tabletop-commit-focus--desktop.png"),
        });
        console.log("captured: tabletop-commit-focus--desktop (real keyboard Tab navigation)");
      } else {
        console.log(
          "SKIPPED tabletop-commit-focus--desktop: could not Tab to Commit turn within 40 presses",
        );
      }
    } else {
      console.log(
        "SKIPPED tabletop-actions-enabled--desktop: this run's random 14-tile hand contained no valid run or group to legitimately enable Commit Turn with -- not fabricated. The baseline tabletop-actions-closeup--desktop.png already documents Draw-enabled/Pass-disabled/Commit-disabled, the other reachable combination.",
      );
    }

    await h2.close();
    await g2.close();
  } finally {
    await browser.close();
  }

  console.log(`\nDone. Screenshots in ${OUT_DIR}`);
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
