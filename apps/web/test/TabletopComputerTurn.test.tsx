import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { RedactedGameView } from "@tile-meld/shared";

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useParams: () => ({ gameId: "g1" }),
}));

// ChatPanel pulls in the socket + chat API; stub it out for this page test.
vi.mock("../src/chat/ChatPanel.js", () => ({ ChatPanel: () => null }));

const useGameMock = vi.fn();
vi.mock("../src/tabletop/useGame.js", () => ({ useGame: () => useGameMock() }));

import { TabletopPage } from "../src/pages/TabletopPage.js";

function view(activeSeat: number): RedactedGameView {
  return {
    gameId: "g1",
    roomId: "r1",
    version: 3,
    table: [],
    poolCount: 40,
    activeSeat,
    consecutivePasses: 0,
    status: "active",
    deadlineAt: null,
    turnId: "t1",
    self: {
      seatIndex: 0,
      displayName: "Alice",
      rackCount: 5,
      status: "active",
      hasInitialMeld: false,
      isComputer: false,
      rack: [],
    },
    opponents: [
      {
        seatIndex: 1,
        displayName: "Computer",
        rackCount: 7,
        status: "active",
        hasInitialMeld: false,
        isComputer: true,
      },
    ],
  };
}

function gameHook(activeSeat: number) {
  return {
    view: view(activeSeat),
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

describe("TabletopPage -- computer opponent turn state", () => {
  it("shows 'Computer is playing…' while the bot's seat is active", () => {
    useGameMock.mockReturnValue(gameHook(1));
    renderTabletop();
    expect(screen.getByText(/Computer is playing/i)).toBeInTheDocument();
    // The opponent row also identifies the bot.
    expect(screen.getByText(/Computer 🤖/)).toBeInTheDocument();
  });

  it("shows 'Your turn' when it is the human's turn, not the computer message", () => {
    useGameMock.mockReturnValue(gameHook(0));
    renderTabletop();
    expect(screen.getByText("Your turn")).toBeInTheDocument();
    expect(screen.queryByText(/Computer is playing/i)).not.toBeInTheDocument();
  });
});
