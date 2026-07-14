import { describe, expect, it } from "vitest";
import { ping } from "../src/index.js";

describe("engine package harness", () => {
  it("resolves and runs", () => {
    expect(ping()).toBe("engine");
  });
});
