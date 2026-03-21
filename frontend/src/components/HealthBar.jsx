import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';

const HealthBar = ({ hp, maxHp = 100, name, isOpponent = false, className = '' }) => {
  const [isFlash, setIsFlash] = useState(false);
  const prevRef = useRef(hp);

  useEffect(() => {
    if (hp < prevRef.current) {
      setIsFlash(true);
      const timer = setTimeout(() => setIsFlash(false), 300);
      prevRef.current = hp;
      return () => clearTimeout(timer);
    }
    prevRef.current = hp;
  }, [hp]);

  const pct = maxHp > 0 ? Math.round((hp / maxHp) * 100) : 0;

  return (
    <div className={`flex flex-col ${isOpponent ? 'items-end' : 'items-start'} gap-2 ${className}`}>
      <div className="flex items-center gap-4">
        {!isOpponent && (
          <span className="text-2xl font-black italic text-white uppercase tracking-tighter drop-shadow-lg">
            {name}
          </span>
        )}
        <div className="relative w-72 max-w-[min(280px,42vw)] h-8 bg-black/40 border border-white/10 rounded-full overflow-hidden backdrop-blur-md">
          <motion.div
            initial={{ width: '100%' }}
            animate={{ width: `${pct}%` }}
            className={`h-full ${hp <= 0 ? 'bg-zinc-600' : isFlash ? 'bg-red-500' : 'bg-green-500'} transition-colors duration-200`}
            style={{ 
              boxShadow: hp > 0 && !isFlash ? '0 0 20px rgba(34, 197, 94, 0.5)' : hp > 0 ? '0 0 20px rgba(239, 68, 68, 0.8)' : 'none' 
            }}
          />
          {isFlash && (
            <motion.div 
              initial={{ opacity: 0.8 }}
              animate={{ opacity: 0 }}
              className="absolute inset-0 bg-white"
            />
          )}
        </div>
        {isOpponent && (
          <span className="text-2xl font-black italic text-white uppercase tracking-tighter drop-shadow-lg">
            {name}
          </span>
        )}
      </div>
      <div className={`text-[10px] font-black uppercase tracking-[0.3em] ${hp <= 20 ? 'text-red-500 animate-pulse' : 'text-white/40'}`}>
        HP: {Math.max(0, Math.round(hp))} / {maxHp}
      </div>
    </div>
  );
};

export default HealthBar;
