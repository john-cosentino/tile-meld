import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Phase 7 -- once useGame reports notFound (see useGame.test.tsx for the
// socket-ack-level coverage of how that flag gets set), TabletopPage must
// show a clear, terminal unavailable state -- never the "Loading table…"
// state, never the live table/rack/chat UI -- with a route back home.

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useParams: () => ({ gameId: "purged-1" }),
}));

vi.mock("../src/chat/ChatPanel.js", () => ({ ChatPanel: () => null }));
vi.mock("../src/tabletop/RematchPanel.js", () => ({ RematchPanel: () => null }));

const useGameMock = vi.fn();
vi.mock("../src/tabletop/useGame.js", () => ({ useGame: () => useGameMock() }));

import { TabletopPage } from "../src/pages/TabletopPage.js";

function gameHook(overrides: Partial<ReturnType<typeof baseHook>> = {}) {
  return { ...baseHook(), ...overrides };
}

function baseHook() {
  return {
    view: undefined,
    connectionState: "connected" as const,
    banner: undefined,
    dismissBanner: vi.fn(),
    warningToast: undefined,
    dismissWarningToast: vi.fn(),
    notFound: false,
    commit: vi.fn(),
    draw: vi.fn(),
    pass: vi.fn(),
    resign: vi.fn(),
    isSocketActionError: () => false,
  };
}

function renderTabletop() {
  return render(
    <MemoryRouter>
      <TabletopPage />
    </MemoryRouter>,
  );
}

describe("TabletopPage -- purged/unavailable game (Phase 7)", () => {
  it("shows a clear unavailable message instead of an endless loading spinner", () => {
    useGameMock.mockReturnValue(gameHook({ notFound: true }));
    renderTabletop();

    expect(screen.getByText(/doesn't exist|no longer available/i)).toBeInTheDocument();
    expect(screen.queryByText("Loading table…")).not.toBeInTheDocument();
  });

  it("provides a clear route back to Home", () => {
    useGameMock.mockReturnValue(gameHook({ notFound: true }));
    renderTabletop();

    const homeLink = screen.getByRole("link", { name: /back home/i });
    expect(homeLink).toHaveAttribute("href", "/");
  });

  it("never renders the live table, rack, or action controls for an unavailable game", () => {
    useGameMock.mockReturnValue(gameHook({ notFound: true }));
    renderTabletop();

    expect(screen.queryByRole("button", { name: "Draw tile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Commit turn" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Your rack/)).not.toBeInTheDocument();
  });

  it("does not expose whether the game never existed vs. was purged -- one generic message either way", () => {
    useGameMock.mockReturnValue(gameHook({ notFound: true }));
    renderTabletop();

    const message = screen.getByText(/doesn't exist|no longer available/i).textContent ?? "";
    expect(message.toLowerCase()).not.toContain("retention");
    expect(message.toLowerCase()).not.toContain("delet");
    expect(message.toLowerCase()).not.toContain("purge");
    expect(message.toLowerCase()).not.toContain("admin");
  });

  it("shows the ordinary loading state (not the unavailable state) while still waiting on the first response", () => {
    useGameMock.mockReturnValue(gameHook({ notFound: false, view: undefined }));
    renderTabletop();

    expect(screen.getByText("Loading table…")).toBeInTheDocument();
    expect(screen.queryByText(/doesn't exist|no longer available/i)).not.toBeInTheDocument();
  });
});
