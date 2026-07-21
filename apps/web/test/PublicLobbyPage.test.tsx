import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateMock,
}));

const publicRooms = vi.fn();
const quickJoin = vi.fn();
const joinRoom = vi.fn();
const joinRoomByName = vi.fn();
vi.mock("../src/api/client.js", () => ({
  api: {
    publicRooms: (...a: unknown[]) => publicRooms(...a),
    quickJoin: (...a: unknown[]) => quickJoin(...a),
    joinRoom: (...a: unknown[]) => joinRoom(...a),
    joinRoomByName: (...a: unknown[]) => joinRoomByName(...a),
  },
  ApiError: class ApiError extends Error {
    status = 0;
  },
}));

vi.mock("../src/state/recentRooms.js", () => ({
  addRecentRoom: vi.fn(),
}));

let mockUsername: string | null = "Alice";
vi.mock("../src/auth/AuthProvider.js", () => ({
  useAuth: () => ({ state: { status: "ready", playerId: "p1", username: mockUsername } }),
}));

import { PublicLobbyPage } from "../src/pages/PublicLobbyPage.js";

function renderPage() {
  return render(
    <MemoryRouter>
      <PublicLobbyPage />
    </MemoryRouter>,
  );
}

const roomWithName = {
  roomId: "room-1",
  code: "ABCD1234",
  name: "public_John",
  memberDisplayNames: ["John"],
  memberCount: 1,
  capacity: 4,
  turnLimitHours: 8,
};

describe("PublicLobbyPage -- room name display", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    publicRooms.mockReset();
    quickJoin.mockReset();
    joinRoom.mockReset();
    joinRoomByName.mockReset();
    mockUsername = "Alice";
  });

  it("shows the friendly room name when present", async () => {
    publicRooms.mockResolvedValue({ rooms: [roomWithName] });
    renderPage();

    expect(await screen.findByText("public_John")).toBeInTheDocument();
    expect(screen.queryByText(/room abcd1234/i)).not.toBeInTheDocument();
  });

  it("falls back to Room {code} for a legacy room with no name", async () => {
    publicRooms.mockResolvedValue({
      rooms: [
        {
          roomId: "room-2",
          code: "LEGACY01",
          name: null,
          memberDisplayNames: ["Someone"],
          memberCount: 1,
          capacity: 4,
          turnLimitHours: 8,
        },
      ],
    });
    renderPage();

    expect(await screen.findByText("Room LEGACY01")).toBeInTheDocument();
  });

  it("shows an empty state when there are no open public rooms", async () => {
    publicRooms.mockResolvedValue({ rooms: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText(/no open public rooms/i)).toBeInTheDocument());
  });
});

describe("PublicLobbyPage -- joining uses the claimed username, not a free-text field", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    publicRooms.mockReset();
    quickJoin.mockReset();
    joinRoom.mockReset();
    joinRoomByName.mockReset();
    mockUsername = "Alice";
  });

  it("has no free-text display-name input", async () => {
    publicRooms.mockResolvedValue({ rooms: [] });
    renderPage();
    await screen.findByText(/no open public rooms/i);

    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
  });

  it("shows which username will join", async () => {
    publicRooms.mockResolvedValue({ rooms: [] });
    renderPage();
    expect(await screen.findByText("Alice")).toBeInTheDocument();
  });

  it("joining a listed room with a friendly name uses join-by-name", async () => {
    publicRooms.mockResolvedValue({ rooms: [roomWithName] });
    joinRoomByName.mockResolvedValue({ roomId: "room-1" });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Join" }));

    await waitFor(() => expect(joinRoomByName).toHaveBeenCalledWith({ name: "public_John" }));
    expect(joinRoom).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/rooms/room-1");
  });

  it("joining a legacy nameless room falls back to code-based join with the username as displayName", async () => {
    publicRooms.mockResolvedValue({
      rooms: [
        {
          roomId: "room-2",
          code: "LEGACY01",
          name: null,
          memberDisplayNames: [],
          memberCount: 0,
          capacity: 4,
          turnLimitHours: 8,
        },
      ],
    });
    joinRoom.mockResolvedValue({ roomId: "room-2" });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Join" }));

    await waitFor(() =>
      expect(joinRoom).toHaveBeenCalledWith({ code: "LEGACY01", displayName: "Alice" }),
    );
    expect(joinRoomByName).not.toHaveBeenCalled();
  });

  it("Quick Join sends the claimed username, not a free-text value", async () => {
    publicRooms.mockResolvedValue({ rooms: [] });
    quickJoin.mockResolvedValue({ roomId: "room-3" });
    renderPage();
    await screen.findByText(/no open public rooms/i);

    await userEvent.click(screen.getByRole("button", { name: "Quick Join" }));

    await waitFor(() => expect(quickJoin).toHaveBeenCalledWith({ displayName: "Alice" }));
    expect(navigateMock).toHaveBeenCalledWith("/rooms/room-3");
  });

  it("prompts to claim a username and disables joining when none is set", async () => {
    mockUsername = null;
    publicRooms.mockResolvedValue({ rooms: [roomWithName] });
    renderPage();

    expect(await screen.findByText(/claim a username/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quick Join" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Join" })).toBeDisabled();
  });
});
