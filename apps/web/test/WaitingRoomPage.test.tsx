import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useParams: () => ({ roomId: "r1" }),
  useNavigate: () => vi.fn(),
}));

const getRoom = vi.fn();
vi.mock("../src/api/client.js", () => ({
  api: { getRoom: (...a: unknown[]) => getRoom(...a) },
  ApiError: class ApiError extends Error {
    status = 0;
  },
}));

vi.mock("../src/auth/AuthProvider.js", () => ({
  useAuth: () => ({ state: { status: "ready", playerId: "p-human" } }),
}));

vi.mock("../src/state/recentRooms.js", () => ({
  addRecentRoom: vi.fn(),
  removeRecentRoom: vi.fn(),
}));

import { WaitingRoomPage } from "../src/pages/WaitingRoomPage.js";

function roomWithBot() {
  return {
    roomId: "r1",
    code: "ABCD1234",
    name: "Alice",
    visibility: "private",
    capacity: 2,
    turnLimitHours: 24,
    status: "open",
    hostPlayerId: "p-human",
    latestGameId: null,
    members: [
      { playerId: "p-human", displayName: "Alice", isReady: false, isComputer: false },
      {
        playerId: "00000000-0000-0000-0000-000000000b01",
        displayName: "Computer",
        isReady: true,
        isComputer: true,
      },
    ],
  };
}

describe("WaitingRoomPage -- computer opponent", () => {
  beforeEach(() => getRoom.mockReset());

  it("badges the computer member and shows it as ready", async () => {
    getRoom.mockResolvedValue(roomWithBot());
    render(
      <MemoryRouter>
        <WaitingRoomPage />
      </MemoryRouter>,
    );

    // The bot is identified with an accessible badge...
    expect(await screen.findByLabelText("computer opponent")).toBeInTheDocument();
    // ...and both its name and a ready marker are present.
    expect(screen.getByText(/Computer/)).toBeInTheDocument();
    const readyMarkers = screen.getAllByLabelText("ready");
    expect(readyMarkers.length).toBeGreaterThanOrEqual(1);
  });
});

describe("WaitingRoomPage -- room name display", () => {
  beforeEach(() => getRoom.mockReset());

  it("shows the friendly room name as the heading when present", async () => {
    getRoom.mockResolvedValue(roomWithBot());
    render(
      <MemoryRouter>
        <WaitingRoomPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Alice" })).toBeInTheDocument();
  });

  it("falls back to Room {code} when the room has no name (legacy)", async () => {
    getRoom.mockResolvedValue({ ...roomWithBot(), name: null });
    render(
      <MemoryRouter>
        <WaitingRoomPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Room ABCD1234" })).toBeInTheDocument();
  });
});
