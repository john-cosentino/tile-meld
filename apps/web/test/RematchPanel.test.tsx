import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { GetRoomResponse } from "@tile-meld/shared";

// Phase 5 -- one-click rematch. RematchPanel is the completed-game control
// mounted only while the current game is "completed" (see TabletopPage.tsx);
// its own lifecycle IS the polling window, so these tests exercise mount/
// unmount directly rather than a status flag.

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateMock,
}));

let currentPlayerId = "p-host";
vi.mock("../src/auth/AuthProvider.js", () => ({
  useAuth: () => ({ state: { status: "ready", playerId: currentPlayerId } }),
}));

const getRoom = vi.fn();
const rematchRoom = vi.fn();
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
      getRoom: (...a: unknown[]) => getRoom(...a),
      rematchRoom: (...a: unknown[]) => rematchRoom(...a),
    },
    ApiError: MockApiError,
  };
});

import { RematchPanel } from "../src/tabletop/RematchPanel.js";
import { ApiError as MockApiError } from "../src/api/client.js";

function roomFixture(overrides: Partial<GetRoomResponse> = {}): GetRoomResponse {
  return {
    roomId: "r1",
    code: "ABCD1234",
    name: "Alice",
    visibility: "private",
    capacity: 2,
    turnLimitHours: 24,
    status: "between_games",
    hostPlayerId: "p-host",
    latestGameId: "g1",
    latestGameStatus: "completed",
    selfSeatStatus: "active",
    hasComputer: false,
    lastActivityAt: "2026-07-20T12:00:00.000Z",
    members: [
      { playerId: "p-host", displayName: "Alice", isReady: false, isComputer: false },
      { playerId: "p-guest", displayName: "Bob", isReady: false, isComputer: false },
    ],
    ...overrides,
  };
}

function renderPanel(gameId = "g1") {
  return render(
    <MemoryRouter>
      <RematchPanel roomId="r1" gameId={gameId} />
    </MemoryRouter>,
  );
}

describe("RematchPanel -- host", () => {
  beforeEach(() => {
    currentPlayerId = "p-host";
    getRoom.mockReset();
    rematchRoom.mockReset();
    navigateMock.mockReset();
  });

  it("shows an active Rematch button for the host", async () => {
    getRoom.mockResolvedValue(roomFixture());
    renderPanel();
    expect(await screen.findByRole("button", { name: "Rematch" })).toBeEnabled();
  });

  it("disables the button while submitting and calls the endpoint exactly once", async () => {
    getRoom.mockResolvedValue(roomFixture());
    let resolveRematch: ((v: { gameId: string }) => void) | undefined;
    rematchRoom.mockReturnValue(
      new Promise((resolve) => {
        resolveRematch = resolve;
      }),
    );
    const user = userEvent.setup();
    renderPanel();

    const button = await screen.findByRole("button", { name: "Rematch" });
    await user.click(button);
    expect(await screen.findByRole("button", { name: /Starting rematch/ })).toBeDisabled();
    // A second click while disabled must not fire another request.
    await user.click(screen.getByRole("button", { name: /Starting rematch/ }));
    expect(rematchRoom).toHaveBeenCalledTimes(1);

    resolveRematch!({ gameId: "g2" });
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/games/g2"));
  });

  it("navigates to the returned game on success", async () => {
    getRoom.mockResolvedValue(roomFixture());
    rematchRoom.mockResolvedValue({ gameId: "g2" });
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Rematch" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/games/g2"));
  });

  it("shows a useful error on API failure and allows retrying", async () => {
    getRoom.mockResolvedValue(roomFixture());
    rematchRoom.mockRejectedValueOnce(
      new MockApiError(409, "conflict", "room is not between games"),
    );
    rematchRoom.mockResolvedValueOnce({ gameId: "g2" });
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Rematch" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("room is not between games");
    // The button is re-enabled -- the user can retry immediately.
    const retryButton = await screen.findByRole("button", { name: "Rematch" });
    expect(retryButton).toBeEnabled();

    await user.click(retryButton);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/games/g2"));
    expect(rematchRoom).toHaveBeenCalledTimes(2);
  });
});

describe("RematchPanel -- non-host", () => {
  beforeEach(() => {
    currentPlayerId = "p-guest";
    getRoom.mockReset();
    rematchRoom.mockReset();
    navigateMock.mockReset();
  });

  it("does not show an active Rematch button", async () => {
    getRoom.mockResolvedValue(roomFixture());
    renderPanel();
    await screen.findByText("Waiting for the host to start a rematch.");
    expect(screen.queryByRole("button", { name: "Rematch" })).not.toBeInTheDocument();
  });

  it("shows the waiting message", async () => {
    getRoom.mockResolvedValue(roomFixture());
    renderPanel();
    expect(await screen.findByText("Waiting for the host to start a rematch.")).toBeInTheDocument();
  });
});

describe("RematchPanel -- polling-driven auto-navigation", () => {
  beforeEach(() => {
    currentPlayerId = "p-guest";
    getRoom.mockReset();
    rematchRoom.mockReset();
    navigateMock.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("navigates once the room's latestGameId differs from the game being viewed", async () => {
    getRoom
      .mockResolvedValueOnce(roomFixture({ latestGameId: "g1" }))
      .mockResolvedValueOnce(roomFixture({ latestGameId: "g2", status: "in_game" }));
    renderPanel("g1");

    await vi.waitFor(() => expect(getRoom).toHaveBeenCalledTimes(1));
    expect(navigateMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);
    await vi.waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/games/g2", { replace: true }),
    );
  });

  it("does not navigate while latestGameId still matches the game being viewed", async () => {
    getRoom.mockResolvedValue(roomFixture({ latestGameId: "g1" }));
    renderPanel("g1");

    await vi.waitFor(() => expect(getRoom).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(9000);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("stops polling once unmounted", async () => {
    getRoom.mockResolvedValue(roomFixture({ latestGameId: "g1" }));
    const { unmount } = renderPanel("g1");

    await vi.waitFor(() => expect(getRoom).toHaveBeenCalledTimes(1));
    unmount();
    const callsAtUnmount = getRoom.mock.calls.length;

    await vi.advanceTimersByTimeAsync(9000);
    expect(getRoom).toHaveBeenCalledTimes(callsAtUnmount);
  });
});

describe("RematchPanel -- missing room", () => {
  beforeEach(() => {
    currentPlayerId = "p-host";
    getRoom.mockReset();
    rematchRoom.mockReset();
    navigateMock.mockReset();
  });

  it("shows a graceful message when the room no longer exists, instead of crashing", async () => {
    getRoom.mockRejectedValue(new MockApiError(404, "not_found", "no such room"));
    renderPanel();
    expect(await screen.findByText("This room no longer exists.")).toBeInTheDocument();
  });
});
