import { describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { RedactedGameView } from "@tile-meld/shared";
import type { ConnectionState } from "../src/tabletop/useGame.js";

// Phase 8 -- tabletop information hierarchy. These tests target the NEW
// region structure and the prominence/visibility guarantees the phase
// requires; the pre-existing TabletopComputerTurn/TabletopPageRematch/
// TabletopPurgedGame test files (all still passing, unmodified) already
// cover Game Over/Rematch rendering and the unavailable-game state -- not
// duplicated here.

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useParams: () => ({ gameId: "g1" }),
}));

vi.mock("../src/tabletop/RematchPanel.js", () => ({ RematchPanel: () => null }));

const chatMountCount = { current: 0 };
vi.mock("../src/chat/ChatPanel.js", () => ({
  ChatPanel: () => {
    // A real mount-tracking side effect (not a render counter) -- this is
    // the actual proof that collapsing/expanding chat never remounts (and
    // therefore never resets) the panel: React only re-runs a
    // no-dependency-array effect once per real mount, never on a parent
    // re-render or a `hidden` attribute toggle.
    useEffect(() => {
      chatMountCount.current += 1;
    }, []);
    return <div data-testid="chat-panel-mock">chat</div>;
  },
}));

const useGameMock = vi.fn();
vi.mock("../src/tabletop/useGame.js", () => ({ useGame: () => useGameMock() }));

import { TabletopPage } from "../src/pages/TabletopPage.js";

function seat(overrides: Partial<RedactedGameView["self"]> = {}): RedactedGameView["self"] {
  return {
    seatIndex: 0,
    displayName: "Alice",
    rackCount: 2,
    status: "active",
    hasInitialMeld: false,
    isComputer: false,
    rack: [
      { kind: "numbered", tileId: "C1-5-a", color: "C1", value: 5 },
      { kind: "numbered", tileId: "C1-6-a", color: "C1", value: 6 },
    ],
    ...overrides,
  };
}

function opponent(
  overrides: Partial<RedactedGameView["opponents"][number]> = {},
): RedactedGameView["opponents"][number] {
  return {
    seatIndex: 1,
    displayName: "Bob",
    rackCount: 9,
    status: "active",
    hasInitialMeld: false,
    isComputer: false,
    ...overrides,
  };
}

function view(overrides: Partial<RedactedGameView> = {}): RedactedGameView {
  return {
    gameId: "g1",
    roomId: "r1",
    version: 3,
    table: [],
    poolCount: 40,
    activeSeat: 0,
    consecutivePasses: 0,
    status: "active",
    deadlineAt: null,
    turnId: "t1",
    self: seat(),
    opponents: [opponent()],
    ...overrides,
  };
}

function gameHook(overrides: Partial<ReturnType<typeof baseHook>> = {}) {
  return { ...baseHook(), ...overrides };
}

function baseHook() {
  return {
    view: view(),
    connectionState: "connected" as ConnectionState,
    banner: undefined as string | undefined,
    dismissBanner: vi.fn(),
    warningToast: undefined as string | undefined,
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

describe("TabletopPage layout -- status prominence (Phase 8)", () => {
  it("shows a prominent 'Your turn' H1 when it is the player's own turn", () => {
    useGameMock.mockReturnValue(gameHook({ view: view({ activeSeat: 0 }) }));
    renderTabletop();
    expect(screen.getByRole("heading", { level: 1, name: "Your turn" })).toBeInTheDocument();
  });

  it("shows a 'Waiting on seat N' H1 while waiting for the opponent", () => {
    useGameMock.mockReturnValue(gameHook({ view: view({ activeSeat: 1 }) }));
    renderTabletop();
    expect(
      screen.getByRole("heading", { level: 1, name: "Waiting on seat 2" }),
    ).toBeInTheDocument();
  });

  it("keeps the deadline countdown visible during an active turn", () => {
    const deadlineAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    useGameMock.mockReturnValue(gameHook({ view: view({ activeSeat: 0, deadlineAt }) }));
    renderTabletop();
    expect(screen.getByText(/remaining/)).toBeInTheDocument();
  });

  it("keeps the connection-state indicator visible", () => {
    useGameMock.mockReturnValue(gameHook({ connectionState: "disconnected" }));
    renderTabletop();
    expect(screen.getByText("🔴 Disconnected")).toBeInTheDocument();
  });

  it("exposes the status region under a stable semantic label", () => {
    useGameMock.mockReturnValue(gameHook());
    renderTabletop();
    expect(screen.getByRole("region", { name: "Game status" })).toBeInTheDocument();
  });
});

describe("TabletopPage layout -- opponents (Phase 8)", () => {
  it("shows opponent rack counts without exposing rack contents", () => {
    useGameMock.mockReturnValue(
      gameHook({
        view: view({ opponents: [opponent({ displayName: "Bob", rackCount: 9 })] }),
      }),
    );
    renderTabletop();
    const opponents = screen.getByRole("list", { name: "Opponents" });
    expect(within(opponents).getByText(/Bob: 9 tiles/)).toBeInTheDocument();
    // Structurally there is no tile-content field on an opponent at all
    // (RedactedGameView["opponents"] has no `rack`) -- nothing to leak.
  });

  it("marks a resigned opponent and a computer opponent distinctly, in text", () => {
    useGameMock.mockReturnValue(
      gameHook({
        view: view({
          opponents: [
            opponent({ seatIndex: 1, displayName: "Resigned Bob", status: "resigned" }),
            opponent({ seatIndex: 2, displayName: "Computer", isComputer: true }),
          ],
        }),
      }),
    );
    renderTabletop();
    expect(screen.getByText(/Resigned Bob: \d+ tiles \(resigned\)/)).toBeInTheDocument();
    expect(screen.getByText(/Computer 🤖: \d+ tiles/)).toBeInTheDocument();
  });
});

describe("TabletopPage layout -- board and rack regions (Phase 8)", () => {
  it("the board region contains the current table sets", () => {
    useGameMock.mockReturnValue(
      gameHook({
        view: view({
          table: [[{ kind: "numbered", tileId: "C1-5-a", color: "C1", value: 5 }]],
        }),
      }),
    );
    renderTabletop();
    const board = screen.getByTestId("tabletop-board");
    expect(within(board).getByRole("heading", { name: "Table" })).toBeInTheDocument();
    expect(within(board).getByText(/^Set 1 --/)).toBeInTheDocument();
  });

  it("the rack region contains the player's rack", () => {
    useGameMock.mockReturnValue(gameHook({ view: view({ self: seat({ rackCount: 2 }) }) }));
    renderTabletop();
    const rack = screen.getByTestId("tabletop-rack");
    expect(within(rack).getByRole("heading", { name: "Your rack (2)" })).toBeInTheDocument();
  });
});

describe("TabletopPage layout -- actions (Phase 8)", () => {
  it("all current actions remain available in a labelled action group", () => {
    useGameMock.mockReturnValue(gameHook({ view: view({ activeSeat: 0 }) }));
    renderTabletop();
    const actions = screen.getByRole("group", { name: "Game actions" });
    for (const name of ["Undo", "Reset turn", "Draw tile", "Pass", "Commit turn", "Resign"]) {
      expect(within(actions).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("resign confirmation still works", async () => {
    const user = userEvent.setup();
    useGameMock.mockReturnValue(gameHook({ view: view({ activeSeat: 0 }) }));
    renderTabletop();

    await user.click(screen.getByRole("button", { name: "Resign" }));
    expect(screen.getByText("Resign for good?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm resign" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Resign for good?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resign" })).toBeInTheDocument();
  });
});

describe("TabletopPage layout -- feedback (Phase 8)", () => {
  it("initial-meld progress remains available during an active turn before the meld", () => {
    useGameMock.mockReturnValue(
      gameHook({ view: view({ activeSeat: 0, self: seat({ hasInitialMeld: false }) }) }),
    );
    renderTabletop();
    expect(screen.getByText(/Initial meld progress: \d+ \/ 30/)).toBeInTheDocument();
  });

  it("a general connection/game error banner remains visible", () => {
    useGameMock.mockReturnValue(gameHook({ banner: "Something went wrong" }));
    renderTabletop();
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("a turn-warning toast remains visible", () => {
    useGameMock.mockReturnValue(gameHook({ warningToast: "5 minute(s) left on your turn." }));
    renderTabletop();
    expect(screen.getByText(/5 minute\(s\) left on your turn\./)).toBeInTheDocument();
  });
});

describe("TabletopPage layout -- chat disclosure (Phase 8)", () => {
  it("chat toggles accessibly, exposing its expanded/collapsed state", async () => {
    chatMountCount.current = 0;
    const user = userEvent.setup();
    useGameMock.mockReturnValue(gameHook());
    renderTabletop();

    const toggle = screen.getByRole("button", { name: /chat/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Show chat" })).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Hide chat" })).toBeInTheDocument();
  });

  it("chat state survives collapse/expand -- the panel is hidden, not unmounted", async () => {
    chatMountCount.current = 0;
    const user = userEvent.setup();
    useGameMock.mockReturnValue(gameHook());
    renderTabletop();

    expect(chatMountCount.current).toBe(1);
    const toggle = screen.getByRole("button", { name: /chat/i });

    await user.click(toggle); // collapse
    await user.click(toggle); // expand
    await user.click(toggle); // collapse again

    expect(chatMountCount.current).toBe(1); // never remounted
  });

  it("the chat region is present under a stable test hook", () => {
    useGameMock.mockReturnValue(gameHook());
    renderTabletop();
    expect(screen.getByTestId("tabletop-chat")).toBeInTheDocument();
  });
});

describe("TabletopPage layout -- no artwork dependency (Phase 8)", () => {
  it("renders fully with zero <img> elements -- no artwork is required for rendering", () => {
    useGameMock.mockReturnValue(gameHook());
    const { container } = renderTabletop();
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("renders the completed-game state with zero <img> elements too", () => {
    useGameMock.mockReturnValue(gameHook({ view: view({ status: "completed" }) }));
    const { container } = renderTabletop();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 1, name: "Game over" })).toBeInTheDocument();
  });
});
