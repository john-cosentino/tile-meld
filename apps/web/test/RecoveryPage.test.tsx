import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const createIdentity = vi.fn();
const recoverSession = vi.fn();
const rotateRecovery = vi.fn();
const claimUsername = vi.fn();

vi.mock("../src/api/client.js", () => ({
  api: {
    createIdentity: (...a: unknown[]) => createIdentity(...a),
    recoverSession: (...a: unknown[]) => recoverSession(...a),
    rotateRecovery: (...a: unknown[]) => rotateRecovery(...a),
    claimUsername: (...a: unknown[]) => claimUsername(...a),
  },
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

import { AuthProvider } from "../src/auth/AuthProvider.js";
import { RecoveryPage } from "../src/pages/RecoveryPage.js";

function renderRecoveryPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <RecoveryPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("RecoveryPage -- username claim", () => {
  beforeEach(() => {
    localStorage.clear();
    createIdentity.mockReset();
    recoverSession.mockReset();
    rotateRecovery.mockReset();
    claimUsername.mockReset();
  });

  it("shows the claim form for a fresh identity with no username yet", async () => {
    createIdentity.mockResolvedValue({ playerId: "p1", recoverySecret: "s1", username: null });
    renderRecoveryPage();

    expect(await screen.findByRole("heading", { name: "Choose a username" })).toBeInTheDocument();
    expect(screen.queryByText(/your username is/i)).not.toBeInTheDocument();
  });

  it("claims a username and switches to the read-only view", async () => {
    createIdentity.mockResolvedValue({ playerId: "p1", recoverySecret: "s1", username: null });
    claimUsername.mockResolvedValue({ username: "Alice" });
    renderRecoveryPage();

    await screen.findByRole("heading", { name: "Choose a username" });
    await userEvent.type(screen.getByLabelText("Username"), "Alice");
    await userEvent.click(screen.getByRole("button", { name: "Claim username" }));

    await waitFor(() => expect(claimUsername).toHaveBeenCalledWith("Alice"));
    expect(await screen.findByText(/your username is/i)).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows a validation error client-side without calling the API for an invalid username", async () => {
    // Uses the recovery path (no pending newRecoverySecret banner) so the
    // only role="alert" element on the page is the validation error itself.
    localStorage.setItem(
      "tilemeld.identity",
      JSON.stringify({ playerId: "stored-id", recoverySecret: "stored-secret" }),
    );
    recoverSession.mockResolvedValue({ playerId: "stored-id", username: null });
    renderRecoveryPage();

    await screen.findByRole("heading", { name: "Choose a username" });
    await userEvent.type(screen.getByLabelText("Username"), "ab");
    await userEvent.click(screen.getByRole("button", { name: "Claim username" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Username must be at least 3 characters",
    );
    expect(claimUsername).not.toHaveBeenCalled();
  });

  it("surfaces a server error (e.g. taken username) without navigating away from the form", async () => {
    createIdentity.mockResolvedValue({ playerId: "p1", recoverySecret: "s1", username: null });
    const { ApiError } = await import("../src/api/client.js");
    claimUsername.mockRejectedValue(
      new ApiError(409, "conflict", "that username is already taken"),
    );
    renderRecoveryPage();

    await screen.findByRole("heading", { name: "Choose a username" });
    await userEvent.type(screen.getByLabelText("Username"), "Alice");
    await userEvent.click(screen.getByRole("button", { name: "Claim username" }));

    expect(await screen.findByText("that username is already taken")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Choose a username" })).toBeInTheDocument();
  });

  it("shows the read-only view directly when the identity already has a username", async () => {
    createIdentity.mockResolvedValue({ playerId: "p1", recoverySecret: "s1", username: "Bob" });
    renderRecoveryPage();

    expect(await screen.findByText(/your username is/i)).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Choose a username" })).not.toBeInTheDocument();
  });

  it("a recovered session retains and displays its previously claimed username", async () => {
    localStorage.setItem(
      "tilemeld.identity",
      JSON.stringify({ playerId: "stored-id", recoverySecret: "stored-secret" }),
    );
    recoverSession.mockResolvedValue({ playerId: "stored-id", username: "Carol" });
    renderRecoveryPage();

    expect(await screen.findByText(/your username is/i)).toBeInTheDocument();
    expect(screen.getByText("Carol")).toBeInTheDocument();
    expect(recoverSession).toHaveBeenCalledWith("stored-id", "stored-secret");
    expect(createIdentity).not.toHaveBeenCalled();
  });
});
