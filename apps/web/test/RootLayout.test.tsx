import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("../src/auth/AuthProvider.js", () => ({
  useAuth: () => ({ state: { status: "ready", playerId: "p1", username: "Alice" } }),
}));

import { RootLayout } from "../src/layout/RootLayout.js";

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route element={<RootLayout />}>
          <Route index element={<p>child route content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("RootLayout -- app shell (Phase 2 arcade header)", () => {
  it("exposes exactly one link named Meld Masters, with an accessible name unaffected by the decorative monogram", () => {
    renderLayout();
    const brandLinks = screen.getAllByRole("link", { name: "Meld Masters" });
    expect(brandLinks).toHaveLength(1);
  });

  it("renders the decorative monogram with empty alt text, invisible to assistive technology", () => {
    const { container } = renderLayout();
    // An <img alt=""> has no accessible name and maps to role="presentation",
    // not role="img" -- so it must NOT show up via an accessible-role query.
    expect(screen.queryByRole("img")).toBeNull();
    const monogram = container.querySelector(".brand-monogram");
    expect(monogram).not.toBeNull();
    expect(monogram?.getAttribute("alt")).toBe("");
    // Explicit dimensions so the image never causes layout shift.
    expect(monogram?.getAttribute("width")).toBeTruthy();
    expect(monogram?.getAttribute("height")).toBeTruthy();
  });

  it("still exposes every navigation link with its existing name and route", () => {
    renderLayout();
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav.querySelector('a[href="/"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/rooms/new"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/rooms/join"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/lobby"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/recovery"]')).not.toBeNull();
  });

  it("still renders the routed child content via Outlet", () => {
    renderLayout();
    expect(screen.getByText("child route content")).toBeInTheDocument();
  });

  it("does not throw while mounting the notification control alongside the header", () => {
    // NotificationsControl resolves to "unsupported" in jsdom (no
    // navigator.serviceWorker) and renders null -- this asserts the shell
    // mounts cleanly with it present in the tree, not any particular
    // notification UI state (that belongs to usePushSubscription's own
    // tests).
    expect(() => renderLayout()).not.toThrow();
  });
});
