import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { waitForReady, claimUsername } from "./helpers.js";

// Phase 7 -- a purged (retention-deleted) game is server-indistinguishable
// from a gameId that never existed at all: both fail the exact same
// findGameSeatForPlayer check (apps/server/src/http/routes/games.ts /
// realtime/gateway.ts's game:join handler), so navigating straight to a
// random, never-issued gameId exercises the identical "unavailable game"
// code path retention relies on -- without needing a production-only or
// test-only backdoor to actually trigger the 48-hour sweep.

test("direct navigation to a nonexistent/unavailable game shows a clear message and a route home, with no serious accessibility violations", async ({
  page,
}) => {
  await waitForReady(page);
  await claimUsername(page, "PurgedNav");

  await page.goto("/games/00000000-0000-0000-0000-000000000000");

  await expect(page.getByText(/doesn't exist|no longer available/i)).toBeVisible();
  const homeLink = page.getByRole("link", { name: /back home/i });
  await expect(homeLink).toBeVisible();

  // No endless spinner -- the "Loading table…" placeholder is gone once the
  // unavailable state has rendered.
  await expect(page.getByText("Loading table…")).toHaveCount(0);

  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

  await homeLink.click();
  await expect(page.getByRole("heading", { level: 1, name: "Tile Meld" })).toBeVisible();
});
