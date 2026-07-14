import { describe, expect, it } from "vitest";
import { ping } from "../src/index.js";

describe("shared package harness", () => {
  it("resolves and runs", () => {
    expect(ping()).toBe("shared");
  });
});
