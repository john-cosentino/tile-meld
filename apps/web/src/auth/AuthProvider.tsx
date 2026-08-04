import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { MeResponse } from "@tile-meld/shared";
import { api, ApiError } from "../api/client.js";

// Session bootstrap (accounts-only since Phase F, 2026-08-04): a missing
// or expired session resolves to "unauthenticated" and the route guards
// send the user to /login. There is no guest minting and nothing
// credential-shaped ever touches localStorage. The session cookie itself
// is httpOnly -- the client never reads or writes it; every fetch/socket
// just carries it automatically.

export type AuthState =
  | { readonly status: "loading" }
  | { readonly status: "unauthenticated" }
  | {
      readonly status: "ready";
      readonly playerId: string;
      /** Always set for an account (registration claims it); nullable in
       * the wire type for schema stability. */
      readonly username: string | null;
      /** Reset-only contact address. */
      readonly email: string | null;
      /** The picked roster portrait, or null for the seat-order default. */
      readonly portraitId: number | null;
    }
  | { readonly status: "error"; readonly message: string };

type AuthContextValue = {
  readonly state: AuthState;
  readonly login: (username: string, password: string) => Promise<void>;
  readonly register: (username: string, email: string, password: string) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  readonly setPortrait: (portraitId: number | null) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readyFromMe(me: MeResponse): AuthState {
  return {
    status: "ready",
    playerId: me.playerId,
    username: me.username,
    email: me.email,
    portraitId: me.portraitId,
  };
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  // React StrictMode intentionally double-invokes effects in development;
  // the ref survives StrictMode's fake remount so the bootstrap genuinely
  // runs once (see git history for the original Set-Cookie race this
  // guarded against in the guest-minting era).
  const bootstrapStarted = useRef(false);

  useEffect(() => {
    if (bootstrapStarted.current) return;
    bootstrapStarted.current = true;

    async function bootstrap(): Promise<void> {
      try {
        setState(readyFromMe(await api.me()));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setState({ status: "unauthenticated" });
          return;
        }
        setState({
          status: "error",
          message:
            err instanceof ApiError ? err.message : "Could not establish a session. Please retry.",
        });
      }
    }
    void bootstrap();
  }, []);

  const refreshToReady = useCallback(async (): Promise<void> => {
    setState(readyFromMe(await api.me()));
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<void> => {
      await api.login(username, password);
      await refreshToReady();
    },
    [refreshToReady],
  );

  const register = useCallback(
    async (username: string, email: string, password: string): Promise<void> => {
      await api.register(username, email, password);
      await refreshToReady();
    },
    [refreshToReady],
  );

  const logout = useCallback(async (): Promise<void> => {
    await api.logout();
    setState({ status: "unauthenticated" });
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<void> => {
      await api.changePassword(currentPassword, newPassword);
    },
    [],
  );

  const setPortrait = useCallback(async (portraitId: number | null): Promise<void> => {
    const result = await api.setPortrait(portraitId);
    setState((prev) =>
      prev.status === "ready" ? { ...prev, portraitId: result.portraitId } : prev,
    );
  }, []);

  return (
    <AuthContext.Provider value={{ state, login, register, logout, changePassword, setPortrait }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
