import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "../src/state/relativeTime.js";

const NOW = new Date("2026-07-20T12:00:00.000Z").getTime();

describe("formatRelativeTime", () => {
  it("reports under a minute as 'just now'", () => {
    expect(formatRelativeTime("2026-07-20T11:59:31.000Z", NOW)).toBe("just now");
  });

  it("pluralizes minutes correctly", () => {
    expect(formatRelativeTime("2026-07-20T11:59:00.000Z", NOW)).toBe("1 minute ago");
    expect(formatRelativeTime("2026-07-20T11:55:00.000Z", NOW)).toBe("5 minutes ago");
  });

  it("switches to hours past 60 minutes", () => {
    expect(formatRelativeTime("2026-07-20T11:00:00.000Z", NOW)).toBe("1 hour ago");
    expect(formatRelativeTime("2026-07-20T09:00:00.000Z", NOW)).toBe("3 hours ago");
  });

  it("switches to days past 24 hours", () => {
    expect(formatRelativeTime("2026-07-19T12:00:00.000Z", NOW)).toBe("1 day ago");
    expect(formatRelativeTime("2026-07-17T12:00:00.000Z", NOW)).toBe("3 days ago");
  });

  it("never reports a negative duration for a timestamp at or after now", () => {
    expect(formatRelativeTime("2026-07-20T12:00:00.000Z", NOW)).toBe("just now");
    expect(formatRelativeTime("2026-07-20T13:00:00.000Z", NOW)).toBe("just now");
  });

  it("handles an unparsable timestamp gracefully instead of throwing", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("unknown");
  });
});
