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

// Session bootstrap (accounts plan, Phase D). Two modes, decided by the
// server's GET /api/config:
//
// - accountsRequired=false (legacy, today's production default): a player
//   is a recovery secret. {playerId, recoverySecret} lives in localStorage
//   and every load either recovers a session from it or mints a fresh
//   guest identity -- exactly the pre-accounts behavior.
// - accountsRequired=true: no guest minting. A missing/expired session
//   resolves to "unauthenticated" and the route guards send the user to
//   /login. Nothing credential-shaped is ever written to localStorage in
//   this mode.
//
// Either way the session cookie itself is httpOnly -- the client never
// reads or writes it; every fetch/socket just carries it automatically.

/** Single source of truth for the legacy localStorage key -- RecoveryPage
 * imports this rather than repeating the literal. */
export const IDENTITY_STORAGE_KEY = "tilemeld.identity";

type StoredIdentity = { readonly playerId: string; readonly recoverySecret: string };

function readStoredIdentity(): StoredIdentity | undefined {
  try {
    const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StoredIdentity>;
    if (typeof parsed.playerId !== "string" || typeof parsed.recoverySecret !== "string") {
      return undefined;
    }
    return { playerId: parsed.playerId, recoverySecret: parsed.recoverySecret };
  } catch {
    return undefined;
  }
}

function writeStoredIdentity(identity: StoredIdentity): void {
  localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
}

function clearStoredIdentity(): void {
  try {
    localStorage.removeItem(IDENTITY_STORAGE_KEY);
  } catch {
    // Storage unavailable -- nothing to clear.
  }
}

export type AuthState =
  | { readonly status: "loading" }
  /** Accounts mode only: no session and no way to mint one silently --
   * the route guards steer to /login. */
  | { readonly status: "unauthenticated" }
  | {
      readonly status: "ready";
      readonly playerId: string;
      /** Null until claimed (legacy identities) -- an account always has
       * one (registration claims it). */
      readonly username: string | null;
      /** Reset-only contact address; null for legacy identities. */
      readonly email: string | null;
      /** The picked roster portrait, or null for the seat-order default. */
      readonly portraitId: number | null;
      /** False only for a legacy recovery-code identity that has not set a
       * password yet -- drives the finish-setup gate in accounts mode. */
      readonly hasPassword: boolean;
      /** Only set immediately after a brand-new legacy identity is minted --
       * shown once so the player can save it, then cleared via
       * acknowledgeRecoverySecret(). Always null in accounts mode. */
      readonly newRecoverySecret: string | null;
    }
  | { readonly status: "error"; readonly message: string };

type AuthContextValue = {
  readonly state: AuthState;
  /** From GET /api/config -- false until loaded, which only ever delays
   * gate enforcement, never wrongly locks a legacy user out. */
  readonly accountsRequired: boolean;
  readonly login: (username: string, password: string) => Promise<void>;
  readonly register: (username: string, email: string, password: string) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  readonly upgradeAccount: (email: string, password: string) => Promise<void>;
  readonly setPortrait: (portraitId: number | null) => Promise<void>;
  /** Legacy path: redeem a recovery code (from the login page) -- leaves
   * the user "ready" without a password, which the finish-setup gate then
   * routes to /account/upgrade. */
  readonly redeemRecovery: (playerId: string, recoverySecret: string) => Promise<void>;
  readonly acknowledgeRecoverySecret: () => void;
  readonly rotateRecovery: () => Promise<string>;
  readonly claimUsername: (username: string) => Promise<string>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readyFromMe(me: MeResponse, newRecoverySecret: string | null = null): AuthState {
  return {
    status: "ready",
    playerId: me.playerId,
    username: me.username,
    email: me.email,
    portraitId: me.portraitId,
    hasPassword: me.hasPassword,
    newRecoverySecret,
  };
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [accountsRequired, setAccountsRequired] = useState(false);
  // React StrictMode intentionally double-invokes effects in development;
  // without this guard the bootstrap would race two session-establishing
  // requests whose Set-Cookie responses can interleave (see the original
  // pre-accounts incident note in git history). A ref survives
  // StrictMode's fake remount, making the bootstrap genuinely run once.
  const bootstrapStarted = useRef(false);

  useEffect(() => {
    if (bootstrapStarted.current) return;
    bootstrapStarted.current = true;

    async function bootstrap(): Promise<void> {
      let required = false;
      try {
        required = (await api.getConfig()).accountsRequired;
        setAccountsRequired(required);
      } catch {
        // Config unavailable (dev server hiccup): stay in legacy behavior;
        // a genuinely accounts-required server still refuses guest minting
        // below, so this fails safe on both sides.
      }

      try {
        setState(readyFromMe(await api.me()));
        return;
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 401) {
          setState({
            status: "error",
            message:
              err instanceof ApiError
                ? err.message
                : "Could not establish a session. Please retry.",
          });
          return;
        }
      }

      if (required) {
        setState({ status: "unauthenticated" });
        return;
      }

      // Legacy mode: recover from the stored secret or mint a fresh guest.
      const stored = readStoredIdentity();
      try {
        if (stored) {
          await api.recoverSession(stored.playerId, stored.recoverySecret);
          setState(readyFromMe(await api.me()));
          return;
        }
        const created = await api.createIdentity();
        writeStoredIdentity({ playerId: created.playerId, recoverySecret: created.recoverySecret });
        setState(readyFromMe(await api.me(), created.recoverySecret));
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : "Could not establish a session. Please retry.";
        setState({ status: "error", message });
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

  const redeemRecovery = useCallback(
    async (playerId: string, recoverySecret: string): Promise<void> => {
      await api.recoverSession(playerId, recoverySecret);
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

  const upgradeAccount = useCallback(
    async (email: string, password: string): Promise<void> => {
      await api.upgradeAccount(email, password);
      // The recovery credential is retired server-side; drop the local copy
      // so this browser can never silently re-authenticate with it.
      clearStoredIdentity();
      await refreshToReady();
    },
    [refreshToReady],
  );

  const setPortrait = useCallback(async (portraitId: number | null): Promise<void> => {
    const result = await api.setPortrait(portraitId);
    setState((prev) =>
      prev.status === "ready" ? { ...prev, portraitId: result.portraitId } : prev,
    );
  }, []);

  const acknowledgeRecoverySecret = useCallback(() => {
    setState((prev) => (prev.status === "ready" ? { ...prev, newRecoverySecret: null } : prev));
  }, []);

  const rotateRecovery = useCallback(async (): Promise<string> => {
    const { recoverySecret } = await api.rotateRecovery();
    setState((prev) => {
      if (prev.status !== "ready") return prev;
      writeStoredIdentity({ playerId: prev.playerId, recoverySecret });
      return prev;
    });
    return recoverySecret;
  }, []);

  const claimUsername = useCallback(async (username: string): Promise<string> => {
    const result = await api.claimUsername(username);
    setState((prev) => (prev.status === "ready" ? { ...prev, username: result.username } : prev));
    return result.username;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        state,
        accountsRequired,
        login,
        register,
        logout,
        changePassword,
        upgradeAccount,
        setPortrait,
        redeemRecovery,
        acknowledgeRecoverySecret,
        rotateRecovery,
        claimUsername,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
