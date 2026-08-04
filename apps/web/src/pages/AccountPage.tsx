import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { PASSWORD_MIN_LENGTH, PORTRAIT_COUNT } from "@tile-meld/shared";
import { ApiError } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";
import { PORTRAIT_ROSTER, portraitForPlayer } from "../branding/portraits.js";

/** Profile management: portrait picker for everyone; email/password
 * management and logout for password accounts. A legacy identity sees an
 * upgrade prompt instead of credential forms. */
export function AccountPage() {
  const navigate = useNavigate();
  const { state, accountsRequired, setPortrait, changePassword, logout } = useAuth();
  const [portraitError, setPortraitError] = useState<string | undefined>(undefined);
  const [portraitStatus, setPortraitStatus] = useState<string | undefined>(undefined);
  // undefined = no unsaved selection; a value (including null = Default)
  // is a pending choice awaiting the Save button (user feedback,
  // 2026-08-04: an instant-save picker gave no confirmation).
  const [pendingPortraitId, setPendingPortraitId] = useState<number | null | undefined>(undefined);
  const [savingPortrait, setSavingPortrait] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<string | undefined>(undefined);
  const [passwordError, setPasswordError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  if (state.status !== "ready") return null;

  const savedPortraitId = state.status === "ready" ? state.portraitId : null;
  const selectedPortraitId = pendingPortraitId === undefined ? savedPortraitId : pendingPortraitId;
  const portraitDirty = selectedPortraitId !== savedPortraitId;

  function pickPortrait(portraitId: number | null): void {
    setPortraitError(undefined);
    setPortraitStatus(undefined);
    setPendingPortraitId(portraitId);
  }

  async function onSavePortrait(): Promise<void> {
    setPortraitError(undefined);
    setPortraitStatus(undefined);
    setSavingPortrait(true);
    try {
      await setPortrait(selectedPortraitId);
      setPendingPortraitId(undefined);
      setPortraitStatus("Profile picture saved.");
    } catch (err) {
      setPortraitError(
        err instanceof ApiError ? err.message : "Could not save the picture. Please retry.",
      );
    } finally {
      setSavingPortrait(false);
    }
  }

  async function onChangePassword(e: FormEvent): Promise<void> {
    e.preventDefault();
    setPasswordError(undefined);
    setPasswordStatus(undefined);
    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordStatus("Password changed. Other devices were signed out.");
    } catch (err) {
      setPasswordError(
        err instanceof ApiError ? err.message : "Could not change the password. Please retry.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onLogout(): Promise<void> {
    await logout();
    navigate("/login");
  }

  return (
    <div className="stack arcade-panel">
      <h1 className="page-title">Your account</h1>
      <p className="muted">
        Signed in as <strong>{state.username ?? "an unnamed player"}</strong>
        {state.email ? <> · {state.email}</> : null}
      </p>

      <section className="stack" aria-labelledby="portrait-heading">
        <h2 id="portrait-heading">Profile picture</h2>
        {portraitError && (
          <div className="error-banner" role="alert">
            {portraitError}
          </div>
        )}
        {portraitStatus && <p role="status">{portraitStatus}</p>}
        <div className="portrait-picker" role="radiogroup" aria-label="Profile picture">
          {Array.from({ length: PORTRAIT_COUNT }, (_, id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selectedPortraitId === id}
              className={`portrait-choice${selectedPortraitId === id ? " portrait-choice--selected" : ""}`}
              onClick={() => pickPortrait(id)}
            >
              <img src={PORTRAIT_ROSTER[id]} alt={`Portrait ${id + 1}`} width={64} height={96} />
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={selectedPortraitId === null}
            className={`portrait-choice${selectedPortraitId === null ? " portrait-choice--selected" : ""}`}
            onClick={() => pickPortrait(null)}
          >
            <span className="portrait-choice-none">Default</span>
          </button>
        </div>
        <p className="muted">
          Selected:{" "}
          <img
            src={portraitForPlayer(selectedPortraitId, -1, false)}
            alt=""
            width={32}
            height={48}
            aria-hidden="true"
          />{" "}
          {selectedPortraitId === null ? "table default" : `portrait ${selectedPortraitId + 1}`}
          {portraitDirty ? " (unsaved)" : ""}
        </p>
        <button
          type="button"
          className="primary"
          disabled={!portraitDirty || savingPortrait}
          onClick={() => void onSavePortrait()}
        >
          {savingPortrait ? "Saving…" : "Save"}
        </button>
      </section>

      {state.hasPassword ? (
        <section className="stack" aria-labelledby="password-heading">
          <h2 id="password-heading">Change password</h2>
          {passwordError && (
            <div className="error-banner" role="alert">
              {passwordError}
            </div>
          )}
          {passwordStatus && <p role="status">{passwordStatus}</p>}
          <form className="stack" onSubmit={(e) => void onChangePassword(e)}>
            <label>
              Current password
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
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
              {submitting ? "Changing…" : "Change password"}
            </button>
          </form>
        </section>
      ) : accountsRequired ? (
        <section className="stack">
          <h2>Finish account setup</h2>
          <p>
            Set an email and password to secure this identity.{" "}
            <Link to="/account/upgrade">Finish setup</Link>
          </p>
        </section>
      ) : (
        <section className="stack">
          <h2>Identity</h2>
          <p className="muted">
            This identity uses a recovery code. <Link to="/recovery">Manage recovery code</Link>
          </p>
        </section>
      )}

      {state.hasPassword && (
        <section className="stack">
          <h2>Session</h2>
          <button type="button" className="danger" onClick={() => void onLogout()}>
            Log out
          </button>
        </section>
      )}
    </div>
  );
}
