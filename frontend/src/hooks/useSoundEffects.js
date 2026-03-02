import { useRef } from 'react';

const SOUNDS = {
  HIT: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3', // Heavy punch
  BLOCK: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3', // Blunt impact
  SELECT: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3', // Tech hover
  START: 'https://assets.mixkit.co/active_storage/sfx/2533/2533-preview.mp3', // Dramatic transition
};

export const useSoundEffects = () => {
  const audioRefs = useRef({});

  const playSound = (key) => {
    if (!SOUNDS[key]) return;
    
    // Create audio object if it doesn't exist
    if (!audioRefs.current[key]) {
      audioRefs.current[key] = new Audio(SOUNDS[key]);
    }
    
    const sound = audioRefs.current[key];
    sound.currentTime = 0; // Reset to start
    sound.volume = 1.0;
    
    sound.play().catch(e => console.log("Audio playback blocked by browser until user interaction."));
  };

  return { playSound };
};
