import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import HealthBar from './HealthBar';

const GameHUD = ({ 
  playerHP, 
  opponentHP, 
  playerName, 
  opponentName, 
  phase, 
  countdown, 
  winner, 
  onRematch,
  isLocked
}) => {
  const [timer, setTimer] = useState(60);

  useEffect(() => {
    let interval;
    if (phase === 'fighting' && timer > 0) {
      interval = setInterval(() => {
        setTimer(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [phase, timer]);

  return (
    <div className="absolute inset-0 pointer-events-none p-12 z-50 flex flex-col justify-between">
      {/* Top Section: Health Bars */}
      <div className="flex justify-between items-start w-full">
        <HealthBar hp={playerHP} name={playerName} />
        
        {/* Timer Box */}
        <div className="flex flex-col items-center bg-black/60 backdrop-blur-xl px-12 py-4 rounded-3xl border border-white/5 shadow-2xl">
          <span className="text-white/20 text-[10px] font-black uppercase tracking-[0.4em] mb-1">Combat Time</span>
          <span className={`text-6xl font-black italic tracking-tighter tabular-nums ${timer <= 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
            {timer}
          </span>
        </div>

        <HealthBar hp={opponentHP} name={opponentName} isOpponent={true} />
      </div>

      {/* Center Section: Phase Overlays */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
        <AnimatePresence>
          {phase === 'countdown' && (
            <motion.h2 
              key={countdown}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1.5, opacity: 1 }}
              exit={{ scale: 3, opacity: 0 }}
              className="text-9xl font-black italic text-white drop-shadow-[0_0_50px_rgba(255,255,255,0.5)]"
            >
              {countdown > 0 ? countdown : 'FIGHT!'}
            </motion.h2>
          )}

          {phase === 'result' && (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-black/80 backdrop-blur-3xl p-16 rounded-[40px] border-4 border-white/10 flex flex-col items-center gap-10 shadow-[0_0_100px_rgba(0,0,0,0.8)] pointer-events-auto"
            >
              <div className="text-center">
                <p className="text-white/40 font-black uppercase tracking-[0.8em] text-xs mb-4">Duel Concluded</p>
                <h2 className="text-8xl font-black italic text-white tracking-tighter uppercase drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                  {winner === 'player' ? 'VICTORY' : 'DEFEAT'}
                </h2>
              </div>
              
              <div className="flex gap-12 text-center">
                <div>
                  <p className="text-white/20 font-black text-[10px] tracking-widest uppercase mb-2">Final HP</p>
                  <p className="text-4xl font-black italic text-green-500">{playerHP}</p>
                </div>
                <div className="w-[1px] h-12 bg-white/10 self-center" />
                <div>
                  <p className="text-white/20 font-black text-[10px] tracking-widest uppercase mb-2">Opponent HP</p>
                  <p className="text-4xl font-black italic text-red-500">{opponentHP}</p>
                </div>
              </div>

              <button 
                onClick={onRematch}
                className="group relative px-12 py-6 bg-red-600 text-white font-black italic tracking-tighter text-2xl rounded-2xl hover:bg-white hover:text-black transition-all duration-500 transform hover:scale-110 active:scale-95 shadow-[0_0_50px_rgba(220,38,38,0.3)]"
              >
                REMATCH
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Section: Indicators */}
      <div className="flex justify-center w-full">
        {isLocked && phase === 'fighting' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 bg-red-600/20 backdrop-blur-md px-6 py-2 rounded-full border border-red-500/50"
          >
            <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Neural Link Busy...</span>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default GameHUD;
