import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Swords, Target, Zap, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSoundEffects } from '../hooks/useSoundEffects';

const API_BASE_URL = `http://${window.location.hostname}:8000`;

const Scanlines = () => (
  <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-0 overflow-hidden">
    <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
    <motion.div 
      animate={{ y: [0, 1000] }}
      transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
      className="absolute top-[-100%] left-0 right-0 h-full bg-[linear-gradient(transparent,rgba(255,255,255,0.05),transparent)] opacity-20"
    />
  </div>
);

const Multiplayer = () => {
  const [status, setStatus] = useState('idle'); // idle, searching, connected
  const [matchData, setMatchData] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const navigate = useNavigate();
  const { playSound } = useSoundEffects();

  const startMatchmaking = async () => {
    playSound('SELECT');
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
        body: JSON.stringify({ mode: 'multiplayer', is_matchmaking: true })
      });
      const sessionData = await sessionResponse.json();
      const sid = sessionData.id || sessionData.session_id;
      setSessionId(sid);

      // 2. Join matchmaking
      const matchResponse = await fetch(`${API_BASE_URL}/matchmaking/join?session_id=${sid}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await matchResponse.json();

      if (data.status === 'matched') {
        playSound('START');
        setMatchData(data);
        setStatus('connected');
      }
    } catch (error) {
      console.error('Matchmaking error:', error);
      setStatus('idle');
    }
  };

  const abortSearch = async () => {
    if (status === 'searching' && sessionId) {
      try {
        await fetch(`${API_BASE_URL}/matchmaking/leave?session_id=${sessionId}`, {
          method: 'POST'
        });
      } catch (e) {
        console.error("Failed to leave matchmaking queue:", e);
      }
    }
    playSound('SELECT');
    setStatus('idle');
  };

  useEffect(() => {
    // If user leaves the page while searching, try to remove them from queue
    return () => {
      if (status === 'searching' && sessionId) {
        fetch(`${API_BASE_URL}/matchmaking/leave?session_id=${sessionId}`, {
          method: 'POST',
          keepalive: true // Ensure request finishes even if page is closed
        }).catch(console.error);
      }
    };
  }, [status, sessionId]);

  useEffect(() => {
    let interval;
    if (status === 'searching' && sessionId && !matchData) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/matchmaking/status/${sessionId}`);
          const data = await res.json();
          if (data.status === 'matched') {
            playSound('START');
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
  }, [status, sessionId, matchData, playSound]);

  useEffect(() => {
    if (status === 'connected') {
      const timer = setTimeout(() => {
        navigate('/multiplayer-arena', { 
          state: { 
            roomCode: matchData.room_code,
            playerName: matchData.player_name,
            opponentName: matchData.opponent_name,
            sessionId: sessionId
          } 
        });
      }, 5000); // 5 seconds for the VS animation
      return () => clearTimeout(timer);
    }
  }, [status, navigate, matchData]);

  return (
    <div className="flex flex-col items-center justify-center h-full relative bg-[#0a0a0a] overflow-hidden font-mono">
      {/* Dynamic Background Elements - Matching MainMenu */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.15, 0.25, 0.15],
            x: [0, 50, 0],
            y: [0, 30, 0]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-red-600/20 blur-[150px] rounded-full" 
        />
        <motion.div 
          animate={{ 
            scale: [1.2, 1, 1.2],
            opacity: [0.1, 0.2, 0.1],
            x: [0, -40, 0],
            y: [0, -50, 0]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-600/15 blur-[150px] rounded-full" 
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-red-950/5 to-black/80" />
      </div>

      {/* Scanline Effect Overlay - Matching MainMenu */}
      <div className="absolute inset-0 pointer-events-none z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.02),rgba(0,255,0,0.01),rgba(0,0,255,0.02))] bg-[length:100%_4px,3px_100%] opacity-20" />
      
      {/* Background Text Decor - Matching MainMenu */}
      <div className="absolute inset-0 flex flex-col items-center justify-center opacity-[0.03] select-none pointer-events-none">
        <h1 className="text-[18vw] font-black italic tracking-tighter uppercase leading-[0.8] font-title text-center">
          SHADOW<br />BOXING
        </h1>
      </div>

      {/* Decorative corners - Matching MainMenu */}
      <div className="absolute top-12 left-12 w-12 h-12 border-t border-l border-white/10" />
      <div className="absolute top-12 right-12 w-12 h-12 border-t border-r border-white/10" />
      <div className="absolute bottom-12 left-12 w-12 h-12 border-b border-l border-white/10" />
      <div className="absolute bottom-12 right-12 w-12 h-12 border-b border-r border-white/10" />

      <button 
        onClick={async () => {
          await abortSearch();
          navigate('/menu');
        }}
        className="fixed top-12 left-24 flex items-center gap-2 text-white/40 hover:text-white transition-all bg-white/5 px-4 py-2 rounded-lg border border-white/5 backdrop-blur-md z-[60] group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        <span className="font-black tracking-[0.3em] text-[10px] uppercase">Abort Search</span>
      </button>

      <AnimatePresence mode="wait">
        {status !== 'connected' ? (
          <motion.div 
            key="lobby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="z-10 flex flex-col items-center max-w-md w-full px-8"
          >
            <div className="mb-16 text-center">
              <motion.div 
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                className="w-24 h-1 bg-red-600 mx-auto mb-8"
              />
              <h1 className="text-[8vw] font-black italic tracking-tighter text-white uppercase leading-none text-center drop-shadow-[0_0_30px_rgba(255,0,0,0.3)] whitespace-nowrap">
                ARENA <span className="text-red-600">LINK</span>
              </h1>
              <p className="text-white/20 font-black text-[10px] tracking-[0.8em] uppercase mt-6">Searching For Combatants</p>
            </div>

            <div className="w-full aspect-square max-w-[320px] relative flex items-center justify-center">
              {/* Radar effects */}
              <div className={`absolute inset-0 border-2 border-red-600/10 rounded-full transition-all duration-1000 ${status === 'searching' ? 'scale-125 opacity-0 animate-ping' : 'scale-100 opacity-5'}`} />
              <div className={`absolute inset-4 border border-white/5 rounded-full ${status === 'searching' ? 'animate-[spin_10s_linear_infinite]' : ''}`}>
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-600 rounded-full blur-[2px]" />
              </div>
              
              <div className="relative z-20 flex flex-col items-center">
                {status === 'idle' && (
                  <button 
                    onClick={startMatchmaking}
                    className="group relative px-12 py-6 bg-red-600 text-white font-black italic tracking-tighter text-2xl rounded-2xl hover:bg-white hover:text-black transition-all duration-500 transform hover:scale-110 active:scale-95 flex items-center gap-4 overflow-hidden shadow-[0_0_50px_rgba(220,38,38,0.3)] hover:shadow-[0_0_50px_rgba(255,255,255,0.3)]"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 skew-x-12" />
                    <Swords size={28} className="group-hover:rotate-12 transition-transform" />
                    ENTER QUEUE
                  </button>
                )}

                {status === 'searching' && (
                  <div className="flex flex-col items-center gap-8">
                    <div className="relative">
                      <div className="absolute inset-0 bg-red-600/20 blur-2xl rounded-full animate-pulse" />
                      <Loader2 size={80} className="text-red-600 animate-spin opacity-80 relative z-10" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Target size={32} className="text-white animate-pulse" />
                      </div>
                    </div>
                    <div className="text-center space-y-2">
                      <h3 className="text-white font-black italic tracking-[0.3em] text-xl animate-pulse">SCANNING...</h3>
                      <div className="flex gap-1 justify-center">
                        {[1,2,3,4,5].map(i => (
                          <motion.div 
                            key={i}
                            animate={{ opacity: [0.2, 1, 0.2] }}
                            transition={{ duration: 1, repeat: Infinity, delay: i * 0.1 }}
                            className="w-1.5 h-1.5 bg-red-600 rounded-full"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {status === 'idle' && (
              <div className="mt-16 flex flex-col items-center gap-4">
                <div className="flex items-center gap-4 px-6 py-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-md">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Servers Operational</p>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="vs-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="z-10 w-full flex flex-col items-center max-w-6xl"
          >
            <div className="relative w-full flex flex-col md:flex-row items-center justify-center gap-8 md:gap-0">
              
              {/* VS Background Text */}
              <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
                <motion.h2 
                  initial={{ scale: 2, opacity: 0 }}
                  animate={{ scale: 1.2, opacity: 0.05 }}
                  className="text-[40vw] font-black italic text-white select-none"
                >
                  FIGHT
                </motion.h2>
              </div>

              {/* Player side */}
              <motion.div 
                initial={{ x: -400, opacity: 0, skewX: -20 }}
                animate={{ x: 0, opacity: 1, skewX: 0 }}
                transition={{ duration: 0.5, type: 'spring', damping: 15 }}
                className="flex flex-col items-center relative z-10 w-full md:w-1/3"
              >
                <div className="relative group">
                  <div className="absolute -inset-4 bg-cyan-500/20 blur-2xl opacity-50 group-hover:opacity-100 transition-opacity animate-pulse" />
                  <div className="w-56 h-72 bg-white/5 border-2 border-cyan-500/50 rounded-[40px] flex flex-col items-center justify-center relative overflow-hidden backdrop-blur-xl shadow-[0_0_50px_rgba(6,182,212,0.2)]">
                    <div className="absolute top-0 left-0 w-full h-2 bg-cyan-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/10 to-transparent" />
                    <Shield size={64} className="text-cyan-500 mb-6 opacity-40" />
                    <span className="text-8xl font-black italic text-cyan-500/20 absolute -right-4 -bottom-4">{matchData?.player_name?.[0]}</span>
                    <div className="text-center z-10">
                      <p className="text-[10px] text-cyan-500 uppercase tracking-[0.4em] font-black mb-1">Combatant</p>
                      <h3 className="text-4xl font-black italic text-white uppercase tracking-tighter">{matchData?.player_name}</h3>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* VS Divider */}
              <motion.div 
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.3, duration: 0.6, type: 'spring', bounce: 0.6 }}
                className="relative z-20 mx-12"
              >
                <div className="text-[12rem] font-black italic text-red-600 drop-shadow-[0_0_60px_rgba(220,38,38,0.8)] leading-none select-none">
                  VS
                </div>
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                  transition={{ duration: 0.2, repeat: Infinity }}
                  className="absolute inset-0 bg-red-600/40 blur-[80px] -z-10 rounded-full"
                />
              </motion.div>

              {/* Opponent side */}
              <motion.div 
                initial={{ x: 400, opacity: 0, skewX: 20 }}
                animate={{ x: 0, opacity: 1, skewX: 0 }}
                transition={{ duration: 0.5, type: 'spring', damping: 15 }}
                className="flex flex-col items-center relative z-10 w-full md:w-1/3"
              >
                <div className="relative group">
                  <div className="absolute -inset-4 bg-red-600/20 blur-2xl opacity-50 group-hover:opacity-100 transition-opacity animate-pulse" />
                  <div className="w-56 h-72 bg-white/5 border-2 border-red-500/50 rounded-[40px] flex flex-col items-center justify-center relative overflow-hidden backdrop-blur-xl shadow-[0_0_50px_rgba(239,68,68,0.2)]">
                    <div className="absolute top-0 left-0 w-full h-2 bg-red-600" />
                    <div className="absolute inset-0 bg-gradient-to-t from-red-500/10 to-transparent" />
                    <Zap size={64} className="text-red-600 mb-6 opacity-40" />
                    <span className="text-8xl font-black italic text-red-600/20 absolute -right-4 -bottom-4">{matchData?.opponent_name?.[0]}</span>
                    <div className="text-center z-10">
                      <p className="text-[10px] text-red-600 uppercase tracking-[0.4em] font-black mb-1">Adversary</p>
                      <h3 className="text-4xl font-black italic text-white uppercase tracking-tighter">{matchData?.opponent_name}</h3>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 }}
              className="mt-16 flex flex-col items-center"
            >
              <div className="px-12 py-5 bg-white/5 border border-white/10 rounded-full backdrop-blur-2xl relative group overflow-hidden">
                <div className="absolute inset-0 bg-green-500/5 animate-pulse" />
                <div className="text-white/60 font-black text-[11px] uppercase tracking-[0.6em] flex items-center gap-6 relative z-10">
                  <span className="flex gap-1">
                    {[1,2,3].map(i => <div key={i} className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]" style={{ animationDelay: `${i*0.2}s` }} />)}
                  </span>
                  Link Stable • Initializing Arena {matchData?.room_code}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Multiplayer;
