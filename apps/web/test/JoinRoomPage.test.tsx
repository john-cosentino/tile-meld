import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateMock,
}));

const joinRoomByName = vi.fn();
vi.mock("../src/api/client.js", () => ({
  api: { joinRoomByName: (...a: unknown[]) => joinRoomByName(...a) },
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

import { JoinRoomPage } from "../src/pages/JoinRoomPage.js";

function renderPage() {
  return render(
    <MemoryRouter>
      <JoinRoomPage />
    </MemoryRouter>,
  );
}

describe("JoinRoomPage", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    joinRoomByName.mockReset();
    mockUsername = "Alice";
  });

  it("is titled Join Room by Name", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Join Room by Name" })).toBeInTheDocument();
  });

  it("prompts to claim a username instead of showing the form when none is set", () => {
    mockUsername = null;
    renderPage();

    expect(screen.getByText(/claim a username/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Room name")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /join room/i })).not.toBeInTheDocument();
  });

  it("has no code field and no free-text display-name field", () => {
    renderPage();

    expect(screen.getByLabelText("Room name")).toBeInTheDocument();
    expect(screen.queryByLabelText(/room code/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
  });

  it("shows which claimed username will join", () => {
    renderPage();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("joins by exact name and navigates to the authoritative room id", async () => {
    joinRoomByName.mockResolvedValue({ roomId: "room-1" });
    renderPage();

    await userEvent.type(screen.getByLabelText("Room name"), "John");
    await userEvent.click(screen.getByRole("button", { name: /join room/i }));

    await waitFor(() => expect(joinRoomByName).toHaveBeenCalledWith({ name: "John" }));
    expect(navigateMock).toHaveBeenCalledWith("/rooms/room-1");
  });

  it("shows a client-side validation error for a blank name without calling the API", async () => {
    renderPage();

    await userEvent.type(screen.getByLabelText("Room name"), "   ");
    await userEvent.click(screen.getByRole("button", { name: /join room/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(joinRoomByName).not.toHaveBeenCalled();
  });

  it("surfaces a server error without revealing whether the room exists, and does not navigate", async () => {
    const { ApiError } = await import("../src/api/client.js");
    joinRoomByName.mockRejectedValue(
      new ApiError(404, "not_found", "no room with that name is available to join"),
    );
    renderPage();

    await userEvent.type(screen.getByLabelText("Room name"), "Nobody");
    await userEvent.click(screen.getByRole("button", { name: /join room/i }));

    expect(
      await screen.findByText("no room with that name is available to join"),
    ).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
