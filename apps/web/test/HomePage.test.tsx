import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateMock,
}));

const createVsComputer = vi.fn();
const getRoom = vi.fn();
vi.mock("../src/api/client.js", () => ({
  api: {
    createVsComputer: (...a: unknown[]) => createVsComputer(...a),
    getRoom: (...a: unknown[]) => getRoom(...a),
  },
  ApiError: class ApiError extends Error {
    status = 0;
  },
}));

const listRecentRoomIds = vi.fn(() => [] as string[]);
vi.mock("../src/state/recentRooms.js", () => ({
  listRecentRoomIds: () => listRecentRoomIds(),
  addRecentRoom: vi.fn(),
  removeRecentRoom: vi.fn(),
}));

let mockUsername: string | null = "Alice";
vi.mock("../src/auth/AuthProvider.js", () => ({
  useAuth: () => ({ state: { status: "ready", playerId: "p1", username: mockUsername } }),
}));

import { HomePage } from "../src/pages/HomePage.js";

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe("HomePage -- Play vs Computer", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    createVsComputer.mockReset();
    getRoom.mockReset();
    mockUsername = "Alice";
  });

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
      Object.assign(new Error("Play vs Computer is not available"), { status: 404 }),
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

describe("HomePage -- room name display", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    createVsComputer.mockReset();
    getRoom.mockReset();
    listRecentRoomIds.mockReset();
    listRecentRoomIds.mockReturnValue([]);
    mockUsername = "Alice";
  });

  it("shows no rooms when there are none recent", async () => {
    renderHome();
    expect(await screen.findByText(/no rooms yet/i)).toBeInTheDocument();
  });

  it("shows the friendly room name when the room has one", async () => {
    listRecentRoomIds.mockReturnValue(["room-1"]);
    getRoom.mockResolvedValue({
      roomId: "room-1",
      code: "ABCD1234",
      name: "John",
      status: "open",
      latestGameId: null,
      members: [],
      capacity: 4,
    });
    renderHome();

    expect(await screen.findByText("John")).toBeInTheDocument();
    expect(screen.queryByText(/room abcd1234/i)).not.toBeInTheDocument();
  });

  it("falls back to Room {code} for a legacy room with no name", async () => {
    listRecentRoomIds.mockReturnValue(["room-2"]);
    getRoom.mockResolvedValue({
      roomId: "room-2",
      code: "LEGACY01",
      name: null,
      status: "open",
      latestGameId: null,
      members: [],
      capacity: 4,
    });
    renderHome();

    expect(await screen.findByText("Room LEGACY01")).toBeInTheDocument();
  });
});
