import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Not using vitest's `globals: true`, so testing-library's automatic
// afterEach-cleanup registration never fires on its own -- without this,
// DOM nodes from one test's render() leak into the next test's queries.
afterEach(() => {
  cleanup();
});
