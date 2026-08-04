import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { PASSWORD_MIN_LENGTH } from "@tile-meld/shared";
import { ApiError } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";

/** Finish-setup screen for a legacy recovery-code identity in accounts
 * mode: set an email and password, keep the playerId/username/games.
 * RequireAuth funnels every game route here until it's done. */
export function UpgradeAccountPage() {
  const navigate = useNavigate();
  const { state, upgradeAccount } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  if (state.status === "unauthenticated") return <Navigate to="/login" replace />;
  if (state.status !== "ready") return null;
  if (state.hasPassword) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      await upgradeAccount(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not finish setup. Please retry.");
      setSubmitting(false);
    }
  }

  return (
    <div className="stack arcade-panel">
      <h1 className="page-title">Finish setting up your account</h1>
      <p>
        Welcome back
        {state.username ? (
          <>
            , <strong>{state.username}</strong>
          </>
        ) : null}
        ! Accounts have replaced recovery codes. Choose a password (and an email in case you forget
        it) -- your username and games stay exactly as they are.
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <form className="stack" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
          />
        </label>
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? "Saving…" : "Finish setup"}
        </button>
      </form>
      <p className="muted">
        After this, your old recovery code stops working -- you'll sign in with your username and
        password.
      </p>
    </div>
  );
}
