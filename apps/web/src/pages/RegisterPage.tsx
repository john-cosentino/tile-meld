import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { PASSWORD_MIN_LENGTH, UsernameSchema } from "@tile-meld/shared";
import { ApiError } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(undefined);
    // Same-rules pre-check for fast feedback -- the server re-validates.
    const parsed = UsernameSchema.safeParse(username);
    if (!parsed.success) {
      setError("Usernames are 3-24 characters: letters, digits, _ or -.");
      return;
    }
    setSubmitting(true);
    try {
      await register(parsed.data, email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the account.");
      setSubmitting(false);
    }
  }

  return (
    <div className="stack arcade-panel">
      <h1 className="page-title">Create an account</h1>
      <p className="muted">
        Your username is public and permanent; your email is used only to reset a forgotten
        password.
      </p>
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
          {submitting ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="muted">
        Already have one? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
