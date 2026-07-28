// Meld Masters visual refresh -- Phase 6 review screenshots: Home page at
// two viewports, to confirm the metadata-only changes (favicon/manifest/
// theme-color) didn't disturb the existing interface. Standalone script,
// kept outside e2e/tests like the other capture-phase-N scripts.
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Resolved from this file's own location, not process.cwd() (which
// silently produced a wrong path the first time this ran from the repo
// root instead of e2e/) -- same anchoring approach as the other
// capture-phase-N-review.ts scripts.
const OUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/design-reference/phase-6-review",
);

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: "http://localhost:5173" });
const page = await context.newPage();
await page.goto("/");
await page.getByRole("heading", { name: "Meld Masters", level: 1 }).waitFor();

for (const [label, size] of [
  ["1440x900", { width: 1440, height: 900 }],
  ["390x844", { width: 390, height: 844 }],
] as const) {
  await page.setViewportSize(size);
  await page.waitForTimeout(150);
  await page.screenshot({
    path: path.join(OUT_DIR, `home--${label}.png`),
    fullPage: true,
  });
  console.log(`captured home--${label}`);
}

await browser.close();
