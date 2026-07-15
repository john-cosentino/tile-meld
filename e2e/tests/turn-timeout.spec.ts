import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { startTwoPlayerGame } from "./helpers.js";

// The server owns time via Postgres/Node Date.now(), with no test-only
// fast-forward hook exposed to the browser (plan Sec 8.1, D-SCHED: the
// deadline is a persisted `turns.deadline_at` column, settled by an
// embedded sweep loop every ~15s plus on-read/on-connect catch-up -- never
// an in-memory setTimeout, specifically so it survives a restart). Faking
// JS timers in the browser wouldn't touch the real server process, so the
// only way to exercise the real timeout path end to end is to push the
// real deadline into the past directly in Postgres and then wait for the
// real embedded sweep to notice and settle it, exactly as it would for an
// actual 4-hour-overdue turn.
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://tilemeld:tilemeld@localhost:5432/tilemeld";

test("an overdue turn is settled by the real deadline sweep: penalty tiles drawn, turn forfeited and handed off", async ({
  browser,
}) => {
  // Comfortably covers DEFAULT_SWEEP_INTERVAL_MS (15s,
  // apps/server/src/game/deadlineSweep.ts) plus setup/assertion time.
  test.setTimeout(60000);
  const { activePage, waitingPage } = await startTwoPlayerGame(browser);

  const gameId = /\/games\/([^/?#]+)/.exec(activePage.url())?.[1];
  expect(gameId).toBeTruthy();

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    const result = await db.query(
      `update turns set deadline_at = now() - interval '1 minute'
       where game_id = $1 and status = 'active'
       returning id`,
      [gameId],
    );
    expect(result.rowCount).toBe(1);
  } finally {
    await db.end();
  }

  // Neither page does anything -- this is purely the server's own embedded
  // sweep noticing the overdue deadline on its own schedule, not a client
  // action triggering on-read catch-up. A settled timeout only ever
  // reaches an already-open tab via the "game:patch" broadcast, which
  // useGame.ts's onGamePatch handler routes exclusively through the
  // aria-live announcer (announce(), AnnouncerProvider.tsx) -- there is no
  // separate visible banner for a passively-received event (unlike, say,
  // invalid-commit-penalty.spec.ts's banner, which is set directly from
  // the *acting* page's own commit() ack, a different code path). The
  // announcer is a single-slot region, and the very next "turn:started"
  // announcement (for the seat the turn hands off to) overwrites the
  // "timed out" text within the same second, making it too racy to assert
  // on reliably here -- the real, user-facing, non-racy proof that the
  // timeout was received and processed is the state change below (rack
  // count, turn handoff), which is what actually matters to a player.

  // The timed-out seat's rack grows from 14 to 17 (min(3, poolCount)
  // penalty draw, same shape as the invalid-commit penalty), and the turn
  // hands off to the other seat.
  await expect(activePage.getByRole("heading", { name: "Your rack (17)" })).toBeVisible({
    timeout: 25000,
  });
  await expect(activePage.getByText(/Waiting on seat/)).toBeVisible();
  await expect(waitingPage.getByText("Your turn", { exact: true })).toBeVisible();
});
