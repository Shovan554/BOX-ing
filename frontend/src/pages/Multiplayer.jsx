import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Swords } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE_URL = `http://${window.location.hostname}:8000`;

const Multiplayer = () => {
  const [status, setStatus] = useState('idle'); // idle, searching, connected
  const [matchData, setMatchData] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const navigate = useNavigate();

  const startMatchmaking = async () => {
    setStatus('searching');
    const token = localStorage.getItem('access_token');
    try {
      // 1. Start a session
      const sessionResponse = await fetch(`${API_BASE_URL}/session/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ mode: 'multiplayer' })
      });
      const sessionData = await sessionResponse.json();
      setSessionId(sessionData.id);

      // 2. Join matchmaking
      const matchResponse = await fetch(`${API_BASE_URL}/matchmaking/join?session_id=${sessionData.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await matchResponse.json();

      if (data.status === 'matched') {
        setMatchData(data);
        setStatus('connected');
      }
    } catch (error) {
      console.error('Matchmaking error:', error);
      setStatus('idle');
    }
  };

  useEffect(() => {
    let interval;
    if (status === 'searching' && sessionId && !matchData) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/matchmaking/status/${sessionId}`);
          const data = await res.json();
          if (data.status === 'matched') {
            setMatchData(data);
            setStatus('connected');
            clearInterval(interval);
          }
        } catch (e) {
          console.error('Polling error:', e);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [status, sessionId, matchData]);

  useEffect(() => {
    if (status === 'connected') {
      const timer = setTimeout(() => {
        navigate('/pov-test', { 
          state: { 
            roomCode: matchData.room_code,
            playerName: matchData.player_name,
            opponentName: matchData.opponent_name
          } 
        });
      }, 5000); // 5 seconds for the VS animation
      return () => clearTimeout(timer);
    }
  }, [status, navigate, matchData]);

  return (
    <div className="flex flex-col items-center justify-center h-full relative bg-[#050505] overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,0,0,0.05)_0%,transparent_70%)] pointer-events-none" />
      
      <Link to="/menu" className="absolute top-8 left-8 flex items-center gap-2 text-white/40 hover:text-white transition-all bg-white/5 px-4 py-2 rounded-lg border border-white/5 backdrop-blur-md z-10">
        <ArrowLeft size={20} />
        <span className="font-bold tracking-widest text-[10px] uppercase">Back to Menu</span>
      </Link>

      <AnimatePresence mode="wait">
        {status !== 'connected' ? (
          <motion.div 
            key="lobby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="z-10 flex flex-col items-center max-w-md w-full px-8"
          >
            <div className="mb-12 text-center">
              <h1 className="text-7xl font-black italic tracking-tighter text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                MULTIPLAYER
              </h1>
              <p className="text-white/30 font-mono text-[10px] tracking-[0.5em] uppercase mt-2">Elite Combat Arena</p>
            </div>

            <div className="w-full aspect-square max-w-[300px] relative flex items-center justify-center">
              <div className={`absolute inset-0 border-2 border-white/5 rounded-full transition-all duration-1000 ${status === 'searching' ? 'scale-110 opacity-20 animate-pulse' : 'scale-100 opacity-10'}`} />
              
              <div className="relative z-20 flex flex-col items-center">
                {status === 'idle' && (
                  <button 
                    onClick={startMatchmaking}
                    className="group relative px-10 py-5 bg-white text-black font-black italic tracking-tighter text-xl rounded-2xl hover:bg-red-600 hover:text-white transition-all duration-300 transform hover:scale-110 active:scale-95 flex items-center gap-3 overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 skew-x-12" />
                    <Swords size={24} />
                    FIND MATCH
                  </button>
                )}

                {status === 'searching' && (
                  <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                      <Loader2 size={64} className="text-white animate-spin opacity-40" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-2 h-2 bg-red-600 rounded-full animate-ping" />
                      </div>
                    </div>
                    <div className="text-center">
                      <h3 className="text-white font-black italic tracking-widest text-lg animate-pulse">FINDING MATCH...</h3>
                      <p className="text-white/20 font-mono text-[9px] uppercase mt-2 tracking-widest">Searching for active ninjas</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {status === 'idle' && (
              <div className="mt-12 flex flex-col items-center gap-2 opacity-30">
                <p className="text-[9px] font-mono text-white uppercase tracking-[0.3em]">Online Players: --</p>
                <div className="w-24 h-[1px] bg-white/20" />
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="vs-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="z-10 w-full flex flex-col items-center"
          >
            <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-24 w-full px-4">
              {/* Player side */}
              <motion.div 
                initial={{ x: -200, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.6, type: 'spring', bounce: 0.4 }}
                className="flex flex-col items-center"
              >
                <div className="w-48 h-48 bg-cyan-500/10 rounded-2xl border-2 border-cyan-500/50 flex items-center justify-center relative overflow-hidden group shadow-[0_0_50px_rgba(6,182,212,0.2)]">
                  <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/20 to-transparent" />
                  <span className="text-8xl font-black italic text-cyan-500 opacity-20">{matchData?.player_name?.[0]}</span>
                </div>
                <h3 className="mt-6 text-4xl font-black italic text-white uppercase tracking-tighter">{matchData?.player_name}</h3>
              </motion.div>

              {/* VS Divider */}
              <motion.div 
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.4, duration: 0.5, type: 'spring' }}
                className="relative"
              >
                <div className="text-9xl font-black italic text-red-600 drop-shadow-[0_0_40px_rgba(220,38,38,0.7)] text-outline">VS</div>
                <motion.div 
                  animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.7, 0.3] }}
                  transition={{ duration: 0.3, repeat: Infinity }}
                  className="absolute inset-0 bg-red-600/30 blur-3xl -z-10 rounded-full"
                />
              </motion.div>

              {/* Opponent side */}
              <motion.div 
                initial={{ x: 200, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.6, type: 'spring', bounce: 0.4 }}
                className="flex flex-col items-center"
              >
                <div className="w-48 h-48 bg-red-500/10 rounded-2xl border-2 border-red-500/50 flex items-center justify-center relative overflow-hidden group shadow-[0_0_50px_rgba(239,68,68,0.2)]">
                  <div className="absolute inset-0 bg-gradient-to-t from-red-500/20 to-transparent" />
                  <span className="text-8xl font-black italic text-red-500 opacity-20">{matchData?.opponent_name?.[0]}</span>
                </div>
                <h3 className="mt-6 text-4xl font-black italic text-white uppercase tracking-tighter">{matchData?.opponent_name}</h3>
              </motion.div>
            </div>

            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5 }}
              className="mt-20 flex flex-col items-center"
            >
              <div className="px-10 py-4 bg-white/5 border border-white/10 rounded-full backdrop-blur-xl">
                <p className="text-white/60 font-mono text-[11px] uppercase tracking-[0.6em] flex items-center gap-4">
                  <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
                  Match Verified • Entering Arena {matchData?.room_code}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Multiplayer;
