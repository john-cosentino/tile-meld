import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// Objective composition check for the arcade rebuild: each region map in
// docs/design-reference/region-maps/ declares where the concept art puts
// every major region (as source-pixel rects); the rebuilt screens tag those
// regions with data-region attributes. This spec asserts the live bounding
// boxes land within tolerance of the concept's proportions.
//
// Run chromium-only (the full matrix is forbidden locally -- see
// docs/current-state.md):  pnpm run test:arcade
//
// A screen whose route has no [data-region] elements yet (not rebuilt) is
// skipped, so this spec can land ahead of the screens it will guard.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAPS_DIR = path.resolve(HERE, "../../docs/design-reference/region-maps");

interface RegionMap {
  screen: string;
  path: string;
  viewport: { width: number; height: number };
  sourceSize: [number, number];
  tolerance: number;
  regions: Record<string, [number, number, number, number]>;
}

const maps: RegionMap[] = readdirSync(MAPS_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(path.join(MAPS_DIR, f), "utf8")) as RegionMap);

for (const map of maps) {
  const name = `${map.screen} @ ${map.viewport.width}x${map.viewport.height}`;

  test(`region layout: ${name}`, async ({ page }) => {
    test.skip(map.path.includes(":"), "parameterized route needs a seeded game (Phase 5 wiring)");

    await page.setViewportSize(map.viewport);
    await page.goto(map.path);
    await page.waitForLoadState("networkidle");

    const tagged = await page.locator("[data-region]").count();
    test.skip(tagged === 0, `screen not rebuilt yet (no [data-region] elements)`);

    const [srcW, srcH] = map.sourceSize;
    for (const [region, [x, y, w, h]] of Object.entries(map.regions)) {
      const locator = page.locator(`[data-region="${region}"]`);
      await expect(locator, `region "${region}" missing`).toHaveCount(1);
      const box = await locator.boundingBox();
      expect(box, `region "${region}" not visible`).not.toBeNull();
      if (!box) continue;

      const expected = {
        x: (x / srcW) * map.viewport.width,
        y: (y / srcH) * map.viewport.height,
        w: (w / srcW) * map.viewport.width,
        h: (h / srcH) * map.viewport.height,
      };
      const tolX = map.tolerance * map.viewport.width;
      const tolY = map.tolerance * map.viewport.height;
      const label = (axis: string, got: number, want: number) =>
        `region "${region}" ${axis}: got ${Math.round(got)}, concept expects ~${Math.round(want)}`;

      expect
        .soft(Math.abs(box.x - expected.x), label("x", box.x, expected.x))
        .toBeLessThanOrEqual(tolX);
      expect
        .soft(Math.abs(box.y - expected.y), label("y", box.y, expected.y))
        .toBeLessThanOrEqual(tolY);
      expect
        .soft(Math.abs(box.width - expected.w), label("width", box.width, expected.w))
        .toBeLessThanOrEqual(tolX);
      expect
        .soft(Math.abs(box.height - expected.h), label("height", box.height, expected.h))
        .toBeLessThanOrEqual(tolY);
    }
  });
}
