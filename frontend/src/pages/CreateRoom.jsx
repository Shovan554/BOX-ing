import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Users, Copy, Check, Loader2, Play, Shield, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { API_BASE_URL } from '../config/api';

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

const CreateRoom = () => {
  const [view, setView] = useState('choice'); // choice, create, join
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState('idle'); // idle, waiting, ready
  const [error, setError] = useState('');
  const [participants, setParticipants] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const navigate = useNavigate();
  const { playSound } = useSoundEffects();

  const handleCreateRoom = async () => {
    playSound('SELECT');
    setError('');
    const token = localStorage.getItem('access_token');
    try {
      const response = await fetch(`${API_BASE_URL}/session/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ mode: 'multiplayer' })
      });
      const data = await response.json();
      setSessionId(data.id);
      setRoomCode(data.room_code);
      setView('create');
      setStatus('waiting');
      playSound('START');
    } catch (err) {
      setError('Failed to create room. Please try again.');
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    
    playSound('SELECT');
    setError('');
    const token = localStorage.getItem('access_token');
    try {
      // 1. Check if room exists and is not full
      const checkRes = await fetch(`${API_BASE_URL}/room/${joinCode.trim()}/status`);
      const checkData = await checkRes.json();
      
      if (checkData.status === 'not_found') {
        setError('Room not found. Check the code.');
        return;
      }
      
      if (checkData.users?.length >= 2) {
        setError('Room is full.');
        return;
      }

      // 2. Join the session
      const response = await fetch(`${API_BASE_URL}/session/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          mode: 'multiplayer',
          room_code: joinCode.trim()
        })
      });
      const data = await response.json();
      setSessionId(data.id);
      setRoomCode(data.room_code);
      setView('create'); // Reuse create view for waiting
      setStatus('waiting'); // Start polling for full room state
      playSound('START');
    } catch (err) {
      setError('Failed to join room.');
    }
  };

  const copyToClipboard = () => {
    playSound('SELECT');
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    let interval;
    const fetchStatus = async () => {
      if (!roomCode) return;
      try {
        const res = await fetch(`${API_BASE_URL}/room/${roomCode}/status`);
        const data = await res.json();
        setParticipants(data.users || []);
        if (data.status === 'ready') {
          setStatus('ready');
          if (interval) clearInterval(interval);
        }
      } catch (e) {
        console.error('Status poll error:', e);
      }
    };

    if (status === 'waiting' && roomCode) {
      fetchStatus(); // Fetch immediately
      interval = setInterval(fetchStatus, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status, roomCode]);

  useEffect(() => {
    if (status === 'ready' && participants.length >= 2) {
      playSound('START');
      const timer = setTimeout(() => {
        // Find opponent name
        const me = participants.find(u => u.session_id === sessionId);
        const opponent = participants.find(u => u.session_id !== sessionId);
        
        navigate('/pov-test', { 
          state: { 
            roomCode: roomCode,
            playerName: me?.player_name || 'You',
            opponentName: opponent?.player_name || 'Opponent',
            sessionId: sessionId
          } 
        });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [status, participants, navigate, roomCode, sessionId, playSound]);

  return (
    <div className="flex flex-col items-center justify-center h-full relative bg-[#0a0a0a] overflow-hidden p-6 font-mono">
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

      <Link 
        to="/menu" 
        onClick={() => playSound('SELECT')}
        className="fixed top-12 left-24 flex items-center gap-2 text-white/40 hover:text-white transition-all bg-white/5 px-4 py-2 rounded-lg border border-white/5 backdrop-blur-md z-[60] group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        <span className="font-black tracking-[0.3em] text-[10px] uppercase">Abort Mission</span>
      </Link>

      <div className="z-10 w-full max-w-xl flex flex-col items-center">
        <AnimatePresence mode="wait">
          {view === 'choice' && (
            <motion.div 
              key="choice"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full flex flex-col items-center"
            >
              <div className="flex flex-col items-center mb-16">
                <motion.div 
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  className="w-24 h-1 bg-red-600 mb-8"
                />
                <h1 className="text-[8vw] font-black italic tracking-tighter text-white uppercase leading-none text-center drop-shadow-[0_0_20px_rgba(255,255,255,0.3)] whitespace-nowrap">
                  PRIVATE <span className="text-red-600">ARENA</span>
                </h1>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                <button 
                  onClick={handleCreateRoom}
                  className="group relative flex flex-col items-center gap-6 p-8 bg-white/5 border border-white/10 rounded-3xl hover:bg-white hover:text-black transition-all duration-500 transform hover:scale-105 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-red-600 opacity-0 group-hover:opacity-10 transition-opacity" />
                  <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center group-hover:bg-black/5 ring-1 ring-white/10 group-hover:ring-black/10">
                    <Plus size={32} />
                  </div>
                  <div className="text-center relative z-10">
                    <h3 className="text-2xl font-black italic tracking-tighter uppercase">Host Game</h3>
                    <p className="text-white/40 group-hover:text-black/40 text-[10px] uppercase font-mono tracking-widest mt-2">Generate tactical code</p>
                  </div>
                </button>

                <button 
                  onClick={() => { playSound('SELECT'); setView('join'); }}
                  className="group relative flex flex-col items-center gap-6 p-8 bg-white/5 border border-white/10 rounded-3xl hover:bg-white hover:text-black transition-all duration-500 transform hover:scale-105 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-cyan-600 opacity-0 group-hover:opacity-10 transition-opacity" />
                  <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center group-hover:bg-black/5 ring-1 ring-white/10 group-hover:ring-black/10">
                    <Users size={32} />
                  </div>
                  <div className="text-center relative z-10">
                    <h3 className="text-2xl font-black italic tracking-tighter uppercase">Join Arena</h3>
                    <p className="text-white/40 group-hover:text-black/40 text-[10px] uppercase font-mono tracking-widest mt-2">Sync with Host</p>
                  </div>
                </button>
              </div>
            </motion.div>
          )}

          {view === 'join' && (
            <motion.div 
              key="join"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-sm flex flex-col items-center"
            >
              <h2 className="text-4xl font-black italic tracking-tighter text-white mb-8">ENTER TACTICAL CODE</h2>
              
              <form onSubmit={handleJoinRoom} className="w-full space-y-8">
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40">Encryption Key</label>
                    <div className="flex gap-1">
                      {[1,2,3].map(i => <div key={i} className="w-1 h-1 bg-red-600 animate-pulse" style={{ animationDelay: `${i*0.2}s` }} />)}
                    </div>
                  </div>
                  <div className="relative group">
                    <input 
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000 000"
                      className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-6 text-white font-black italic tracking-[0.3em] text-4xl focus:outline-none focus:border-red-600 transition-all text-center placeholder:text-white/10"
                      autoFocus
                    />
                    <div className="absolute -inset-1 bg-red-600/20 blur opacity-0 group-focus-within:opacity-100 transition-opacity rounded-3xl -z-10" />
                  </div>
                </div>
                
                {error && <p className="text-red-500 text-xs font-bold text-center italic animate-bounce">! {error} !</p>}
                
                <div className="flex gap-4">
                  <button 
                    type="button"
                    onClick={() => { playSound('SELECT'); setView('choice'); }}
                    className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl font-bold uppercase tracking-widest text-[11px] hover:bg-white/10 transition-all"
                  >
                    Back
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-4 bg-red-600 text-white rounded-2xl font-black italic tracking-tighter text-xl hover:bg-white hover:text-black transition-all transform hover:scale-105 flex items-center justify-center gap-3 group"
                  >
                    <Zap size={20} className="fill-current group-hover:animate-bounce" />
                    INITIALIZE
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {view === 'create' && (
            <motion.div 
              key="waiting"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md flex flex-col items-center text-center"
            >
              <div className="mb-12 relative">
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
                  <Shield size={24} className="text-red-600 animate-pulse" />
                  <div className="w-[1px] h-6 bg-gradient-to-b from-red-600 to-transparent" />
                </div>
                <h2 className="text-[10px] font-black italic tracking-[0.5em] text-white/30 uppercase mb-4">Tactical Frequency</h2>
                <div className="flex items-center gap-6 bg-white/5 border-2 border-white/10 rounded-3xl px-10 py-8 relative group shadow-[0_0_50px_rgba(255,255,255,0.02)]">
                  <div className="absolute inset-0 bg-red-600/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl" />
                  <span className="text-5xl font-black italic tracking-[0.3em] text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">{roomCode}</span>
                  <button 
                    onClick={copyToClipboard}
                    className="p-4 bg-white/5 hover:bg-white hover:text-black rounded-2xl transition-all relative z-10"
                    title="Copy Code"
                  >
                    {copied ? <Check size={24} className="text-green-500" /> : <Copy size={24} />}
                  </button>
                </div>
                <p className="mt-6 text-[9px] font-mono uppercase tracking-[0.4em] text-white/20">Send this key to your designated rival</p>
              </div>

              <div className="w-full bg-white/5 border border-white/5 rounded-[40px] p-8 backdrop-blur-md relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <h3 className="text-[10px] font-black italic tracking-[0.4em] text-white/40 mb-8 uppercase flex items-center justify-center gap-3">
                  <span className="w-8 h-[1px] bg-white/10" />
                  Combatants In Queue
                  <span className="w-8 h-[1px] bg-white/10" />
                </h3>
                
                <div className="space-y-4">
                  {/* Always show YOU */}
                  <div className="flex items-center justify-between p-5 bg-white/5 rounded-2xl border border-white/5 relative group overflow-hidden">
                    <div className="absolute inset-y-0 left-0 w-1 bg-cyan-500" />
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
                        <Users size={20} className="text-cyan-500" />
                      </div>
                      <div className="text-left">
                        <span className="block font-black tracking-tight italic text-lg leading-none uppercase">
                          {participants.find(p => p.session_id === sessionId)?.player_name || 'Host Ninja'}
                        </span>
                        <span className="text-[9px] text-cyan-500 uppercase tracking-widest font-bold">Authenticated</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[9px] font-mono text-cyan-500 uppercase tracking-[0.2em]">Rank 01</span>
                      <div className="flex gap-0.5 mt-1">
                        {[1,2,3,4].map(i => <div key={i} className="w-1 h-1 bg-cyan-500" />)}
                      </div>
                    </div>
                  </div>

                  {/* Show Opponent if waiting or found */}
                  {participants.length < 2 && status === 'waiting' ? (
                    <div className="flex items-center justify-between p-5 bg-white/[0.02] rounded-2xl border border-dashed border-white/10 relative overflow-hidden group">
                      <div className="absolute inset-0 bg-white/5 animate-pulse" />
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center relative">
                          <Loader2 size={20} className="text-white/20 animate-spin" />
                        </div>
                        <div className="text-left">
                          <span className="block font-black tracking-tighter italic text-lg leading-none text-white/20 uppercase">Searching...</span>
                          <span className="text-[9px] text-white/10 uppercase tracking-widest">Awaiting Link</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    participants.filter(p => p.session_id !== sessionId).map((opponent) => (
                      <motion.div 
                        key={opponent.session_id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between p-5 bg-red-600/10 rounded-2xl border border-red-600/20 relative group overflow-hidden"
                      >
                        <div className="absolute inset-y-0 left-0 w-1 bg-red-600" />
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-red-600/20 flex items-center justify-center border border-red-600/30">
                            <Users size={20} className="text-red-600" />
                          </div>
                          <div className="text-left">
                            <span className="block font-black tracking-tight italic text-lg leading-none uppercase">
                              {opponent.player_name}
                            </span>
                            <span className="text-[9px] text-red-600 uppercase tracking-widest font-bold">Connected</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-[9px] font-mono text-red-600 uppercase tracking-[0.2em]">Ready</span>
                          <div className="flex gap-0.5 mt-1">
                            {[1,2,3,4].map(i => <div key={i} className="w-1 h-1 bg-red-600" />)}
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>

              {status === 'ready' && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-12 w-full flex flex-col items-center gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-ping" />
                    <p className="text-green-500 font-black italic tracking-widest text-lg uppercase animate-pulse">Arena synchronized</p>
                  </div>
                  <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden relative">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 3, ease: "easeInOut" }}
                      className="h-full bg-gradient-to-r from-cyan-500 via-green-500 to-red-600 shadow-[0_0_10px_rgba(34,197,94,0.5)]"
                    />
                  </div>
                  <p className="text-[10px] text-white/30 uppercase tracking-[0.4em] font-bold">Engagement in 3... 2... 1...</p>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CreateRoom;
