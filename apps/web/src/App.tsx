import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Outlet } from "react-router";
import { AuthProvider } from "./auth/AuthProvider.js";
import { AnnouncerProvider } from "./announcer/AnnouncerProvider.js";
import { RootLayout } from "./layout/RootLayout.js";
import { HomePage } from "./pages/HomePage.js";
import { CreateRoomPage } from "./pages/CreateRoomPage.js";
import { JoinRoomPage } from "./pages/JoinRoomPage.js";
import { PublicLobbyPage } from "./pages/PublicLobbyPage.js";
import { WaitingRoomPage } from "./pages/WaitingRoomPage.js";
import { TabletopPage } from "./pages/TabletopPage.js";
import { RecoveryPage } from "./pages/RecoveryPage.js";
import { PROTOTYPE_ROUTE_ENABLED } from "./prototypes/tabletop-concept/devOnly.js";

// AuthProvider fires POST /api/identity on mount (see AuthProvider.tsx) and
// AnnouncerProvider is otherwise app-wide plumbing -- both belong only to
// the real, server-backed routes. Split into their own pathless layout
// route (rather than wrapping <Routes> as a whole, as before) so a route
// outside this one -- the dev-only prototype below -- mounts with neither:
// no identity bootstrap, no API call, no live app context at all. Every
// real route below gets the exact same providers/values as before, just
// nested one layout-route deeper; behavior-identical, confirmed by the
// existing web test suite passing unchanged.
function AppProviders() {
  return (
    <AuthProvider>
      <AnnouncerProvider>
        <Outlet />
      </AnnouncerProvider>
    </AuthProvider>
  );
}

// The `import.meta.env.DEV` check has to be written literally at this call
// site (not read indirectly through PROTOTYPE_ROUTE_ENABLED) for Vite's
// build-time dead-code elimination to actually strip the dynamic import()
// -- and with it, the prototype's entire JS+CSS chunk -- out of `vite
// build`'s output, rather than merely leaving it unreferenced. Verified
// directly: after a production build, apps/web/dist contains no
// TabletopConceptPrototype chunk file at all and no prototype-only mock
// string anywhere (see docs/meld-masters-tabletop-static-prototype-
// summary.md), not just "renders nothing" at runtime.
const TabletopConceptPrototype = import.meta.env.DEV
  ? lazy(() =>
      import("./prototypes/tabletop-concept/TabletopConceptPrototype.js").then((m) => ({
        default: m.TabletopConceptPrototype,
      })),
    )
  : null;

// Same proven pattern as TabletopConceptPrototype above -- the literal
// import.meta.env.DEV ternary at this exact call site, not read indirectly
// through PROTOTYPE_ROUTE_ENABLED, is what lets Vite's dead-code
// elimination strip this dynamic import() (and the asset lab's entire
// chunk) out of `vite build`'s output. Reuses the SAME
// PROTOTYPE_ROUTE_ENABLED flag as the route guard below -- one dev-only
// concept, two routes.
const ConceptAssetLab = import.meta.env.DEV
  ? lazy(() =>
      import("./prototypes/tabletop-assets/ConceptAssetLab.js").then((m) => ({
        default: m.ConceptAssetLab,
      })),
    )
  : null;

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {PROTOTYPE_ROUTE_ENABLED && TabletopConceptPrototype && (
          <Route
            path="/prototype/tabletop-concept"
            element={
              <Suspense fallback={null}>
                <TabletopConceptPrototype />
              </Suspense>
            }
          />
        )}
        {PROTOTYPE_ROUTE_ENABLED && ConceptAssetLab && (
          <Route
            path="/prototype/tabletop-assets"
            element={
              <Suspense fallback={null}>
                <ConceptAssetLab />
              </Suspense>
            }
          />
        )}
        <Route element={<AppProviders />}>
          <Route element={<RootLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/rooms/new" element={<CreateRoomPage />} />
            <Route path="/rooms/join" element={<JoinRoomPage />} />
            <Route path="/lobby" element={<PublicLobbyPage />} />
            <Route path="/rooms/:roomId" element={<WaitingRoomPage />} />
            <Route path="/games/:gameId" element={<TabletopPage />} />
            <Route path="/recovery" element={<RecoveryPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
