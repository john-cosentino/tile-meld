import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { RedactedGameView } from "@tile-meld/shared";

// Phase 5 -- the completed-game card (and its RematchPanel) must appear only
// once a game is actually completed, never while a game is still active.
// RematchPanel's own host/non-host/polling behavior is covered in isolation
// by RematchPanel.test.tsx; this file only checks TabletopPage's decision
// of *whether* to mount it.

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useParams: () => ({ gameId: "g1" }),
}));

vi.mock("../src/chat/ChatPanel.js", () => ({ ChatPanel: () => null }));

vi.mock("../src/tabletop/RematchPanel.js", () => ({
  RematchPanel: ({ roomId, gameId }: { roomId: string; gameId: string }) => (
    <div data-testid="rematch-panel" data-room-id={roomId} data-game-id={gameId} />
  ),
}));

const useGameMock = vi.fn();
vi.mock("../src/tabletop/useGame.js", () => ({ useGame: () => useGameMock() }));

import { TabletopPage } from "../src/pages/TabletopPage.js";

function baseSeat() {
  return {
    seatIndex: 0,
    displayName: "Alice",
    rackCount: 5,
    status: "active" as const,
    hasInitialMeld: false,
    isComputer: false,
  };
}

function view(status: "active" | "completed"): RedactedGameView {
  return {
    gameId: "g1",
    roomId: "r1",
    version: 3,
    table: [],
    poolCount: 40,
    activeSeat: 0,
    consecutivePasses: 0,
    status,
    deadlineAt: null,
    turnId: status === "active" ? "t1" : null,
    self: { ...baseSeat(), rack: [] },
    opponents: [{ ...baseSeat(), seatIndex: 1, displayName: "Bob" }],
  };
}

function gameHook(status: "active" | "completed") {
  return {
    view: view(status),
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

describe("TabletopPage -- completed-game rematch card", () => {
  it("shows the Game over card and mounts RematchPanel once the game is completed", () => {
    useGameMock.mockReturnValue(gameHook("completed"));
    renderTabletop();

    expect(screen.getByRole("heading", { name: "Game over" })).toBeInTheDocument();
    const panel = screen.getByTestId("rematch-panel");
    expect(panel).toHaveAttribute("data-room-id", "r1");
    expect(panel).toHaveAttribute("data-game-id", "g1");
  });

  it("does not show the completed-game card or RematchPanel while the game is still active", () => {
    useGameMock.mockReturnValue(gameHook("active"));
    renderTabletop();

    expect(screen.queryByRole("heading", { name: "Game over" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("rematch-panel")).not.toBeInTheDocument();
  });
});
