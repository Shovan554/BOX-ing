import React, { Suspense, useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import MainMenu from './pages/MainMenu';
import CameraTest from './pages/CameraTest';
import Multiplayer from './pages/Multiplayer';
import CreateRoom from './pages/CreateRoom';
import Leaderboard from './pages/Leaderboard';
import Settings from './pages/Settings';
import PovTest from './pages/PovTest';
import AuthPage from './pages/AuthPage';
import Results from './pages/Results';
import Intro from './components/Intro';
import BackgroundMusic from './components/BackgroundMusic';
import { Maximize, Minimize, Volume2, VolumeX } from 'lucide-react';

function App() {
  const [introFinished, setIntroFinished] = useState(false);
  const [shouldPlayMusic, setShouldPlayMusic] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // One-time clear of old tokens as requested by user
    const hasClearedOldToken = localStorage.getItem('has_cleared_old_token_v1');
    if (!hasClearedOldToken) {
      localStorage.removeItem('access_token');
      localStorage.setItem('has_cleared_old_token_v1', 'true');
    }
  }, []);

  const isAuthenticated = !!localStorage.getItem('access_token');

  useEffect(() => {
    // If not authenticated and not already on the auth page, redirect to auth
    if (introFinished && !isAuthenticated && location.pathname !== '/auth') {
      navigate('/auth');
    }
  }, [introFinished, isAuthenticated, location.pathname, navigate]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn(`Fullscreen request failed: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // Attempt fullscreen on first interaction
  useEffect(() => {
    const handleFirstInteraction = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      document.removeEventListener('mousedown', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
    
    document.addEventListener('mousedown', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);
    return () => {
      document.removeEventListener('mousedown', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  return (
    <div className="w-full h-screen overflow-hidden text-white font-sans relative">
      {!introFinished && (
        <Intro 
          onFinish={() => {
            setIntroFinished(true);
            setShouldPlayMusic(true);
            navigate('/'); // Force redirect to title page ONCE
          }} 
        />
      )}
      
      <BackgroundMusic shouldPlayMusic={shouldPlayMusic} isMuted={isMuted} />

      {introFinished && (
        <>
          {/* Global Controls Overlay - Hidden in Arena (/pov-test) */}
          {location.pathname !== '/pov-test' && (
            <div className="fixed top-4 right-4 z-[100] flex items-center gap-2">
              {/* Mute Button */}
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-full transition-all duration-300 group"
                title={isMuted ? "Unmute Music" : "Mute Music"}
              >
                {isMuted ? (
                  <VolumeX className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
                ) : (
                  <Volume2 className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
                )}
              </button>

              {/* Global Fullscreen Button */}
              <button 
                onClick={toggleFullscreen}
                className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-full transition-all duration-300 group"
                title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              >
                {isFullscreen ? (
                  <Minimize className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
                ) : (
                  <Maximize className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
                )}
              </button>
            </div>
          )}

          <Suspense fallback={<div className="flex items-center justify-center h-full bg-black">Loading...</div>}>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/" element={<LandingPage />} />
              <Route path="/menu" element={<MainMenu />} />
              <Route path="/camera-test" element={<CameraTest />} />
              <Route path="/multiplayer" element={<Multiplayer />} />
              <Route path="/create-room" element={<CreateRoom />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/pov-test" element={<PovTest />} />
              <Route path="/results" element={<Results />} />
            </Routes>
          </Suspense>
        </>
      )}
    </div>
  );
}

export default App;
