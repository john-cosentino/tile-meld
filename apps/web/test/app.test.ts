import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("web package harness", () => {
  it("exports the App component", () => {
    expect(typeof App).toBe("function");
  });
});
