import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";

// Accounts plan, Phase D: the new auth pages and route guards, with
// useAuth mocked per the repo's page-test pattern.

const mockAuth = {
  state: { status: "ready" } as Record<string, unknown>,
  accountsRequired: true,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  changePassword: vi.fn(),
  upgradeAccount: vi.fn(),
  setPortrait: vi.fn(),
  redeemRecovery: vi.fn(),
  acknowledgeRecoverySecret: vi.fn(),
  rotateRecovery: vi.fn(),
  claimUsername: vi.fn(),
};

vi.mock("../src/auth/AuthProvider.js", () => ({
  useAuth: () => mockAuth,
  IDENTITY_STORAGE_KEY: "tilemeld.identity",
}));

const resetRequest = vi.fn();
vi.mock("../src/api/client.js", () => ({
  api: { resetRequest: (...a: unknown[]) => resetRequest(...a) },
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

import { LoginPage } from "../src/pages/LoginPage.js";
import { RegisterPage } from "../src/pages/RegisterPage.js";
import { AccountPage } from "../src/pages/AccountPage.js";
import { UpgradeAccountPage } from "../src/pages/UpgradeAccountPage.js";
import { ResetRequestPage } from "../src/pages/ResetRequestPage.js";
import { RequireAuth } from "../src/auth/guards.js";

function readyState(overrides: Record<string, unknown> = {}) {
  return {
    status: "ready",
    playerId: "p1",
    username: "Alice",
    email: "a@example.com",
    portraitId: null,
    hasPassword: true,
    newRecoverySecret: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.state = readyState();
  mockAuth.accountsRequired = true;
});

describe("LoginPage", () => {
  it("submits credentials and navigates to the safe returnTo path", async () => {
    mockAuth.login.mockResolvedValue(undefined);
    render(
      <MemoryRouter initialEntries={["/login?returnTo=/lobby"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/lobby" element={<p>lobby page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText("Username"), "Alice");
    await userEvent.type(screen.getByLabelText("Password"), "secret-password");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(mockAuth.login).toHaveBeenCalledWith("Alice", "secret-password");
    await screen.findByText("lobby page");
  });

  it("never follows an absolute returnTo (open-redirect guard) -- lands on /", async () => {
    mockAuth.login.mockResolvedValue(undefined);
    render(
      <MemoryRouter initialEntries={["/login?returnTo=https://evil.example"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>home page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText("Username"), "Alice");
    await userEvent.type(screen.getByLabelText("Password"), "secret-password");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    await screen.findByText("home page");
  });

  it("redeems a recovery code and routes to the finish-setup screen", async () => {
    mockAuth.redeemRecovery.mockResolvedValue(undefined);
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/account/upgrade" element={<p>upgrade page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Use your recovery code" }));
    await userEvent.type(screen.getByLabelText("Recovery code"), "player-1:top-secret");
    await userEvent.click(screen.getByRole("button", { name: "Redeem recovery code" }));
    expect(mockAuth.redeemRecovery).toHaveBeenCalledWith("player-1", "top-secret");
    await screen.findByText("upgrade page");
  });
});

describe("RegisterPage", () => {
  it("validates the username client-side before calling the API", async () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText("Username"), "ab");
    await userEvent.type(screen.getByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "long-enough-pw");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("3-24 characters");
    expect(mockAuth.register).not.toHaveBeenCalled();
  });

  it("registers and navigates home", async () => {
    mockAuth.register.mockResolvedValue(undefined);
    render(
      <MemoryRouter initialEntries={["/register"]}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<p>home page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText("Username"), "NewPlayer");
    await userEvent.type(screen.getByLabelText("Email"), "n@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "long-enough-pw");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(mockAuth.register).toHaveBeenCalledWith("NewPlayer", "n@example.com", "long-enough-pw");
    await screen.findByText("home page");
  });
});

describe("AccountPage", () => {
  it("selecting a portrait saves only on the Save button, with a visible confirmation", async () => {
    mockAuth.setPortrait.mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(13); // 12 portraits + Default

    // Nothing to save yet: the Save button starts disabled.
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    // Picking only selects -- no server call until Save is clicked.
    await userEvent.click(screen.getByRole("radio", { name: "Portrait 3" }));
    expect(mockAuth.setPortrait).not.toHaveBeenCalled();
    expect(screen.getByText(/\(unsaved\)/)).toBeInTheDocument();
    expect(save).toBeEnabled();

    await userEvent.click(save);
    expect(mockAuth.setPortrait).toHaveBeenCalledWith(2);
    expect(await screen.findByText("Profile picture saved.")).toBeInTheDocument();
  });

  it("offers change-password and logout for a password account", () => {
    render(
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Change password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("shows the legacy recovery-code section instead when accounts are off", () => {
    mockAuth.state = readyState({ hasPassword: false });
    mockAuth.accountsRequired = false;
    render(
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/uses a recovery code/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
  });
});

describe("UpgradeAccountPage", () => {
  it("upgrades and navigates home", async () => {
    mockAuth.state = readyState({ hasPassword: false });
    mockAuth.upgradeAccount.mockResolvedValue(undefined);
    render(
      <MemoryRouter initialEntries={["/account/upgrade"]}>
        <Routes>
          <Route path="/account/upgrade" element={<UpgradeAccountPage />} />
          <Route path="/" element={<p>home page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText("Email"), "up@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "upgrade-password");
    await userEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(mockAuth.upgradeAccount).toHaveBeenCalledWith("up@example.com", "upgrade-password");
    await screen.findByText("home page");
  });

  it("bounces an already-upgraded account home", async () => {
    render(
      <MemoryRouter initialEntries={["/account/upgrade"]}>
        <Routes>
          <Route path="/account/upgrade" element={<UpgradeAccountPage />} />
          <Route path="/" element={<p>home page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("home page");
  });
});

describe("ResetRequestPage", () => {
  it("always lands on the generic sent state", async () => {
    resetRequest.mockResolvedValue({ ok: true });
    render(
      <MemoryRouter>
        <ResetRequestPage />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText("Username"), "whoever");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await screen.findByText(/if that account has an email on file/i);
    expect(resetRequest).toHaveBeenCalledWith("whoever");
  });
});

describe("RequireAuth", () => {
  function renderGuarded(initialPath: string) {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/" element={<p>home page</p>} />
          </Route>
          <Route path="/login" element={<p>login page</p>} />
          <Route path="/account/upgrade" element={<p>upgrade page</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("sends an unauthenticated visitor to /login", async () => {
    mockAuth.state = { status: "unauthenticated" };
    renderGuarded("/");
    await screen.findByText("login page");
  });

  it("holds a passwordless legacy identity at the finish-setup screen in accounts mode", async () => {
    mockAuth.state = readyState({ hasPassword: false });
    renderGuarded("/");
    await screen.findByText("upgrade page");
  });

  it("is inert in legacy mode: a passwordless identity plays as before", async () => {
    mockAuth.state = readyState({ hasPassword: false });
    mockAuth.accountsRequired = false;
    renderGuarded("/");
    await screen.findByText("home page");
  });
});
