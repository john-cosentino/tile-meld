import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { RedactedGameView } from "@tile-meld/shared";

// Phase 5 -- the completed-game card (and its RematchPanel) must appear only
// once a game is actually completed, never while a game is still active.
// RematchPanel's own host/non-host/polling behavior is covered in isolation
// by RematchPanel.test.tsx; this file only checks TabletopPage's decision
// of *whether* to mount it.

vi.mock("react-router", async (orig) => ({
  ...(await orig<typeof import("react-router")>()),
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
    portraitId: null,
  };
}

function view(
  status: "active" | "completed",
  winnerSeatIndex: number | null = null,
): RedactedGameView {
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
    winnerSeatIndex,
    self: { ...baseSeat(), rack: [] },
    opponents: [{ ...baseSeat(), seatIndex: 1, displayName: "Bob" }],
  };
}

function gameHook(status: "active" | "completed", winnerSeatIndex: number | null = null) {
  return {
    view: view(status, winnerSeatIndex),
    connectionState: "connected" as const,
    reconnect: vi.fn(),
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

  // Phase 5 stabilization: winnerSeatIndex is durable (read from the games
  // row), so "who won" is knowable here purely from the redacted view --
  // no dependency on having been live for the transient game:over event.
  it("identifies the viewer as the winner when their own seat won", () => {
    useGameMock.mockReturnValue(gameHook("completed", 0));
    renderTabletop();
    expect(screen.getByText("You won!")).toBeInTheDocument();
  });

  it("identifies the opponent by display name when they won", () => {
    useGameMock.mockReturnValue(gameHook("completed", 1));
    renderTabletop();
    expect(screen.getByText("Bob won.")).toBeInTheDocument();
  });
});
