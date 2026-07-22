import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { UsernameSchema } from "@tile-meld/shared";
import { useAuth } from "../auth/AuthProvider.js";
import { api, ApiError } from "../api/client.js";

/** Minimal claim UI (Phase 1): lets an anonymous or legacy identity claim a
 * globally unique username, or shows it read-only once claimed. Client-side
 * validation here is only for quick feedback -- the server re-validates and
 * its unique index is the final word on availability. */
function UsernameSection() {
  const { state, claimUsername } = useAuth();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  if (state.status !== "ready") return null;

  if (state.username) {
    return (
      <div className="card stack">
        <h2>Username</h2>
        <p>
          Your username is <strong>{state.username}</strong>. It's globally unique and can't be
          changed once claimed.
        </p>
      </div>
    );
  }

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(undefined);
    const trimmed = value.trim();
    const parsed = UsernameSchema.safeParse(trimmed);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid username.");
      return;
    }
    setSubmitting(true);
    try {
      await claimUsername(parsed.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not claim that username.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card stack" onSubmit={(e) => void onSubmit(e)}>
      <h2>Choose a username</h2>
      <p className="muted">
        3-24 characters: letters, numbers, underscores, and hyphens only, no spaces. Globally unique
        and permanent once claimed.
      </p>
      <label className="stack" style={{ gap: "var(--space-1)" }}>
        Username
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          minLength={3}
          maxLength={24}
          required
        />
      </label>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <button type="submit" className="primary" disabled={submitting}>
        {submitting ? "Claiming…" : "Claim username"}
      </button>
    </form>
  );
}

function RecoveryCodeDisplay({
  playerId,
  secret,
}: {
  readonly playerId: string;
  readonly secret: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(`${playerId}:${secret}`);
    setCopied(true);
  }
  return (
    <div className="card stack" role="alert">
      <strong>Save this recovery code now -- it will never be shown again.</strong>
      <p className="muted">
        Anyone with this code can access your games. Store it somewhere safe (a password manager is
        ideal).
      </p>
      <dl className="stack" style={{ gap: "var(--space-1)" }}>
        <div>
          <dt className="muted">Player ID</dt>
          <dd style={{ fontFamily: "monospace", wordBreak: "break-all" }}>{playerId}</dd>
        </div>
        <div>
          <dt className="muted">Recovery secret</dt>
          <dd style={{ fontFamily: "monospace", wordBreak: "break-all" }}>{secret}</dd>
        </div>
      </dl>
      <button onClick={() => void copy()}>{copied ? "Copied!" : "Copy to clipboard"}</button>
    </div>
  );
}

export function RecoveryPage() {
  const { state, acknowledgeRecoverySecret, rotateRecovery } = useAuth();
  const navigate = useNavigate();
  const [recoverPlayerId, setRecoverPlayerId] = useState("");
  const [recoverSecret, setRecoverSecret] = useState("");
  const [recoverError, setRecoverError] = useState<string | undefined>(undefined);
  const [rotated, setRotated] = useState<string | undefined>(undefined);
  const [rotateError, setRotateError] = useState<string | undefined>(undefined);

  if (state.status !== "ready") return null;

  async function onRecoverSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setRecoverError(undefined);
    try {
      await api.recoverSession(recoverPlayerId.trim(), recoverSecret.trim());
      localStorage.setItem(
        "tilemeld.identity",
        JSON.stringify({ playerId: recoverPlayerId.trim(), recoverySecret: recoverSecret.trim() }),
      );
      navigate("/");
      location.reload();
    } catch (err) {
      setRecoverError(err instanceof ApiError ? err.message : "Could not recover that session.");
    }
  }

  async function onRotate(): Promise<void> {
    setRotateError(undefined);
    try {
      const secret = await rotateRecovery();
      setRotated(secret);
    } catch (err) {
      setRotateError(err instanceof ApiError ? err.message : "Could not rotate the recovery code.");
    }
  }

  return (
    <div className="stack">
      <h1>Recovery</h1>

      {state.newRecoverySecret && (
        <div className="stack">
          <RecoveryCodeDisplay playerId={state.playerId} secret={state.newRecoverySecret} />
          <button className="primary" onClick={acknowledgeRecoverySecret}>
            I've saved it
          </button>
        </div>
      )}

      {rotated && <RecoveryCodeDisplay playerId={state.playerId} secret={rotated} />}

      <UsernameSection />

      <div className="card stack">
        <h2>Rotate your recovery code</h2>
        <p className="muted">
          Generates a new recovery secret and immediately invalidates the old one. Use this if you
          think your old code was exposed.
        </p>
        {rotateError && (
          <div className="error-banner" role="alert">
            {rotateError}
          </div>
        )}
        <button onClick={() => void onRotate()}>Rotate recovery code</button>
      </div>

      <form className="card stack" onSubmit={(e) => void onRecoverSubmit(e)}>
        <h2>Recover a session on this device</h2>
        <p className="muted">
          Already have a recovery code from another device or browser? Enter it here to switch this
          browser to that identity.
        </p>
        <label className="stack" style={{ gap: "var(--space-1)" }}>
          Player ID
          <input
            value={recoverPlayerId}
            onChange={(e) => setRecoverPlayerId(e.target.value)}
            required
          />
        </label>
        <label className="stack" style={{ gap: "var(--space-1)" }}>
          Recovery secret
          <input
            value={recoverSecret}
            onChange={(e) => setRecoverSecret(e.target.value)}
            required
          />
        </label>
        {recoverError && (
          <div className="error-banner" role="alert">
            {recoverError}
          </div>
        )}
        <button type="submit" className="primary">
          Recover session
        </button>
      </form>
    </div>
  );
}
