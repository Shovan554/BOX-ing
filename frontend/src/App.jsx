import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import MainMenu from './pages/MainMenu';
import CameraTest from './pages/CameraTest';
import Multiplayer from './pages/Multiplayer';
import CreateRoom from './pages/CreateRoom';
import Leaderboard from './pages/Leaderboard';
import Settings from './pages/Settings';

function App() {
  return (
    <Router>
      <div className="w-full h-screen overflow-hidden text-white font-sans">
        <Suspense fallback={<div className="flex items-center justify-center h-full bg-black">Loading...</div>}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/menu" element={<MainMenu />} />
            <Route path="/camera-test" element={<CameraTest />} />
            <Route path="/multiplayer" element={<Multiplayer />} />
            <Route path="/create-room" element={<CreateRoom />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Suspense>
      </div>
    </Router>
  );
}

export default App;
