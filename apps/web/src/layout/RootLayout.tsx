import { Link, Outlet, useMatch } from "react-router";
import { useAuth } from "../auth/AuthProvider.js";
import { PRODUCT_NAME } from "@tile-meld/shared";
import { NotificationsControl } from "../push/NotificationsControl.js";
import monogramSrc from "../assets/brand/meld-masters-monogram-header.png";

export function RootLayout() {
  const { state } = useAuth();
  // The tabletop's arcade-cabinet composition needs the full viewport width
  // (docs/meld-masters-tabletop-fidelity-summary.md) -- every other screen
  // keeps the shared centered .page column untouched. TabletopPage owns its
  // own max-width/padding/grid once .page's own constraint is lifted here.
  const isTabletop = useMatch("/games/:gameId") !== null;

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
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="app-header row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <Link to="/" className="brand-wordmark">
            {/* Decorative only -- the link's accessible name comes from the
                text below; an empty alt keeps this image invisible to
                assistive technology instead of doubling the name up. */}
            <img src={monogramSrc} alt="" width={32} height={32} className="brand-monogram" />
            <span className="brand-wordmark-text">{PRODUCT_NAME}</span>
          </Link>
          <nav className="app-nav row" aria-label="Main navigation">
            <Link to="/">Home</Link>
            <Link to="/rooms/new">Create Room</Link>
            <Link to="/rooms/join">Join Room by Name</Link>
            <Link to="/lobby">Public Lobby</Link>
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
      {/* tabIndex={-1} so activating the skip link above actually moves
          focus here -- an in-page fragment link only scrolls without it,
          leaving keyboard/AT users with no indication anything happened. */}
      <main id="main-content" className={isTabletop ? "page page--tabletop" : "page"} tabIndex={-1}>
        <Outlet />
      </main>
    </>
  );
}
