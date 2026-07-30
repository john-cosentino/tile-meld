// Builds side-by-side comparison sheets (concept art next to the
// implementation screenshot) for the tabletop visual-fidelity checkpoint.
// Reads the four screenshots capture-tabletop-fidelity.ts produces, pairs
// each with its bound concept reference, and renders an HTML page (two
// <img> tags, `object-fit: contain` so neither image is cropped) which
// Playwright then screenshots as the actual comparison sheet PNG.
//
// Usage: pnpm exec tsx e2e/scripts/build-tabletop-comparisons.ts
// Run capture-tabletop-fidelity.ts first.

import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.resolve(HERE, "../../docs/design-reference/tabletop-fidelity-review");
const CONCEPT_DIR = path.resolve(HERE, "../../docs/design-reference/meld-masters");

type Pair = {
  label: string;
  conceptFile: string;
  conceptLabel: string;
  screenshotFile: string;
  viewportWidth: number;
};

const PAIRS: Pair[] = [
  {
    label: "desktop-1440x900",
    conceptFile: "meld-masters-concept-01.png",
    conceptLabel: "Concept 01 (binding desktop composition)",
    screenshotFile: "tabletop--1440x900.png",
    viewportWidth: 2600,
  },
  {
    label: "desktop-1280x720",
    conceptFile: "meld-masters-concept-01.png",
    conceptLabel: "Concept 01 (binding desktop composition)",
    screenshotFile: "tabletop--1280x720.png",
    viewportWidth: 2400,
  },
  {
    label: "mobile-390x844",
    conceptFile: "meld-masters-concept-04.png",
    conceptLabel: "Concept 04 (binding phone composition/portrait direction)",
    screenshotFile: "tabletop--390x844.png",
    viewportWidth: 1200,
  },
  {
    label: "mobile-844x390-landscape",
    conceptFile: "meld-masters-concept-04.png",
    conceptLabel: "Concept 04 (binding phone composition/portrait direction)",
    screenshotFile: "tabletop--844x390.png",
    viewportWidth: 2000,
  },
];

function toDataUri(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function pageHtml(pair: Pair, conceptUri: string, screenshotUri: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${pair.label}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; background: #10131a; font-family: system-ui, sans-serif; color: #eef2fb; }
  h1 { font-size: 20px; margin: 0 0 20px; }
  .row { display: flex; align-items: flex-start; gap: 24px; }
  figure { margin: 0; flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
  figcaption { font-size: 14px; color: #9fb0c9; text-align: center; }
  img { width: 100%; height: auto; max-height: 1400px; object-fit: contain; border: 1px solid #2a3550; background: #05070c; }
</style></head>
<body>
  <h1>Tabletop visual-fidelity checkpoint -- ${pair.label}</h1>
  <div class="row">
    <figure><img src="${conceptUri}" alt=""><figcaption>${pair.conceptLabel}</figcaption></figure>
    <figure><img src="${screenshotUri}" alt=""><figcaption>Implementation -- ${pair.screenshotFile}</figcaption></figure>
  </div>
</body></html>`;
}

async function run(): Promise<void> {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const pair of PAIRS) {
      const conceptBuf = await readFile(path.join(CONCEPT_DIR, pair.conceptFile));
      const screenshotPath = path.join(SCREENSHOT_DIR, pair.screenshotFile);
      const screenshotBuf = await readFile(screenshotPath);
      const html = pageHtml(pair, toDataUri(conceptBuf), toDataUri(screenshotBuf));
      const htmlPath = path.join(tmpdir(), `tabletop-comparison-${pair.label}.html`);
      await writeFile(htmlPath, html, "utf8");
      await page.setViewportSize({ width: pair.viewportWidth, height: 1000 });
      await page.goto(`file://${htmlPath}`);
      const outPath = path.join(SCREENSHOT_DIR, `comparison--${pair.label}.png`);
      await page.screenshot({ path: outPath, fullPage: true });
      await unlink(htmlPath);
      console.log(`built: ${outPath}`);
    }
    await page.close();
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
