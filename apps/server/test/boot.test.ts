import { describe, expect, it } from "vitest";
import { bootMessage } from "../src/index.js";

describe("server package harness", () => {
  it("resolves workspace-linked engine and shared packages", () => {
    expect(bootMessage()).toBe("tile-meld server placeholder (engine, shared)");
  });
});
