import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, IDENTITY_STORAGE_KEY, useAuth } from "../src/auth/AuthProvider.js";

// Accounts plan, Phase D: the provider bootstraps in two modes decided by
// GET /api/config. These tests drive both, with the api module mocked.

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

const getConfig = vi.fn();
const me = vi.fn();
const createIdentity = vi.fn();
const recoverSession = vi.fn();
const claimUsernameApi = vi.fn();
const loginApi = vi.fn();
const logoutApi = vi.fn();
const setPortraitApi = vi.fn();
const upgradeApi = vi.fn();

vi.mock("../src/api/client.js", () => ({
  api: {
    getConfig: (...args: unknown[]) => getConfig(...args),
    me: (...args: unknown[]) => me(...args),
    createIdentity: (...args: unknown[]) => createIdentity(...args),
    recoverSession: (...args: unknown[]) => recoverSession(...args),
    claimUsername: (...args: unknown[]) => claimUsernameApi(...args),
    login: (...args: unknown[]) => loginApi(...args),
    logout: (...args: unknown[]) => logoutApi(...args),
    setPortrait: (...args: unknown[]) => setPortraitApi(...args),
    upgradeAccount: (...args: unknown[]) => upgradeApi(...args),
  },
  ApiError: FakeApiError,
}));

const noSession = () => new FakeApiError(401, "unauthorized", "no session cookie");

function meResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    playerId: "p1",
    username: null,
    email: null,
    portraitId: null,
    hasPassword: false,
    ...overrides,
  };
}

function Probe() {
  const { state, accountsRequired, claimUsername, login, setPortrait } = useAuth();
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
        ready:{state.playerId}:{state.username ?? "none"}:{state.newRecoverySecret ?? "none"}:
        {String(state.hasPassword)}:{state.portraitId ?? "none"}:{String(accountsRequired)}
      </span>
      <button onClick={() => void claimUsername("alice")}>claim</button>
      <button onClick={() => void setPortrait(3)}>pick</button>
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
  localStorage.clear();
  for (const fn of [
    getConfig,
    me,
    createIdentity,
    recoverSession,
    claimUsernameApi,
    loginApi,
    logoutApi,
    setPortraitApi,
    upgradeApi,
  ]) {
    fn.mockReset();
  }
});

describe("AuthProvider -- legacy mode (accountsRequired=false)", () => {
  beforeEach(() => {
    getConfig.mockResolvedValue({ accountsRequired: false });
  });

  it("mints a new identity and surfaces the recovery secret once, when nothing is stored", async () => {
    me.mockRejectedValueOnce(noSession()).mockResolvedValue(meResponse());
    createIdentity.mockResolvedValue({ playerId: "p1", recoverySecret: "s1", username: null });

    renderProvider();

    await waitFor(() => screen.getByText("ready:p1:none:s1:false:none:false"));
    expect(createIdentity).toHaveBeenCalledOnce();
    expect(recoverSession).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(IDENTITY_STORAGE_KEY)!)).toEqual({
      playerId: "p1",
      recoverySecret: "s1",
    });
  });

  it("recovers the stored identity instead of minting, with no secret to display", async () => {
    localStorage.setItem(
      IDENTITY_STORAGE_KEY,
      JSON.stringify({ playerId: "stored-id", recoverySecret: "stored-secret" }),
    );
    me.mockRejectedValueOnce(noSession()).mockResolvedValue(
      meResponse({ playerId: "stored-id", username: "existing" }),
    );
    recoverSession.mockResolvedValue({ playerId: "stored-id", username: "existing" });

    renderProvider();

    await waitFor(() => screen.getByText("ready:stored-id:existing:none:false:none:false"));
    expect(recoverSession).toHaveBeenCalledWith("stored-id", "stored-secret");
    expect(createIdentity).not.toHaveBeenCalled();
  });

  it("reuses a still-live session cookie without touching the recovery path", async () => {
    me.mockResolvedValue(meResponse({ playerId: "cookie-id", username: "existing" }));

    renderProvider();

    await waitFor(() => screen.getByText("ready:cookie-id:existing:none:false:none:false"));
    expect(recoverSession).not.toHaveBeenCalled();
    expect(createIdentity).not.toHaveBeenCalled();
  });

  it("surfaces an error state when bootstrap fails entirely", async () => {
    localStorage.setItem(
      IDENTITY_STORAGE_KEY,
      JSON.stringify({ playerId: "x", recoverySecret: "y" }),
    );
    me.mockRejectedValue(noSession());
    recoverSession.mockRejectedValue(new Error("network down"));

    renderProvider();

    await waitFor(() => screen.getByText("error"));
  });

  it("claimUsername updates state.username on success", async () => {
    me.mockRejectedValueOnce(noSession()).mockResolvedValue(meResponse());
    createIdentity.mockResolvedValue({ playerId: "p1", recoverySecret: "s1", username: null });
    claimUsernameApi.mockResolvedValue({ username: "alice" });

    renderProvider();

    await waitFor(() => screen.getByText("ready:p1:none:s1:false:none:false"));
    screen.getByRole("button", { name: "claim" }).click();

    await waitFor(() => screen.getByText("ready:p1:alice:s1:false:none:false"));
    expect(claimUsernameApi).toHaveBeenCalledWith("alice");
  });
});

describe("AuthProvider -- accounts mode (accountsRequired=true)", () => {
  beforeEach(() => {
    getConfig.mockResolvedValue({ accountsRequired: true });
  });

  it("resolves to unauthenticated instead of minting a guest", async () => {
    me.mockRejectedValue(noSession());

    renderProvider();

    await waitFor(() => screen.getByText("unauthenticated"));
    expect(createIdentity).not.toHaveBeenCalled();
    expect(recoverSession).not.toHaveBeenCalled();
    expect(localStorage.getItem(IDENTITY_STORAGE_KEY)).toBeNull();
  });

  it("an existing session cookie resolves straight to ready with account fields", async () => {
    me.mockResolvedValue(
      meResponse({
        playerId: "acct-1",
        username: "Alice",
        email: "a@example.com",
        portraitId: 2,
        hasPassword: true,
      }),
    );

    renderProvider();

    await waitFor(() => screen.getByText("ready:acct-1:Alice:none:true:2:true"));
  });

  it("login transitions unauthenticated -> ready via a fresh /me", async () => {
    me.mockRejectedValueOnce(noSession()).mockResolvedValue(
      meResponse({ playerId: "acct-1", username: "Alice", hasPassword: true }),
    );
    loginApi.mockResolvedValue({ playerId: "acct-1", username: "Alice", portraitId: null });

    renderProvider();
    await waitFor(() => screen.getByText("unauthenticated"));

    screen.getByRole("button", { name: "login" }).click();
    await waitFor(() => screen.getByText("ready:acct-1:Alice:none:true:none:true"));
    expect(loginApi).toHaveBeenCalledWith("alice", "pw");
  });

  it("setPortrait reflects the server-confirmed pick in state", async () => {
    me.mockResolvedValue(meResponse({ playerId: "acct-1", username: "Alice", hasPassword: true }));
    setPortraitApi.mockResolvedValue({ portraitId: 3 });

    renderProvider();
    await waitFor(() => screen.getByText("ready:acct-1:Alice:none:true:none:true"));

    screen.getByRole("button", { name: "pick" }).click();
    await waitFor(() => screen.getByText("ready:acct-1:Alice:none:true:3:true"));
    expect(setPortraitApi).toHaveBeenCalledWith(3);
  });
});
