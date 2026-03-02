import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Trophy, Medal } from 'lucide-react';

const Leaderboard = () => {
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch('http://127.0.0.1:8000/leaderboard');
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
    <div className="flex flex-col items-center justify-start h-full relative p-8 pt-24 overflow-y-auto">
      <Link to="/menu" className="absolute top-8 left-8 flex items-center gap-2 text-white/60 hover:text-white transition-colors z-50">
        <ArrowLeft size={24} />
        <span className="font-black tracking-widest uppercase text-xs">Back to Menu</span>
      </Link>
      
      <div className="mb-12 flex flex-col items-center text-center">
        <Trophy className="text-yellow-500 mb-4 animate-bounce" size={48} />
        <h1 className="text-6xl font-black italic tracking-tighter text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.3)] font-title uppercase">
          LEADERBOARD
        </h1>
        <div className="h-1 w-24 bg-red-600 mt-4" />
      </div>

      <div className="w-full max-w-2xl bg-black/40 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
        {loading ? (
          <div className="p-12 text-center text-white/40 animate-pulse font-black tracking-widest uppercase">
            Syncing Global Ranks...
          </div>
        ) : leaders.length > 0 ? (
          <div className="divide-y divide-white/5">
            {leaders.map((leader, index) => (
              <div 
                key={index} 
                className="flex items-center justify-between p-6 hover:bg-white/[0.02] transition-colors group"
              >
                <div className="flex items-center gap-6">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-xl font-black italic text-xl ${
                    index === 0 ? 'bg-yellow-500 text-black shadow-[0_0_15px_#eab308]' :
                    index === 1 ? 'bg-zinc-300 text-black shadow-[0_0_15px_#d4d4d8]' :
                    index === 2 ? 'bg-orange-600 text-black shadow-[0_0_15px_#ea580c]' :
                    'bg-white/5 text-white/40'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-white font-black italic tracking-tight uppercase group-hover:text-red-500 transition-colors">
                      {leader.display_name}
                    </span>
                    <span className="text-[10px] text-white/20 font-mono tracking-widest uppercase">
                      MODE: {leader.mode}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-2xl font-black italic tracking-tighter text-white group-hover:scale-110 transition-transform">
                    {leader.points.toLocaleString()}
                  </span>
                  <span className="text-[8px] text-white/10 font-mono">PTS</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center text-white/20 font-black tracking-widest uppercase">
            No Records Found
          </div>
        )}
      </div>

      {/* Decorative footer */}
      <div className="mt-12 text-white/5 font-mono text-[10px] tracking-[0.5em] uppercase">
        Live Combat Database v1.0
      </div>
    </div>
  );
};

export default Leaderboard;
