import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { GetRoomResponse } from "@tile-meld/shared";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateMock,
}));

const createVsComputer = vi.fn();
const getRoom = vi.fn();
vi.mock("../src/api/client.js", () => {
  class MockApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    api: {
      createVsComputer: (...a: unknown[]) => createVsComputer(...a),
      getRoom: (...a: unknown[]) => getRoom(...a),
    },
    ApiError: MockApiError,
  };
});

const listRecentRoomIds = vi.fn(() => [] as string[]);
const removeRecentRoom = vi.fn();
vi.mock("../src/state/recentRooms.js", () => ({
  listRecentRoomIds: () => listRecentRoomIds(),
  addRecentRoom: vi.fn(),
  removeRecentRoom: (...a: unknown[]) => removeRecentRoom(...a),
}));

let mockUsername: string | null = "Alice";
vi.mock("../src/auth/AuthProvider.js", () => ({
  useAuth: () => ({ state: { status: "ready", playerId: "p1", username: mockUsername } }),
}));

import { HomePage } from "../src/pages/HomePage.js";
import { ApiError as MockApiError } from "../src/api/client.js";

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

function roomFixture(overrides: Partial<GetRoomResponse> = {}): GetRoomResponse {
  return {
    roomId: "room-1",
    code: "ABCD1234",
    name: "Alice",
    visibility: "private",
    capacity: 2,
    turnLimitHours: 24,
    status: "open",
    hostPlayerId: "p1",
    latestGameId: null,
    latestGameStatus: null,
    selfSeatStatus: null,
    hasComputer: false,
    lastActivityAt: "2026-07-20T11:00:00.000Z",
    members: [{ playerId: "p1", displayName: "Alice", isReady: false, isComputer: false }],
    ...overrides,
  };
}

beforeEach(() => {
  navigateMock.mockReset();
  createVsComputer.mockReset();
  getRoom.mockReset();
  listRecentRoomIds.mockReset();
  listRecentRoomIds.mockReturnValue([]);
  removeRecentRoom.mockReset();
  mockUsername = "Alice";
});

describe("HomePage -- page hierarchy", () => {
  it("shows a large, prominent Tile Meld page heading", async () => {
    renderHome();
    const heading = await screen.findByRole("heading", { level: 1, name: "Tile Meld" });
    expect(heading).toBeInTheDocument();
  });

  it("shows Create a Game and Your Games as their own sections", async () => {
    renderHome();
    expect(
      await screen.findByRole("heading", { level: 2, name: "Create a Game" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Your Games" })).toBeInTheDocument();
  });

  it("labels every creation action exactly as specified, and retains Play vs Computer", async () => {
    renderHome();
    expect(await screen.findByRole("button", { name: "New Game" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join Room by Name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse Public Lobby" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play vs computer/i })).toBeInTheDocument();
  });
});

describe("HomePage -- Your Games loading/empty/error states", () => {
  it("shows a loading state before the room fetch resolves", async () => {
    listRecentRoomIds.mockReturnValue(["room-1"]);
    let resolveGetRoom: ((v: GetRoomResponse) => void) | undefined;
    getRoom.mockReturnValue(
      new Promise((resolve) => {
        resolveGetRoom = resolve;
      }),
    );
    renderHome();

    expect(await screen.findByText("Loading your games…")).toBeInTheDocument();
    resolveGetRoom!(roomFixture());
    await waitFor(() => expect(screen.queryByText("Loading your games…")).not.toBeInTheDocument());
  });

  it("shows a useful empty state when the player has no rooms", async () => {
    renderHome();
    expect(await screen.findByText(/no rooms yet/i)).toBeInTheDocument();
  });

  it("shows an API error state when the room fetch fails for a reason other than 404/403", async () => {
    listRecentRoomIds.mockReturnValue(["room-1"]);
    getRoom.mockRejectedValue(new MockApiError(500, "internal", "the server is having a bad day"));
    renderHome();

    expect(await screen.findByRole("alert")).toHaveTextContent("the server is having a bad day");
  });

  // Phase 7: a room that retention (or any other cause) has purged 404s on
  // the next dashboard load -- pre-existing behavior (Phase 2), re-verified
  // here as the specific "purged room" case rather than a generic 404.
  it("silently prunes a recent-room entry whose room now 404s, instead of showing an error", async () => {
    listRecentRoomIds.mockReturnValue(["room-1", "room-2"]);
    getRoom.mockImplementation((roomId: string) =>
      roomId === "room-1"
        ? Promise.reject(new MockApiError(404, "not_found", "no such room"))
        : Promise.resolve(roomFixture({ roomId: "room-2", name: "StillHere" })),
    );
    renderHome();

    expect(await screen.findByText("StillHere")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(removeRecentRoom).toHaveBeenCalledWith("room-1");
  });

  it("also prunes a 403 (e.g. a room whose membership no longer resolves) the same way as a 404", async () => {
    listRecentRoomIds.mockReturnValue(["room-1"]);
    getRoom.mockRejectedValue(new MockApiError(403, "forbidden", "not a member"));
    renderHome();

    await waitFor(() => expect(removeRecentRoom).toHaveBeenCalledWith("room-1"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(await screen.findByText(/no rooms yet/i)).toBeInTheDocument();
  });
});

describe("HomePage -- friendly name and legacy fallback", () => {
  it("shows the friendly room name when the room has one", async () => {
    listRecentRoomIds.mockReturnValue(["room-1"]);
    getRoom.mockResolvedValue(roomFixture({ name: "John" }));
    renderHome();

    expect(await screen.findByText("John")).toBeInTheDocument();
    expect(screen.queryByText(/room abcd1234/i)).not.toBeInTheDocument();
  });

  it("falls back to Room {code} for a legacy room with no name", async () => {
    listRecentRoomIds.mockReturnValue(["room-2"]);
    getRoom.mockResolvedValue(roomFixture({ roomId: "room-2", code: "LEGACY01", name: null }));
    renderHome();

    expect(await screen.findByText("Room LEGACY01")).toBeInTheDocument();
  });
});

describe("HomePage -- game status cards", () => {
  it("Open: neutral card, visible 'Open' text, links to the Waiting Room", async () => {
    listRecentRoomIds.mockReturnValue(["room-1"]);
    getRoom.mockResolvedValue(roomFixture({ status: "open" }));
    renderHome();

    const card = await screen.findByRole("link", { name: /Alice/ });
    expect(card).toHaveTextContent("Open");
    expect(card).toHaveAttribute("href", "/rooms/room-1");
    expect(card.className).toContain("dashboard-card--neutral");
  });

  it("Active: green-tone card, visible 'Active' text, links to the latest game", async () => {
    listRecentRoomIds.mockReturnValue(["room-1"]);
    getRoom.mockResolvedValue(
      roomFixture({
        status: "in_game",
        latestGameId: "game-1",
        latestGameStatus: "active",
        selfSeatStatus: "active",
      }),
    );
    renderHome();

    const card = await screen.findByRole("link", { name: /Alice/ });
    expect(card).toHaveTextContent("Active");
    expect(card).toHaveAttribute("href", "/games/game-1");
    expect(card.className).toContain("dashboard-card--active");
  });

  it("Completed: grey-tone card, visible 'Completed' text, links to the Game Over screen", async () => {
    listRecentRoomIds.mockReturnValue(["room-1"]);
    getRoom.mockResolvedValue(
      roomFixture({
        status: "between_games",
        latestGameId: "game-1",
        latestGameStatus: "completed",
        selfSeatStatus: "active",
      }),
    );
    renderHome();

    const card = await screen.findByRole("link", { name: /Alice/ });
    expect(card).toHaveTextContent("Completed");
    expect(card).toHaveAttribute("href", "/games/game-1");
    expect(card.className).toContain("dashboard-card--grey");
  });

  it("Resigned: grey-tone card, visible 'Resigned' text, links to the Game Over screen", async () => {
    listRecentRoomIds.mockReturnValue(["room-1"]);
    getRoom.mockResolvedValue(
      roomFixture({
        status: "between_games",
        latestGameId: "game-1",
        latestGameStatus: "completed",
        selfSeatStatus: "resigned",
      }),
    );
    renderHome();

    const card = await screen.findByRole("link", { name: /Alice/ });
    expect(card).toHaveTextContent("Resigned");
    expect(card).toHaveAttribute("href", "/games/game-1");
    expect(card.className).toContain("dashboard-card--grey");
  });

  it("Ended (room abandoned, no surviving game): grey, non-interactive, no broken link", async () => {
    listRecentRoomIds.mockReturnValue(["room-1"]);
    getRoom.mockResolvedValue(roomFixture({ status: "abandoned", latestGameId: null }));
    renderHome();

    expect(await screen.findByText("Ended")).toBeInTheDocument();
    expect(screen.getByText("This room is no longer available.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Alice/ })).not.toBeInTheDocument();
  });

  it("Ended with a surviving completed game still links to it", async () => {
    listRecentRoomIds.mockReturnValue(["room-1"]);
    getRoom.mockResolvedValue(
      roomFixture({
        status: "abandoned",
        latestGameId: "game-1",
        latestGameStatus: "completed",
        selfSeatStatus: "active",
      }),
    );
    renderHome();

    const card = await screen.findByRole("link", { name: /Alice/ });
    expect(card).toHaveTextContent("Ended");
    expect(card).toHaveAttribute("href", "/games/game-1");
  });

  it("an active rematch takes precedence over a prior resignation/completion in the same room", async () => {
    listRecentRoomIds.mockReturnValue(["room-1"]);
    // Represents the room's CURRENT truth immediately after a rematch was
    // dealt -- a fresh game, freshly seated, even though this same room
    // saw a resignation last time around. There is no "was resigned"
    // history field for the classifier to be confused by; it only ever
    // sees this current snapshot.
    getRoom.mockResolvedValue(
      roomFixture({
        status: "in_game",
        latestGameId: "game-2",
        latestGameStatus: "active",
        selfSeatStatus: "active",
      }),
    );
    renderHome();

    const card = await screen.findByRole("link", { name: /Alice/ });
    expect(card).toHaveTextContent("Active");
    expect(card).not.toHaveTextContent("Resigned");
  });

  it("status text is present in the DOM independent of any styling -- never color alone", async () => {
    listRecentRoomIds.mockReturnValue(["room-1", "room-2"]);
    getRoom.mockImplementation((roomId: string) =>
      Promise.resolve(
        roomId === "room-1"
          ? roomFixture({ roomId: "room-1", status: "open" })
          : roomFixture({
              roomId: "room-2",
              name: "Bob",
              status: "in_game",
              latestGameId: "g2",
              latestGameStatus: "active",
              selfSeatStatus: "active",
            }),
      ),
    );
    renderHome();

    expect(await screen.findByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("a card is a real, keyboard-focusable link with a meaningful accessible name", async () => {
    listRecentRoomIds.mockReturnValue(["room-1"]);
    getRoom.mockResolvedValue(roomFixture({ status: "open" }));
    renderHome();

    const card = await screen.findByRole("link", { name: /Alice/ });
    expect(card.tagName).toBe("A");
    expect(card).toHaveAccessibleName(/Alice/);
    await userEvent.tab();
    // The first tab stops go through the top nav; keep tabbing until we
    // reach the card or run out of reasonable attempts.
    let reachedCard = document.activeElement === card;
    for (let i = 0; i < 20 && !reachedCard; i++) {
      await userEvent.tab();
      reachedCard = document.activeElement === card;
    }
    expect(reachedCard).toBe(true);
  });
});

describe("HomePage -- Play vs Computer", () => {
  it("shows a Play vs Computer entry point", async () => {
    renderHome();
    expect(await screen.findByRole("button", { name: /play vs computer/i })).toBeInTheDocument();
  });

  it("creates a computer game with the claimed username and navigates to the room", async () => {
    createVsComputer.mockResolvedValue({ roomId: "room-1", code: "ABCD1234", name: "Alice" });
    renderHome();

    await userEvent.click(await screen.findByRole("button", { name: /play vs computer/i }));

    await waitFor(() => expect(createVsComputer).toHaveBeenCalledWith("Alice"));
    expect(navigateMock).toHaveBeenCalledWith("/rooms/room-1");
  });

  it("surfaces an error and does not navigate when creation fails", async () => {
    createVsComputer.mockRejectedValue(
      new MockApiError(404, "not_found", "Play vs Computer is not available"),
    );
    renderHome();

    await userEvent.click(await screen.findByRole("button", { name: /play vs computer/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("disables Play vs Computer and prompts to claim a username when none is set", async () => {
    mockUsername = null;
    renderHome();

    expect(await screen.findByRole("button", { name: /play vs computer/i })).toBeDisabled();
    expect(screen.getByText(/claim a username/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /play vs computer/i }));
    expect(createVsComputer).not.toHaveBeenCalled();
  });
});
