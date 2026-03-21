import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Trophy, Medal } from 'lucide-react';
import { motion } from 'framer-motion';

const API_BASE_URL = `http://${window.location.hostname}:8000`;

const Leaderboard = () => {
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/leaderboard`);
        const data = await response.json();
        setLeaders(data.leaders || []);
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

  return (
    <div className="flex flex-col items-center justify-start h-full relative bg-[#0a0a0a] overflow-hidden p-8 pt-24 font-mono">
      {/* Dynamic Background Elements - Matching MainMenu */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.25, 0.15] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-red-600/20 blur-[150px] rounded-full" 
        />
        <motion.div 
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-600/15 blur-[150px] rounded-full" 
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-red-950/5 to-black/80" />
      </div>

      <div className="absolute inset-0 pointer-events-none z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.02),rgba(0,255,0,0.01),rgba(0,0,255,0.02))] bg-[length:100%_4px,3px_100%] opacity-20" />

      {/* Background Text Decor */}
      <div className="absolute inset-0 flex flex-col items-center justify-center opacity-[0.03] select-none pointer-events-none">
        <h1 className="text-[18vw] font-black italic tracking-tighter uppercase leading-[0.8] font-title text-center">
          SHADOW<br />BOXING
        </h1>
      </div>

      <Link 
        to="/menu" 
        className="fixed top-12 left-24 flex items-center gap-2 text-white/40 hover:text-white transition-all bg-white/5 px-4 py-2 rounded-lg border border-white/5 backdrop-blur-md z-[60] group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        <span className="font-black tracking-[0.3em] text-[10px] uppercase">Back to Menu</span>
      </Link>
      
      <div className="z-10 w-full max-w-2xl flex flex-col items-center">
        <div className="mb-16 flex flex-col items-center text-center">
          <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} className="w-24 h-1 bg-red-600 mb-8" />
          <h1 className="text-[8vw] font-black italic tracking-tighter text-white uppercase leading-none text-center drop-shadow-[0_0_20px_rgba(255,255,255,0.3)] whitespace-nowrap mb-6">
            LEADER<span className="text-red-600">BOARD</span>
          </h1>
          <div className="text-white/20 font-black text-[10px] tracking-[0.8em] uppercase">
            Multiplayer wins (MVP)
          </div>
        </div>

        <div className="w-full bg-black/40 backdrop-blur-2xl rounded-[40px] border border-white/10 overflow-hidden shadow-2xl relative">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          
          {loading ? (
            <div className="p-20 text-center text-white/40 animate-pulse font-black tracking-widest uppercase text-xs">
              Syncing Global Tactical Data...
            </div>
          ) : leaders.length > 0 ? (
            <div className="divide-y divide-white/5">
              {leaders.map((leader, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between p-8 hover:bg-white/[0.02] transition-colors group relative overflow-hidden"
                >
                  <div className="flex items-center gap-8 relative z-10">
                    <div className={`w-12 h-12 flex items-center justify-center rounded-2xl font-black italic text-2xl ${
                      index === 0 ? 'bg-yellow-500 text-black shadow-[0_0_20px_rgba(234,179,8,0.4)]' :
                      index === 1 ? 'bg-zinc-300 text-black shadow-[0_0_20px_rgba(212,212,216,0.4)]' :
                      index === 2 ? 'bg-orange-600 text-black shadow-[0_0_20px_rgba(234,88,12,0.4)]' :
                      'bg-white/5 text-white/40 border border-white/5'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-2xl font-black italic tracking-tight uppercase group-hover:text-red-500 transition-colors">
                        {leader.display_name}
                      </span>
                      <div className="flex gap-4 mt-1">
                        <span className="text-[10px] text-white/20 font-mono tracking-widest uppercase">
                          UID: {leader.user_id?.slice(-8).toUpperCase() || 'ANONYMOUS'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-12 relative z-10">
                    <div className="flex flex-col items-end min-w-[80px]">
                      <span className="text-4xl font-black italic tracking-tighter text-white group-hover:text-red-600 transition-colors group-hover:scale-110 transition-transform">
                        {leader.multiplayer_wins || 0}
                      </span>
                      <span className="text-[9px] text-white/20 font-mono tracking-widest uppercase">Combat Wins</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-20 text-center text-white/20 font-black tracking-widest uppercase text-xs">
              No Combat Records Found in Database
            </div>
          )}
        </div>

        <div className="mt-16 text-white/5 font-black text-[10px] tracking-[1em] uppercase">
          Live Combat Database • Link Status: Active
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;
