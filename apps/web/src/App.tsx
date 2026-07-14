import { BrowserRouter, Routes, Route } from "react-router-dom";
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

export function App() {
  return (
    <AuthProvider>
      <AnnouncerProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<RootLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/rooms/new" element={<CreateRoomPage />} />
              <Route path="/rooms/join" element={<JoinRoomPage />} />
              <Route path="/lobby" element={<PublicLobbyPage />} />
              <Route path="/rooms/:roomId" element={<WaitingRoomPage />} />
              <Route path="/games/:gameId" element={<TabletopPage />} />
              <Route path="/recovery" element={<RecoveryPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AnnouncerProvider>
    </AuthProvider>
  );
}
