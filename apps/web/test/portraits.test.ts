import { describe, expect, it } from "vitest";
import { PORTRAIT_ROSTER, PORTRAIT_FALLBACK, portraitForSeat } from "../src/branding/portraits.js";

// Phase 5 (docs/meld-masters-visual-refresh-plan.md §9.3, §11 Phase 5).
// portraitForSeat is a pure function of its inputs -- these tests assert
// determinism and the fallback contract directly, without needing to
// render any component.

describe("PORTRAIT_ROSTER / PORTRAIT_FALLBACK", () => {
  it("exposes 8 rival portraits", () => {
    expect(PORTRAIT_ROSTER).toHaveLength(8);
  });

  it("every roster entry is a distinct, non-empty asset URL", () => {
    for (const url of PORTRAIT_ROSTER) {
      expect(typeof url).toBe("string");
      expect(url.length).toBeGreaterThan(0);
    }
    expect(new Set(PORTRAIT_ROSTER).size).toBe(PORTRAIT_ROSTER.length);
  });

  it("the fallback is a real asset, distinct from every roster entry", () => {
    expect(typeof PORTRAIT_FALLBACK).toBe("string");
    expect(PORTRAIT_FALLBACK.length).toBeGreaterThan(0);
    expect(PORTRAIT_ROSTER).not.toContain(PORTRAIT_FALLBACK);
  });
});

describe("portraitForSeat", () => {
  it("is deterministic: the same seat index always resolves to the same portrait", () => {
    for (let seat = 0; seat < 8; seat++) {
      const first = portraitForSeat(seat, false);
      const second = portraitForSeat(seat, false);
      expect(first).toBe(second);
    }
  });

  it("maps seat indices 0..7 to the 8 roster portraits in order", () => {
    for (let seat = 0; seat < 8; seat++) {
      expect(portraitForSeat(seat, false)).toBe(PORTRAIT_ROSTER[seat]);
    }
  });

  it("wraps around (modulo) for a seat index beyond the roster length, never crashing or going out of range", () => {
    expect(portraitForSeat(8, false)).toBe(PORTRAIT_ROSTER[0]);
    expect(portraitForSeat(11, false)).toBe(PORTRAIT_ROSTER[3]);
  });

  it("falls back for a negative or non-integer seat index instead of crashing", () => {
    expect(portraitForSeat(-1, false)).toBe(PORTRAIT_FALLBACK);
    expect(portraitForSeat(Number.NaN, false)).toBe(PORTRAIT_FALLBACK);
    expect(portraitForSeat(1.5, false)).toBe(PORTRAIT_FALLBACK);
  });

  it("always returns the fallback for a computer seat, regardless of seat index", () => {
    expect(portraitForSeat(0, true)).toBe(PORTRAIT_FALLBACK);
    expect(portraitForSeat(3, true)).toBe(PORTRAIT_FALLBACK);
  });
});
