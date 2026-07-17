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

vi.mock("../src/state/recentRooms.js", () => ({
  listRecentRoomIds: () => [],
  addRecentRoom: vi.fn(),
  removeRecentRoom: vi.fn(),
}));

vi.mock("../src/state/displayName.js", () => ({
  getDefaultDisplayName: () => "Alice",
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
  });

  it("shows a Play vs Computer entry point", async () => {
    renderHome();
    expect(await screen.findByRole("button", { name: /play vs computer/i })).toBeInTheDocument();
  });

  it("creates a computer game with the stored display name and navigates to the room", async () => {
    createVsComputer.mockResolvedValue({ roomId: "room-1", code: "ABCD1234" });
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
});
