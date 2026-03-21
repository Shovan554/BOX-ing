import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

/**
 * MVP end-of-match overlay: winner / defeated + navigation.
 * @param {'idle'|'loading'|'saved'|'error'|null} winStatus — only when result is win
 */
const MatchEndOverlay = ({ result, playerName, opponentName, winStatus = null, winErrorMsg = '' }) => {
  const won = result === 'win';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md px-6"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="max-w-lg w-full text-center border border-white/15 rounded-3xl bg-zinc-950/90 p-10 shadow-[0_0_80px_rgba(220,38,38,0.15)]"
      >
        <p className="text-[10px] tracking-[0.5em] text-white/40 font-black uppercase mb-4">
          {won ? 'Match complete' : 'Knockout'}
        </p>
        <h2
          className={`text-4xl md:text-5xl font-black italic uppercase tracking-tighter mb-2 ${
            won ? 'text-emerald-400 drop-shadow-[0_0_30px_rgba(52,211,153,0.4)]' : 'text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.4)]'
          }`}
        >
          {won ? 'You win' : 'Defeated'}
        </h2>
        <p className="text-white/50 text-sm mb-8">
          {won ? (
            <>
              <span className="text-white font-bold">{opponentName}</span> has no HP left.
            </>
          ) : (
            <>
              <span className="text-white font-bold">{playerName}</span>, your health hit zero.
            </>
          )}
        </p>

        {won && winStatus && winStatus !== 'idle' && (
          <p className="text-[11px] text-white/35 mb-6 font-mono min-h-[1.25rem]">
            {winStatus === 'loading' && 'Saving win…'}
            {winStatus === 'saved' && 'Win saved to leaderboard.'}
            {winStatus === 'error' && (winErrorMsg || 'Could not save win.')}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/multiplayer"
            className="px-8 py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black italic tracking-wide text-center uppercase text-sm transition-colors"
          >
            Find next match
          </Link>
          <Link
            to="/menu"
            className="px-8 py-4 rounded-xl border border-white/20 hover:bg-white/10 text-white/90 font-black tracking-[0.2em] text-[10px] uppercase text-center transition-colors"
          >
            Main menu
          </Link>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default MatchEndOverlay;
