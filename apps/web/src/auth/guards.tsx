import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "./AuthProvider.js";

// Route guards (accounts plan, Phase D). Both only ever ENFORCE in
// accounts mode -- with accountsRequired=false the tree renders exactly as
// it did before accounts existed. RootLayout has already handled the
// loading/error states before any Outlet renders, so these only see
// "ready" or "unauthenticated".

/** Wraps the game routes: unauthenticated users go to /login (with a
 * return path), and a signed-in legacy identity that has not finished
 * setting up its account is held at /account/upgrade first. */
export function RequireAuth() {
  const { state, accountsRequired } = useAuth();
  const location = useLocation();

  if (state.status === "unauthenticated") {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }
  if (state.status === "ready" && accountsRequired && !state.hasPassword) {
    return <Navigate to="/account/upgrade" replace />;
  }
  return <Outlet />;
}

/** Wraps login/register/reset: an already-signed-in player has no business
 * there -- send them home. */
export function RequireAnon() {
  const { state } = useAuth();
  if (state.status === "ready") {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
