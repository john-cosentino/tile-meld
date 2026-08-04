import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api, ApiError } from "../api/client.js";

export function ResetRequestPage() {
  const [username, setUsername] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      await api.resetRequest(username);
      setSent(true);
    } catch (err) {
      // Only transport/rate-limit errors reach here -- the endpoint's
      // success response is deliberately identical for every username.
      setError(err instanceof ApiError ? err.message : "Could not send the request. Please retry.");
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="stack arcade-panel">
        <h1 className="page-title">Check your email</h1>
        <p role="status">
          If that account has an email on file, a reset link is on its way. The link expires in 30
          minutes.
        </p>
        <p className="muted">
          <Link to="/login">Back to log in</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="stack arcade-panel">
      <h1 className="page-title">Forgot password</h1>
      <p className="muted">Enter your username and we'll email you a reset link.</p>
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
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="muted">
        <Link to="/login">Back to log in</Link>
      </p>
    </div>
  );
}
