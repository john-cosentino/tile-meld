// Builds side-by-side and blurred-silhouette comparison sheets for the
// static tabletop concept prototype checkpoint. Same technique as
// build-tabletop-comparisons.ts (data-URI images composited into an HTML
// page, screenshotted by Playwright) plus a second, blurred/desaturated
// variant per the brief's "blur and silhouette test" requirement.
//
// Usage: pnpm exec tsx e2e/scripts/build-tabletop-prototype-comparisons.ts
// Run capture-tabletop-static-prototype.ts first.

import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REVIEW_DIR = path.resolve(HERE, "../../docs/design-reference/tabletop-static-prototype-review");
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
    conceptLabel: "Concept 01 (binding desktop target)",
    screenshotFile: "prototype--desktop-1440x900.png",
    viewportWidth: 2600,
  },
  {
    label: "desktop-1280x720",
    conceptFile: "meld-masters-concept-01.png",
    conceptLabel: "Concept 01 (binding desktop target)",
    screenshotFile: "prototype--desktop-1280x720.png",
    viewportWidth: 2400,
  },
  {
    label: "phone-390x844",
    conceptFile: "meld-masters-concept-04.png",
    conceptLabel: "Concept 04 (binding phone target)",
    screenshotFile: "prototype--phone-390x844.png",
    viewportWidth: 1200,
  },
  {
    label: "phone-landscape-844x390",
    conceptFile: "meld-masters-concept-04.png",
    conceptLabel: "Concept 04 (binding phone target)",
    screenshotFile: "prototype--phone-landscape-844x390.png",
    viewportWidth: 2000,
  },
];

// Only the two viewports the brief explicitly asks a silhouette test for.
const SILHOUETTE_PAIRS: Pair[] = [PAIRS[0]!, PAIRS[2]!];

function toDataUri(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function comparisonHtml(pair: Pair, conceptUri: string, screenshotUri: string): string {
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
  <h1>Static tabletop concept prototype -- ${pair.label}</h1>
  <div class="row">
    <figure><img src="${conceptUri}" alt=""><figcaption>${pair.conceptLabel}</figcaption></figure>
    <figure><img src="${screenshotUri}" alt=""><figcaption>Prototype -- ${pair.screenshotFile}</figcaption></figure>
  </div>
</body></html>`;
}

function silhouetteHtml(pair: Pair, conceptUri: string, screenshotUri: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>silhouette-${pair.label}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; background: #10131a; font-family: system-ui, sans-serif; color: #eef2fb; }
  h1 { font-size: 20px; margin: 0 0 20px; }
  .row { display: flex; align-items: flex-start; gap: 24px; }
  figure { margin: 0; flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
  figcaption { font-size: 14px; color: #9fb0c9; text-align: center; }
  img { width: 100%; height: auto; max-height: 1400px; object-fit: contain; border: 1px solid #2a3550; background: #05070c;
        filter: blur(14px) grayscale(0.5) contrast(1.1); }
</style></head>
<body>
  <h1>Silhouette / massing comparison (blurred) -- ${pair.label}</h1>
  <div class="row">
    <figure><img src="${conceptUri}" alt=""><figcaption>${pair.conceptLabel} (blurred)</figcaption></figure>
    <figure><img src="${screenshotUri}" alt=""><figcaption>Prototype (blurred)</figcaption></figure>
  </div>
</body></html>`;
}

async function renderSheet(
  page: import("@playwright/test").Page,
  html: string,
  viewportWidth: number,
  outPath: string,
  tmpName: string,
): Promise<void> {
  const htmlPath = path.join(tmpdir(), tmpName);
  await writeFile(htmlPath, html, "utf8");
  await page.setViewportSize({ width: viewportWidth, height: 1000 });
  await page.goto(`file://${htmlPath}`);
  await page.screenshot({ path: outPath, fullPage: true });
  await unlink(htmlPath);
  console.log(`built: ${outPath}`);
}

async function run(): Promise<void> {
  await mkdir(REVIEW_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();

    for (const pair of PAIRS) {
      const conceptBuf = await readFile(path.join(CONCEPT_DIR, pair.conceptFile));
      const screenshotBuf = await readFile(path.join(REVIEW_DIR, pair.screenshotFile));
      const html = comparisonHtml(pair, toDataUri(conceptBuf), toDataUri(screenshotBuf));
      await renderSheet(
        page,
        html,
        pair.viewportWidth,
        path.join(REVIEW_DIR, `comparison--${pair.label}.png`),
        `prototype-comparison-${pair.label}.html`,
      );
    }

    for (const pair of SILHOUETTE_PAIRS) {
      const conceptBuf = await readFile(path.join(CONCEPT_DIR, pair.conceptFile));
      const screenshotBuf = await readFile(path.join(REVIEW_DIR, pair.screenshotFile));
      const html = silhouetteHtml(pair, toDataUri(conceptBuf), toDataUri(screenshotBuf));
      await renderSheet(
        page,
        html,
        pair.viewportWidth,
        path.join(REVIEW_DIR, `silhouette--${pair.label}.png`),
        `prototype-silhouette-${pair.label}.html`,
      );
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
