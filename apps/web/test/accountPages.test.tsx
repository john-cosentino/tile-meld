import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";

// The auth pages and route guards (accounts-only since Phase F), with
// useAuth mocked per the repo's page-test pattern.

const mockAuth = {
  state: { status: "ready" } as Record<string, unknown>,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  changePassword: vi.fn(),
  setPortrait: vi.fn(),
};

vi.mock("../src/auth/AuthProvider.js", () => ({
  useAuth: () => mockAuth,
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
import { ResetRequestPage } from "../src/pages/ResetRequestPage.js";
import { RequireAuth } from "../src/auth/guards.js";

function readyState(overrides: Record<string, unknown> = {}) {
  return {
    status: "ready",
    playerId: "p1",
    username: "Alice",
    email: "a@example.com",
    portraitId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.state = readyState();
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
        </Routes>
      </MemoryRouter>,
    );
  }

  it("sends an unauthenticated visitor to /login", async () => {
    mockAuth.state = { status: "unauthenticated" };
    renderGuarded("/");
    await screen.findByText("login page");
  });

  it("lets a signed-in account straight through", async () => {
    renderGuarded("/");
    await screen.findByText("home page");
  });
});
