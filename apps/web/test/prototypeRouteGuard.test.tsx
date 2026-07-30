import { describe, expect, it, vi, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

// The static tabletop concept prototype (apps/web/src/prototypes/tabletop-
// concept/) must never be reachable outside development -- devOnly.ts's
// PROTOTYPE_ROUTE_ENABLED (import.meta.env.DEV in real builds) is the only
// gate. This mocks that one flag directly rather than faking Vite's env
// machinery, so it exercises exactly the branch App.tsx guards on.
//
// Asserted via raw textContent rather than getByText/findByText: every
// prototype region is deliberately aria-hidden (it's static mock data with
// no real accessibility contract -- see the summary doc), and this test
// only needs to know whether the route's markup exists in the DOM at all,
// not query it the way a real user/AT would.
const PROTOTYPE_ONLY_TEXT = "T-BONE";

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
});

describe("static tabletop concept prototype -- route guard", () => {
  it("is reachable at its route when the dev-only flag is enabled (the real dev-server condition)", async () => {
    window.history.pushState({}, "", "/prototype/tabletop-concept");
    const { App } = await import("../src/App.js");
    const { container } = render(<App />);
    // A generous timeout, not the 1000ms default -- confirmed via
    // isolated/paired runs to reliably resolve in ~300-3000ms on its
    // own, but this waits on a real React.lazy() dynamic import
    // resolving, which the full 26-file suite's CPU contention alone
    // (no logic issue -- reproduced by running just this file, which is
    // fast) can push past 5s. 20s matches this project's own stated
    // philosophy for timing-sensitive assertions elsewhere (e2e
    // playwright.config.ts): wait longer for the real state rather than
    // tuning the assertion down.
    await waitFor(() => expect(container.textContent).toContain(PROTOTYPE_ONLY_TEXT), {
      timeout: 20000,
    });
  }, 20000);

  it("renders nothing at its route when the dev-only flag is disabled (the production condition)", async () => {
    vi.resetModules();
    vi.doMock("../src/prototypes/tabletop-concept/devOnly.js", () => ({
      PROTOTYPE_ROUTE_ENABLED: false,
    }));
    window.history.pushState({}, "", "/prototype/tabletop-concept");
    const { App } = await import("../src/App.js");
    const { container } = render(<App />);
    // No route matches (there's no catch-all), so nothing prototype-
    // specific -- and nothing at all -- renders.
    expect(container.textContent).not.toContain(PROTOTYPE_ONLY_TEXT);
    expect(container.textContent).toBe("");
    vi.doUnmock("../src/prototypes/tabletop-concept/devOnly.js");
    vi.resetModules();
  });
});
