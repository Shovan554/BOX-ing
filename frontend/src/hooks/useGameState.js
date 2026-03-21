import { useState, useEffect, useCallback, useRef } from 'react';

export const PHASES = {
  INTRO: 'intro',
  COUNTDOWN: 'countdown',
  FIGHTING: 'fighting',
  RESULT: 'result'
};

export const useGameState = (initialHP = 100) => {
  const [playerHP, setPlayerHP] = useState(initialHP);
  const [opponentHP, setOpponentHP] = useState(initialHP);
  const [phase, setPhase] = useState(PHASES.INTRO);
  const [countdown, setCountdown] = useState(3);
  const [winner, setWinner] = useState(null);
  
  const blockTimeoutRef = useRef(null);
  const [isBlocking, setIsBlocking] = useState(false);

  // Set block window
  const startBlock = useCallback(() => {
    setIsBlocking(true);
    if (blockTimeoutRef.current) clearTimeout(blockTimeoutRef.current);
    blockTimeoutRef.current = setTimeout(() => {
      setIsBlocking(false);
    }, 1000); // Animation length approximately
  }, []);

  const stopBlock = useCallback(() => {
    setIsBlocking(false);
    if (blockTimeoutRef.current) clearTimeout(blockTimeoutRef.current);
  }, []);

  const handleIncomingHit = useCallback((isLocal) => {
    if (phase !== PHASES.FIGHTING) return false;

    if (isLocal) {
      if (isBlocking) return false; // Blocked!
      setPlayerHP(prev => Math.max(0, prev - 10));
      return true;
    } else {
      // For opponent, we assume they didn't block for now 
      // (in real multiplayer, the opponent would send a 'blocked' event)
      setOpponentHP(prev => Math.max(0, prev - 10));
      return true;
    }
  }, [isBlocking, phase]);

  useEffect(() => {
    if (playerHP === 0) {
      setWinner('opponent');
      setPhase(PHASES.RESULT);
    } else if (opponentHP === 0) {
      setWinner('player');
      setPhase(PHASES.RESULT);
    }
  }, [playerHP, opponentHP]);

  const startCountdown = useCallback(() => {
    setPhase(PHASES.COUNTDOWN);
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setPhase(PHASES.FIGHTING);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const resetMatch = useCallback(() => {
    setPlayerHP(initialHP);
    setOpponentHP(initialHP);
    setPhase(PHASES.INTRO);
    setWinner(null);
  }, [initialHP]);

  return {
    playerHP,
    opponentHP,
    phase,
    countdown,
    winner,
    isBlocking,
    startBlock,
    stopBlock,
    handleIncomingHit,
    startCountdown,
    resetMatch,
    setPhase,
    setWinner
  };
};
