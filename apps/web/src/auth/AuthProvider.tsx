import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "../api/client.js";

// Bootstraps a player identity/session on first load, per docs/opus-
// implementation-plan.md §10.1 screen 9 (Recovery). There is no accounts
// system in the MVP: a player is a recovery secret. We keep {playerId,
// recoverySecret} in localStorage and, on every load, either recover a
// fresh session from it (covers both "cookie expired" and "brand new
// browser session") or mint a new identity if nothing is stored yet. The
// session cookie itself is httpOnly -- the client never reads or writes
// it directly; every fetch/socket connection just carries it automatically
// via credentials.

const STORAGE_KEY = "tilemeld.identity";

type StoredIdentity = { readonly playerId: string; readonly recoverySecret: string };

function readStoredIdentity(): StoredIdentity | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export type AuthState =
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly playerId: string;
      /** Only set immediately after a brand-new identity is created --
       * shown once so the player can save it, then cleared via
       * acknowledgeRecoverySecret(). Never re-derivable after that, by
       * design (the server never returns it again). */
      readonly newRecoverySecret: string | null;
    }
  | { readonly status: "error"; readonly message: string };

type AuthContextValue = {
  readonly state: AuthState;
  readonly acknowledgeRecoverySecret: () => void;
  readonly rotateRecovery: () => Promise<string>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  // React StrictMode intentionally double-invokes effects in development
  // (mount -> cleanup -> mount again) to surface non-idempotent effects.
  // Without this guard, that fires two POST /api/identity (or
  // /session/recover) calls back-to-back; both set the session cookie via
  // Set-Cookie, and whichever response happens to arrive *last* wins the
  // cookie regardless of which one this component's React state ended up
  // reflecting -- a real, reproducible bug where the browser's actual
  // session and the app's notion of "who am I" point at two different
  // players. A ref survives StrictMode's fake remount (unlike a plain
  // local variable), so this makes the bootstrap genuinely run once.
  const bootstrapStarted = useRef(false);

  useEffect(() => {
    if (bootstrapStarted.current) return;
    bootstrapStarted.current = true;

    async function bootstrap(): Promise<void> {
      const stored = readStoredIdentity();
      try {
        if (stored) {
          await api.recoverSession(stored.playerId, stored.recoverySecret);
          setState({ status: "ready", playerId: stored.playerId, newRecoverySecret: null });
          return;
        }
        const created = await api.createIdentity();
        writeStoredIdentity(created);
        setState({
          status: "ready",
          playerId: created.playerId,
          newRecoverySecret: created.recoverySecret,
        });
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : "Could not establish a session. Please retry.";
        setState({ status: "error", message });
      }
    }
    void bootstrap();
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

  return (
    <AuthContext.Provider value={{ state, acknowledgeRecoverySecret, rotateRecovery }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
