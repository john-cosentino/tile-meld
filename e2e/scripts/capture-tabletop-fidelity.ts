// Tabletop visual-fidelity checkpoint (docs/meld-masters-tabletop-fidelity-
// summary.md, rebuilding the tabletop layout against the approved concept
// art under docs/design-reference/meld-masters/). Standalone script, same
// pattern as the existing capture-phase-N-review.ts scripts. Captures the
// live active tabletop at exactly the four viewports the checkpoint
// requires -- viewport-only (not fullPage), since the point is confirming
// the composition actually uses the available viewport, not documenting
// off-screen scroll content. Every identity/room this script creates is
// disposable test data.
//
// Usage: pnpm exec tsx e2e/scripts/capture-tabletop-fidelity.ts [outDir]
// Both the server and Vite dev servers must already be running.

import { chromium, type Page } from "@playwright/test";
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
      "../../docs/design-reference/tabletop-fidelity-review",
    ),
);

// The four viewports the checkpoint requires (task brief's "Required visual
// checkpoint" section) -- not the broader phase-N-review viewport set.
const VIEWPORTS: Record<string, { width: number; height: number }> = {
  "1440x900": { width: 1440, height: 900 },
  "1280x720": { width: 1280, height: 720 },
  "390x844": { width: 390, height: 844 },
  "844x390": { width: 844, height: 390 },
};

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

/** Same deterministic triple-finder as capture-phase-8-final.ts -- reads the
 * real dealt hand rather than fabricating one, so the board in the
 * screenshots reflects an actually-reachable game state. */
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

/** Best-effort: place up to two sets on the board so the screenshot shows a
 * populated table, matching the concept art's "several sets already on the
 * table" composition. Never fails the run if this particular random hand
 * has no valid combination -- the capture just proceeds with an empty
 * board, which is still an honest, reachable state. */
async function tryPopulateBoard(page: Page): Promise<void> {
  try {
    const rack = await readRackTiles(page);
    const triple = findValidTriple(rack);
    if (!triple) return;
    await placeIntoNewSet(page, triple[0]!);
    await placeIntoSet(page, triple[1]!, 1);
    await placeIntoSet(page, triple[2]!, 1);
    await page.getByText(/^Set 1 --/).waitFor({ timeout: 5000 });

    const remaining = await readRackTiles(page);
    const secondTriple = findValidTriple(remaining.filter((t) => !triple.includes(t.label)));
    if (secondTriple) {
      await placeIntoNewSet(page, secondTriple[0]!);
      await placeIntoSet(page, secondTriple[1]!, 2);
      await placeIntoSet(page, secondTriple[2]!, 2);
      await page.getByText(/^Set 2 --/).waitFor({ timeout: 5000 });
    }
  } catch (err) {
    console.error(`(non-fatal) could not populate the board: ${(err as Error).message}`);
  }
}

async function run(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const hostContext = await browser.newContext({ baseURL: BASE_URL });
    const guestContext = await browser.newContext({ baseURL: BASE_URL });
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();
    await waitForReady(hostPage);
    await waitForReady(guestPage);
    const hostUsername = await claimUsername(hostPage, "FidelityHost");
    await claimUsername(guestPage, "FidelityGuest");
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
    await hostPage.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });
    await guestPage.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });

    const activePage = (await hostPage.getByText("Your turn", { exact: true }).isVisible())
      ? hostPage
      : guestPage;

    await tryPopulateBoard(activePage);

    for (const [label, size] of Object.entries(VIEWPORTS)) {
      await activePage.setViewportSize(size);
      await activePage.evaluate(() => window.scrollTo(0, 0));
      await activePage.waitForTimeout(200);
      const file = path.join(OUT_DIR, `tabletop--${label}.png`);
      await activePage.screenshot({ path: file, fullPage: false });
      console.log(`captured: ${file}`);
    }

    await hostContext.close();
    await guestContext.close();
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
