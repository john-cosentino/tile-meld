import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider.js";

const createIdentity = vi.fn();
const recoverSession = vi.fn();

vi.mock("../src/api/client.js", () => ({
  api: {
    createIdentity: (...args: unknown[]) => createIdentity(...args),
    recoverSession: (...args: unknown[]) => recoverSession(...args),
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

function Probe() {
  const { state } = useAuth();
  if (state.status !== "ready") return <span>{state.status}</span>;
  return (
    <span>
      ready:{state.playerId}:{state.newRecoverySecret ?? "none"}
    </span>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    createIdentity.mockReset();
    recoverSession.mockReset();
  });

  it("mints a new identity and surfaces the recovery secret once, when nothing is stored", async () => {
    createIdentity.mockResolvedValue({ playerId: "p1", recoverySecret: "s1" });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => screen.getByText("ready:p1:s1"));
    expect(createIdentity).toHaveBeenCalledOnce();
    expect(recoverSession).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("tilemeld.identity")!)).toEqual({
      playerId: "p1",
      recoverySecret: "s1",
    });
  });

  it("recovers the stored identity instead of minting a new one, with no secret to display", async () => {
    localStorage.setItem(
      "tilemeld.identity",
      JSON.stringify({ playerId: "stored-id", recoverySecret: "stored-secret" }),
    );
    recoverSession.mockResolvedValue({ playerId: "stored-id" });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => screen.getByText("ready:stored-id:none"));
    expect(recoverSession).toHaveBeenCalledWith("stored-id", "stored-secret");
    expect(createIdentity).not.toHaveBeenCalled();
  });

  it("surfaces an error state when bootstrap fails entirely", async () => {
    localStorage.setItem(
      "tilemeld.identity",
      JSON.stringify({ playerId: "x", recoverySecret: "y" }),
    );
    recoverSession.mockRejectedValue(new Error("network down"));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => screen.getByText("error"));
  });
});
