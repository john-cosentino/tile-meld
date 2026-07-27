import { describe, expect, it } from "vitest";
import {
  PRODUCT_NAME,
  TILE_COLOR_TOKENS,
  TILE_COLOR_BY_CODE,
  JOKER_GLYPH,
  JOKER_LABEL,
  TURN_LIMIT_OPTIONS,
  INITIAL_MELD_THRESHOLD,
} from "../src/index.js";

describe("PRODUCT_NAME", () => {
  it("is exactly Meld Masters", () => {
    expect(PRODUCT_NAME).toBe("Meld Masters");
  });

  it("is not the old public name", () => {
    expect(PRODUCT_NAME).not.toBe("Tile Meld");
  });
});

describe("tile branding tokens", () => {
  it("defines exactly four color tokens, each with a code, label, hex, and non-color symbol", () => {
    expect(TILE_COLOR_TOKENS).toHaveLength(4);
    for (const token of TILE_COLOR_TOKENS) {
      expect(token.code).toMatch(/^C[1-4]$/);
      expect(token.label.length).toBeGreaterThan(0);
      expect(token.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(token.symbol.length).toBeGreaterThan(0);
    }
  });

  it("indexes every token by its code in TILE_COLOR_BY_CODE", () => {
    for (const token of TILE_COLOR_TOKENS) {
      expect(TILE_COLOR_BY_CODE[token.code]).toBe(token);
    }
  });

  it("defines a joker glyph and label distinct from every color symbol", () => {
    expect(JOKER_GLYPH.length).toBeGreaterThan(0);
    expect(JOKER_LABEL.length).toBeGreaterThan(0);
    for (const token of TILE_COLOR_TOKENS) {
      expect(JOKER_GLYPH).not.toBe(token.symbol);
    }
  });
});

describe("other branding/product config", () => {
  it("offers turn-limit options with hours and a label each", () => {
    expect(TURN_LIMIT_OPTIONS.length).toBeGreaterThan(0);
    for (const option of TURN_LIMIT_OPTIONS) {
      expect(typeof option.hours).toBe("number");
      expect(option.label.length).toBeGreaterThan(0);
    }
  });

  it("defines a positive initial meld threshold", () => {
    expect(INITIAL_MELD_THRESHOLD).toBeGreaterThan(0);
  });
});
