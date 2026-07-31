// Meld Masters stabilization pass -- visual regression capture for the two
// genuinely NEW representative states this pass added: a live reconnecting
// state, and game completion with the new durable winner identification.
// Every other required state (normal active turn, invalid arrangement,
// expanded chat, long player names) is already covered by
// capture-tabletop-arcade-integration.ts's regular captures.
//
// Usage: pnpm exec tsx e2e/scripts/capture-tabletop-state-review.ts [outDir]
// Both the server and Vite dev servers must already be running.

import { chromium, type Browser } from "@playwright/test";
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
const DESKTOP = { width: 1440, height: 900 };

async function run(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const browser: Browser = await chromium.launch();

  try {
    // 1. Reconnecting state -- a real network drop, not a CSS class toggle.
    {
      const h = await browser.newContext({ baseURL: BASE_URL });
      const g = await browser.newContext({ baseURL: BASE_URL });
      const hp = await h.newPage();
      const gp = await g.newPage();
      await waitForReady(hp);
      await waitForReady(gp);
      const host = await claimUsername(hp, "StateHost" + Math.random().toString(36).slice(2, 6));
      await claimUsername(gp, "StateGuest" + Math.random().toString(36).slice(2, 6));
      await hp.getByRole("link", { name: "Create Room" }).click();
      await hp.getByRole("radio", { name: "2 players" }).check();
      await hp.getByRole("radio", { name: "Private (invite by code)" }).check();
      await clickUntilSettled(
        hp,
        hp.getByRole("button", { name: "Create room" }),
        hp.getByRole("heading", { name: host }),
      );
      await joinRoomByName(gp, host);
      await hp.waitForURL(/\/games\//, { timeout: 15000 });
      await hp.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });
      await hp.setViewportSize(DESKTOP);

      await hp.context().setOffline(true);
      try {
        await hp.locator(".tabletop-status").getByText("Reconnecting…").waitFor({ timeout: 60000 });
        await hp.waitForTimeout(150);
        await hp.screenshot({
          path: path.join(OUT_DIR, "tabletop-reconnecting--desktop.png"),
          fullPage: true,
        });
        console.log("captured: tabletop-reconnecting--desktop");
      } finally {
        await hp.context().setOffline(false);
      }
      await h.close();
      await g.close();
    }

    // 2. Completion with winner identification (via resignation, the
    // deterministic path -- same pattern as the earlier phase capture
    // scripts).
    {
      const h = await browser.newContext({ baseURL: BASE_URL });
      const g = await browser.newContext({ baseURL: BASE_URL });
      const hp = await h.newPage();
      const gp = await g.newPage();
      await waitForReady(hp);
      await waitForReady(gp);
      const host = await claimUsername(hp, "WinHost" + Math.random().toString(36).slice(2, 6));
      await claimUsername(gp, "WinGuest" + Math.random().toString(36).slice(2, 6));
      await hp.getByRole("link", { name: "Create Room" }).click();
      await hp.getByRole("radio", { name: "2 players" }).check();
      await hp.getByRole("radio", { name: "Private (invite by code)" }).check();
      await clickUntilSettled(
        hp,
        hp.getByRole("button", { name: "Create room" }),
        hp.getByRole("heading", { name: host }),
      );
      await joinRoomByName(gp, host);
      await hp.waitForURL(/\/games\//, { timeout: 15000 });
      await gp.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });
      await hp.getByRole("heading", { name: "Your rack (14)" }).waitFor({ timeout: 15000 });

      await gp.getByRole("button", { name: "Resign" }).click();
      await gp.getByRole("button", { name: "Confirm resign" }).click();
      await hp.getByRole("heading", { name: "Game over" }).waitFor({ timeout: 15000 });
      await hp.setViewportSize(DESKTOP);
      await hp.waitForTimeout(150);
      await hp.screenshot({
        path: path.join(OUT_DIR, "tabletop-completed-winner--desktop.png"),
        fullPage: true,
      });
      console.log("captured: tabletop-completed-winner--desktop");
      await h.close();
      await g.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\nDone. Screenshots in ${OUT_DIR}`);
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
