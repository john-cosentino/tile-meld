import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Not using vitest's `globals: true`, so testing-library's automatic
// afterEach-cleanup registration never fires on its own -- without this,
// DOM nodes from one test's render() leak into the next test's queries.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement ResizeObserver (a real browser API the static
// tabletop concept prototype's ScaledArtboard.tsx uses to fit its fixed-
// size canvas to the viewport) -- a no-op stub is the standard fix for
// jsdom-based suites; nothing under test asserts on resize behavior
// itself, only that components mount without throwing.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
