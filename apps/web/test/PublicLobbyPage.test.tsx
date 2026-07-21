import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateMock,
}));

const publicRooms = vi.fn();
vi.mock("../src/api/client.js", () => ({
  api: {
    publicRooms: (...a: unknown[]) => publicRooms(...a),
    quickJoin: vi.fn(),
    joinRoom: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status = 0;
  },
}));

vi.mock("../src/state/recentRooms.js", () => ({
  addRecentRoom: vi.fn(),
}));

vi.mock("../src/state/displayName.js", () => ({
  getDefaultDisplayName: () => "Alice",
  setDefaultDisplayName: vi.fn(),
}));

import { PublicLobbyPage } from "../src/pages/PublicLobbyPage.js";

function renderPage() {
  return render(
    <MemoryRouter>
      <PublicLobbyPage />
    </MemoryRouter>,
  );
}

describe("PublicLobbyPage -- room name display", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    publicRooms.mockReset();
  });

  it("shows the friendly room name when present", async () => {
    publicRooms.mockResolvedValue({
      rooms: [
        {
          roomId: "room-1",
          code: "ABCD1234",
          name: "public_John",
          memberDisplayNames: ["John"],
          memberCount: 1,
          capacity: 4,
          turnLimitHours: 8,
        },
      ],
    });
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
