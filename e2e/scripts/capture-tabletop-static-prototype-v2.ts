// Static tabletop concept prototype -- v2 refinement pass screenshot
// capture + route-load smoke check
// (docs/meld-masters-tabletop-static-prototype-v2-summary.md). Same
// pattern as capture-tabletop-static-prototype.ts, writing to a NEW
// review-v2 directory (the v1 directory is left untouched) and adding a
// third overlay/silhouette pair for the now-dedicated phone-landscape
// layout.
//
// Usage: pnpm exec tsx e2e/scripts/capture-tabletop-static-prototype-v2.ts [outDir]
// The Vite dev server must already be running (`pnpm --filter @tile-meld/web run dev`).
// The API server is NOT required -- this route makes no requests.

import { chromium, devices, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = process.env.BASELINE_BASE_URL ?? "http://localhost:5173";
const ROUTE = "/prototype/tabletop-concept";
const OUT_DIR = path.resolve(
  process.argv[2] ??
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../docs/design-reference/tabletop-static-prototype-review-v2",
    ),
);

const VIEWPORTS: Record<string, { width: number; height: number }> = {
  "desktop-1440x900": { width: 1440, height: 900 },
  "desktop-1280x720": { width: 1280, height: 720 },
  "phone-390x844": { width: 390, height: 844 },
  "phone-landscape-844x390": { width: 844, height: 390 },
};

async function assertRouteLoaded(page: Page, label: string): Promise<void> {
  await page.goto(ROUTE);
  await page.waitForTimeout(400); // first-hit dev-server transform of a large new tree
  await page.locator(".concept-artboard-canvas").waitFor({ state: "visible", timeout: 15000 });
  await page.locator(".concept-masthead").waitFor({ state: "visible" });
  await page.locator(".concept-board").waitFor({ state: "visible" });
  await page.locator(".concept-rack").waitFor({ state: "visible" });
  await page.locator(".concept-actions").waitFor({ state: "visible" });
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.waitForTimeout(200);
  if (consoleErrors.length > 0) {
    throw new Error(`${label}: console errors present: ${consoleErrors.join(" | ")}`);
  }
  console.log(`route-load check passed: ${label}`);
}

async function hideOverlayPanel(page: Page): Promise<void> {
  await page.addStyleTag({ content: ".concept-overlay-panel { display: none !important; }" });
}

async function run(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  // 1. Chromium route-load check (desktop viewport).
  const desktopContext = await browser.newContext({ baseURL: BASE_URL });
  const desktopPage = await desktopContext.newPage();
  await desktopPage.setViewportSize(VIEWPORTS["desktop-1440x900"]!);
  await assertRouteLoaded(desktopPage, "chromium desktop");

  // 2. Mobile Chrome route-load check (Pixel 7 device emulation).
  const mobileContext = await browser.newContext({ baseURL: BASE_URL, ...devices["Pixel 7"] });
  const mobilePage = await mobileContext.newPage();
  await assertRouteLoaded(mobilePage, "mobile-chrome (Pixel 7)");
  await mobileContext.close();

  // 3. Raw screenshots at the four required viewports.
  for (const [label, size] of Object.entries(VIEWPORTS)) {
    await desktopPage.setViewportSize(size);
    await desktopPage.waitForTimeout(250);
    await hideOverlayPanel(desktopPage);
    const file = path.join(OUT_DIR, `prototype--${label}.png`);
    await desktopPage.screenshot({ path: file, fullPage: false });
    console.log(`captured: ${file}`);
  }

  // 4. Overlay screenshots at ~50% opacity -- desktop, phone portrait, AND
  // phone landscape (new in v2 -- the landscape layout is now a dedicated
  // composition worth checking against the concept independently).
  async function captureOverlay(
    label: string,
    size: { width: number; height: number },
    concept: "Concept 01 (desktop)" | "Concept 04 (phone)",
  ): Promise<void> {
    await desktopPage.goto(ROUTE);
    await desktopPage.setViewportSize(size);
    await desktopPage.waitForTimeout(400);
    await desktopPage.getByText("Show overlay").click();
    await desktopPage.getByText(concept, { exact: true }).click();
    await desktopPage.locator('input[type="range"]').fill("50");
    await desktopPage.waitForTimeout(300);
    await hideOverlayPanel(desktopPage);
    const file = path.join(OUT_DIR, `overlay--${label}.png`);
    await desktopPage.screenshot({ path: file, fullPage: false });
    console.log(`captured: ${file}`);
  }
  await captureOverlay("desktop-1440x900", VIEWPORTS["desktop-1440x900"]!, "Concept 01 (desktop)");
  await captureOverlay("phone-390x844", VIEWPORTS["phone-390x844"]!, "Concept 04 (phone)");
  await captureOverlay(
    "phone-landscape-844x390",
    VIEWPORTS["phone-landscape-844x390"]!,
    "Concept 04 (phone)",
  );

  await desktopContext.close();
  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
