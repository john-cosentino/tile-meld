import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateMock,
}));

const createRoom = vi.fn();
vi.mock("../src/api/client.js", () => ({
  api: { createRoom: (...a: unknown[]) => createRoom(...a) },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

vi.mock("../src/state/recentRooms.js", () => ({
  addRecentRoom: vi.fn(),
}));

let mockUsername: string | null = "Alice";
vi.mock("../src/auth/AuthProvider.js", () => ({
  useAuth: () => ({ state: { status: "ready", playerId: "p1", username: mockUsername } }),
}));

import { CreateRoomPage } from "../src/pages/CreateRoomPage.js";

function renderPage() {
  return render(
    <MemoryRouter>
      <CreateRoomPage />
    </MemoryRouter>,
  );
}

describe("CreateRoomPage", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    createRoom.mockReset();
    mockUsername = "Alice";
  });

  it("prompts to claim a username instead of showing the form when none is set", () => {
    mockUsername = null;
    renderPage();

    expect(screen.getByText(/claim a username/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create room/i })).not.toBeInTheDocument();
  });

  it("shows the creating-as username and the form when a username is claimed", () => {
    renderPage();

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create room/i })).toBeInTheDocument();
  });

  it("creates a room using the claimed username as displayName and navigates to it", async () => {
    createRoom.mockResolvedValue({ roomId: "room-1", code: "ABCD1234", name: "Alice" });
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: /create room/i }));

    await waitFor(() =>
      expect(createRoom).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: "Alice", capacity: 4, visibility: "private" }),
      ),
    );
    expect(navigateMock).toHaveBeenCalledWith("/rooms/room-1");
  });

  it("surfaces a server error without navigating", async () => {
    const { ApiError } = await import("../src/api/client.js");
    createRoom.mockRejectedValue(new ApiError(409, "username_required", "claim a username first"));
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: /create room/i }));

    expect(await screen.findByText("claim a username first")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
