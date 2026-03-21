import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const BackgroundMusic = ({ shouldPlayMusic, isMuted }) => {
  const audioRef = useRef(null);
  const location = useLocation();
  const [isPlaying, setIsPlaying] = useState(false);

  // Define paths where music should stop
  const silentPaths = ['/multiplayer', '/camera-test', '/multiplayer-arena'];
  const isSilentPath = silentPaths.includes(location.pathname);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    audio.volume = isMuted ? 0 : 0.4;

    if (shouldPlayMusic && !isSilentPath) {
      // Try playing
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch((error) => {
            console.warn("Audio playback failed:", error);
            // Most browsers require user interaction
            const handleInteraction = () => {
              audio.play();
              setIsPlaying(true);
              document.removeEventListener('click', handleInteraction);
            };
            document.addEventListener('click', handleInteraction);
          });
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }

    return () => {
      // Cleanup
    };
  }, [shouldPlayMusic, isSilentPath, location.pathname, isMuted]);

  return (
    <audio
      ref={audioRef}
      src="/assets/music/background.mp3"
      loop
      style={{ display: 'none' }}
    />
  );
};

export default BackgroundMusic;
