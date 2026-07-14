import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.js";
import { PRODUCT_NAME } from "@tile-meld/shared";
import { NotificationsControl } from "../push/NotificationsControl.js";

export function RootLayout() {
  const { state } = useAuth();

  if (state.status === "loading") {
    return (
      <main className="page">
        <p role="status">Loading {PRODUCT_NAME}…</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="page">
        <h1>{PRODUCT_NAME}</h1>
        <div className="error-banner" role="alert">
          {state.message}
        </div>
        <button onClick={() => location.reload()}>Retry</button>
      </main>
    );
  }

  return (
    <>
      <a href="#main-content" className="visually-hidden">
        Skip to main content
      </a>
      <header
        className="row"
        style={{
          padding: "var(--space-4)",
          borderBottom: "1px solid var(--color-border)",
          justifyContent: "space-between",
        }}
      >
        <div className="row">
          <Link
            to="/"
            style={{ fontWeight: 700, textDecoration: "none", color: "var(--color-text)" }}
          >
            {PRODUCT_NAME}
          </Link>
          <nav className="row" aria-label="Main navigation">
            <Link to="/lobby">Public Lobby</Link>
            <Link to="/rooms/new">Create Room</Link>
            <Link to="/rooms/join">Join by Code</Link>
            <Link to="/recovery">Recovery</Link>
          </nav>
        </div>
        <NotificationsControl />
      </header>
      {state.newRecoverySecret && (
        <div
          className="error-banner"
          role="alert"
          style={{ margin: "var(--space-4) auto", maxWidth: 960 }}
        >
          You're new here -- <Link to="/recovery">save your recovery code</Link> so you can get back
          into your games from another device or if this browser forgets you.
        </div>
      )}
      <main id="main-content" className="page">
        <Outlet />
      </main>
    </>
  );
}
