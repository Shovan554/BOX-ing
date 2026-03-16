import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, Medal, ArrowLeft, Share2, Home } from 'lucide-react';

const Results = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { winner, scores, playerName, opponentName, sessionId } = location.state || {};

  const isWinner = winner === 'YOU';
  const playerWinCount = scores?.[sessionId] || 0;
  const opponentWinCount = Object.entries(scores || {}).find(([sid]) => sid !== sessionId)?.[1] || 0;

  return (
    <div className="min-h-screen bg-[#050505] text-white font-mono relative overflow-hidden flex flex-col items-center justify-center p-6">
      {/* Background Decor */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(220,38,38,0.1),transparent_70%)]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 w-full max-w-2xl bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-[40px] p-12 shadow-2xl relative overflow-hidden"
      >
        <div className={`absolute top-0 left-0 w-full h-2 ${isWinner ? 'bg-cyan-400' : 'bg-red-600'}`} />
        
        <div className="text-center mb-12">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 12, delay: 0.2 }}
            className="inline-block mb-6"
          >
            {isWinner ? (
              <div className="w-24 h-24 bg-cyan-400/20 rounded-full flex items-center justify-center border-2 border-cyan-400/50 shadow-[0_0_30px_rgba(34,211,238,0.3)]">
                <Trophy size={48} className="text-cyan-400" />
              </div>
            ) : (
              <div className="w-24 h-24 bg-red-600/20 rounded-full flex items-center justify-center border-2 border-red-600/50 shadow-[0_0_30px_rgba(220,38,38,0.3)]">
                <Medal size={48} className="text-red-600" />
              </div>
            )}
          </motion.div>
          <h1 className="text-6xl font-black italic tracking-tighter uppercase mb-2">
            {isWinner ? 'VICTORY' : 'DEFEAT'}
          </h1>
          <p className="text-white/40 text-xs tracking-[0.5em] uppercase">Combat Performance Summary</p>
        </div>

        <div className="grid grid-cols-3 gap-8 mb-12 items-center">
          <div className="text-center">
            <span className="block text-[10px] text-white/20 uppercase tracking-widest font-bold mb-2">{playerName}</span>
            <span className="text-5xl font-black italic text-white">{playerWinCount}</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-full h-px bg-white/10 mb-2" />
            <span className="text-white/20 font-black italic text-xl">VS</span>
            <div className="w-full h-px bg-white/10 mt-2" />
          </div>
          <div className="text-center">
            <span className="block text-[10px] text-white/20 uppercase tracking-widest font-bold mb-2">{opponentName}</span>
            <span className="text-5xl font-black italic text-red-600">{opponentWinCount}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white/5 border border-white/5 rounded-2xl p-6 flex justify-between items-center">
            <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Technique Rating</span>
            <span className="text-cyan-400 font-black italic">ELITE</span>
          </div>
          <div className="bg-white/5 border border-white/5 rounded-2xl p-6 flex justify-between items-center">
            <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Match Duration</span>
            <span className="text-white font-black italic">02:45</span>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-4">
          <button 
            onClick={() => navigate('/menu')}
            className="flex items-center justify-center gap-3 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all group"
          >
            <Home size={18} className="text-white/40 group-hover:text-white transition-colors" />
            <span className="font-black italic uppercase tracking-tighter text-sm">Main Menu</span>
          </button>
          <button 
            onClick={() => navigate('/multiplayer')}
            className="flex items-center justify-center gap-3 py-4 bg-red-600 hover:bg-red-700 rounded-2xl shadow-lg shadow-red-600/20 transition-all group"
          >
            <span className="font-black italic uppercase tracking-tighter text-sm text-white">Find Rematch</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default Results;
