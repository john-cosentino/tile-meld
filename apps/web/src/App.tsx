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

// AuthProvider fires POST /api/identity on mount and AnnouncerProvider is
// app-wide plumbing -- both belong only to the real, server-backed routes.
// They live in a pathless layout route so the dev-only gallery below mounts
// with neither: no identity bootstrap, no API call. (Same pattern as the
// 2026-07 static prototype, which verified build-time dead-code
// elimination of the prototype chunk from `vite build` output.)
function AppProviders() {
  return (
    <AuthProvider>
      <AnnouncerProvider>
        <Outlet />
      </AnnouncerProvider>
    </AuthProvider>
  );
}

// The `import.meta.env.DEV` check must be written literally at this call
// site for Vite's dead-code elimination to strip the dynamic import() --
// and with it the gallery's entire JS+CSS chunk -- from production builds.
const ArcadeKitGallery = import.meta.env.DEV
  ? lazy(() =>
      import("./prototypes/arcade-kit-gallery/ArcadeKitGallery.js").then((m) => ({
        default: m.ArcadeKitGallery,
      })),
    )
  : null;

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {ArcadeKitGallery && (
          <Route
            path="/prototype/arcade-kit"
            element={
              <Suspense fallback={null}>
                <ArcadeKitGallery />
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
