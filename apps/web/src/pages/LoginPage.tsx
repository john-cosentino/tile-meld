import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ApiError } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";

/** Only ever navigate to an in-app path from the returnTo param -- an
 * absolute URL here would be an open redirect. */
function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, redeemRecovery } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate(returnTo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not log in. Please retry.");
      setSubmitting(false);
    }
  }

  async function onRedeemRecovery(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(undefined);
    const [playerId, ...rest] = recoveryCode.trim().split(":");
    const secret = rest.join(":");
    if (!playerId || !secret) {
      setError("A recovery code looks like: player-id:secret");
      return;
    }
    setSubmitting(true);
    try {
      await redeemRecovery(playerId, secret);
      // A recovered legacy identity has no password yet -- the finish-setup
      // gate (RequireAuth) holds every game route until /account/upgrade is
      // done, so send them straight there.
      navigate("/account/upgrade");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not redeem the recovery code.");
      setSubmitting(false);
    }
  }

  return (
    <div className="stack arcade-panel">
      <h1 className="page-title">Log in</h1>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <form className="stack" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="muted">
        New here? <Link to="/register">Create an account</Link>
        {" · "}
        <Link to="/reset">Forgot password?</Link>
      </p>
      {!showRecovery ? (
        <p className="muted">
          Played before accounts existed?{" "}
          <button type="button" className="link-button" onClick={() => setShowRecovery(true)}>
            Use your recovery code
          </button>
        </p>
      ) : (
        <form className="stack" onSubmit={(e) => void onRedeemRecovery(e)}>
          <label>
            Recovery code
            <input
              type="text"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              placeholder="player-id:secret"
              required
            />
          </label>
          <button type="submit" className="accent-cyan" disabled={submitting}>
            Redeem recovery code
          </button>
        </form>
      )}
    </div>
  );
}
