import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { PASSWORD_MIN_LENGTH } from "@tile-meld/shared";
import { api, ApiError } from "../api/client.js";

/** Landing page for the emailed reset link (/reset/confirm?token=...).
 * A successful confirm also signs the user in (the token proved control
 * of the account's email), so this navigates straight home. */
export function ResetConfirmPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      await api.resetConfirm(token, newPassword);
      // The provider bootstrapped before this session existed; a full
      // reload re-runs it against the fresh cookie.
      navigate("/");
      location.reload();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not reset the password. The link may have expired.",
      );
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="stack arcade-panel">
        <h1 className="page-title">Reset password</h1>
        <div className="error-banner" role="alert">
          This page needs the link from your reset email.
        </div>
        <p className="muted">
          <Link to="/reset">Request a new link</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="stack arcade-panel">
      <h1 className="page-title">Choose a new password</h1>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <form className="stack" onSubmit={(e) => void onSubmit(e)}>
        <label>
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
          />
        </label>
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? "Resetting…" : "Set new password"}
        </button>
      </form>
      <p className="muted">
        Link expired? <Link to="/reset">Request a new one</Link>
      </p>
    </div>
  );
}
