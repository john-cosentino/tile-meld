import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "./AuthProvider.js";

// Route guards (accounts-only since Phase F). RootLayout has already
// handled the loading/error states before any Outlet renders, so these
// only see "ready" or "unauthenticated".

/** Wraps the game routes: unauthenticated users go to /login with a
 * return path. */
export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "unauthenticated") {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
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
