import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider.js";

// Accounts-only bootstrap (Phase F): /me either resolves to ready or 401s
// to unauthenticated. There is no guest minting and no localStorage
// identity. The api module is mocked.

const { FakeApiError } = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return { FakeApiError };
});

const me = vi.fn();
const loginApi = vi.fn();
const registerApi = vi.fn();
const logoutApi = vi.fn();
const setPortraitApi = vi.fn();

vi.mock("../src/api/client.js", () => ({
  api: {
    me: (...args: unknown[]) => me(...args),
    login: (...args: unknown[]) => loginApi(...args),
    register: (...args: unknown[]) => registerApi(...args),
    logout: (...args: unknown[]) => logoutApi(...args),
    setPortrait: (...args: unknown[]) => setPortraitApi(...args),
  },
  ApiError: FakeApiError,
}));

const noSession = () => new FakeApiError(401, "unauthorized", "no session cookie");

function meResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    playerId: "p1",
    username: "Alice",
    email: "a@example.com",
    portraitId: null,
    ...overrides,
  };
}

function Probe() {
  const { state, login, logout, setPortrait } = useAuth();
  if (state.status !== "ready") {
    return (
      <>
        <span>{state.status}</span>
        <button onClick={() => void login("alice", "pw")}>login</button>
      </>
    );
  }
  return (
    <>
      <span>
        ready:{state.playerId}:{state.username ?? "none"}:{state.email ?? "none"}:
        {state.portraitId ?? "none"}
      </span>
      <button onClick={() => void setPortrait(3)}>pick</button>
      <button onClick={() => void logout()}>logout</button>
    </>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

beforeEach(() => {
  for (const fn of [me, loginApi, registerApi, logoutApi, setPortraitApi]) {
    fn.mockReset();
  }
});

describe("AuthProvider", () => {
  it("an existing session cookie resolves straight to ready with account fields", async () => {
    me.mockResolvedValue(meResponse({ playerId: "acct-1", portraitId: 2 }));

    renderProvider();

    await waitFor(() => screen.getByText("ready:acct-1:Alice:a@example.com:2"));
  });

  it("resolves to unauthenticated on a 401, without minting anything", async () => {
    me.mockRejectedValue(noSession());

    renderProvider();

    await waitFor(() => screen.getByText("unauthenticated"));
    expect(me).toHaveBeenCalledOnce();
    expect(localStorage.getItem("tilemeld.identity")).toBeNull();
  });

  it("surfaces an error state when bootstrap fails with a non-401", async () => {
    me.mockRejectedValue(new Error("network down"));

    renderProvider();

    await waitFor(() => screen.getByText("error"));
  });

  it("login transitions unauthenticated -> ready via a fresh /me", async () => {
    me.mockRejectedValueOnce(noSession()).mockResolvedValue(meResponse({ playerId: "acct-1" }));
    loginApi.mockResolvedValue({ playerId: "acct-1", username: "Alice", portraitId: null });

    renderProvider();
    await waitFor(() => screen.getByText("unauthenticated"));

    screen.getByRole("button", { name: "login" }).click();
    await waitFor(() => screen.getByText("ready:acct-1:Alice:a@example.com:none"));
    expect(loginApi).toHaveBeenCalledWith("alice", "pw");
  });

  it("setPortrait reflects the server-confirmed pick in state", async () => {
    me.mockResolvedValue(meResponse({ playerId: "acct-1" }));
    setPortraitApi.mockResolvedValue({ portraitId: 3 });

    renderProvider();
    await waitFor(() => screen.getByText("ready:acct-1:Alice:a@example.com:none"));

    screen.getByRole("button", { name: "pick" }).click();
    await waitFor(() => screen.getByText("ready:acct-1:Alice:a@example.com:3"));
    expect(setPortraitApi).toHaveBeenCalledWith(3);
  });

  it("logout returns to unauthenticated", async () => {
    me.mockResolvedValue(meResponse());
    logoutApi.mockResolvedValue(undefined);

    renderProvider();
    await waitFor(() => screen.getByText("ready:p1:Alice:a@example.com:none"));

    screen.getByRole("button", { name: "logout" }).click();
    await waitFor(() => screen.getByText("unauthenticated"));
    expect(logoutApi).toHaveBeenCalledOnce();
  });
});
