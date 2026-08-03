// Captures the arcade screens at the contract viewports for the
// concept-fidelity review loop. Raw captures land in
// docs/design-reference/arcade-review/<screen>/app--<viewport>.png;
// run scripts/build-arcade-comparisons.py afterwards to composite the
// triptych/silhouette sheets against the concept spec.
//
// Usage (both dev servers must already be running -- see docs/environment.md):
//   pnpm exec tsx e2e/scripts/arcade/capture-arcade-screens.ts [screen...]
//
// Screens default to every entry in SCREENS. Chromium only, per the
// machine-freeze incident recorded in docs/current-state.md.

import { chromium, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACT_VIEWPORTS } from "./viewports.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REVIEW_ROOT = path.resolve(HERE, "../../../docs/design-reference/arcade-review");
const BASE_URL = process.env.ARCADE_BASE_URL ?? "http://localhost:5173";

interface ScreenSpec {
  name: string;
  path: string;
  /** Wait for this to consider the screen settled. */
  ready: (page: Page) => Promise<void>;
}

const SCREENS: ScreenSpec[] = [
  {
    name: "home",
    path: "/",
    ready: async (page) => {
      await page.getByRole("heading", { name: "Meld Masters", level: 1 }).waitFor();
    },
  },
  {
    name: "create-room",
    path: "/rooms/new",
    ready: async (page) => {
      await page.getByRole("heading", { level: 1 }).first().waitFor();
    },
  },
  {
    name: "join-room",
    path: "/rooms/join",
    ready: async (page) => {
      await page.getByRole("heading", { level: 1 }).first().waitFor();
    },
  },
  {
    name: "public-lobby",
    path: "/lobby",
    ready: async (page) => {
      await page.getByRole("heading", { level: 1 }).first().waitFor();
    },
  },
  {
    name: "recovery",
    path: "/recovery",
    ready: async (page) => {
      await page.getByRole("heading", { level: 1 }).first().waitFor();
    },
  },
];

async function main() {
  const requested = process.argv.slice(2);
  const screens = requested.length ? SCREENS.filter((s) => requested.includes(s.name)) : SCREENS;
  if (requested.length && screens.length !== requested.length) {
    const known = new Set(SCREENS.map((s) => s.name));
    throw new Error(`unknown screen(s): ${requested.filter((r) => !known.has(r)).join(", ")}`);
  }

  const browser = await chromium.launch();
  try {
    for (const screen of screens) {
      const outDir = path.join(REVIEW_ROOT, screen.name);
      await mkdir(outDir, { recursive: true });
      for (const viewport of CONTRACT_VIEWPORTS) {
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
        });
        await page.goto(`${BASE_URL}${screen.path}`);
        await screen.ready(page);
        await page.waitForTimeout(1200); // fonts, images, layout settle
        const file = path.join(outDir, `app--${viewport.name}.png`);
        await page.screenshot({ path: file, fullPage: false });
        console.log(`captured ${path.relative(process.cwd(), file)}`);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

await main();
