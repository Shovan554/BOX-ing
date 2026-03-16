import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Users, Copy, Check, Loader2, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE_URL = `http://${window.location.hostname}:8000`;

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

  const handleCreateRoom = async () => {
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
    } catch (err) {
      setError('Failed to create room. Please try again.');
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    
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
    } catch (err) {
      setError('Failed to join room.');
    }
  };

  const copyToClipboard = () => {
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
      const timer = setTimeout(() => {
        // Find opponent name
        const me = participants.find(u => u.session_id === sessionId);
        const opponent = participants.find(u => u.session_id !== sessionId);
        
        navigate('/pov-test', { 
          state: { 
            roomCode: roomCode,
            playerName: me?.player_name || 'You',
            opponentName: opponent?.player_name || 'Opponent'
          } 
        });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [status, participants, navigate, roomCode, sessionId]);

  return (
    <div className="flex flex-col items-center justify-center h-full relative bg-[#050505] overflow-hidden p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0%,transparent_70%)] pointer-events-none" />
      
      <Link to="/menu" className="absolute top-8 left-8 flex items-center gap-2 text-white/40 hover:text-white transition-all bg-white/5 px-4 py-2 rounded-lg border border-white/5 backdrop-blur-md z-10">
        <ArrowLeft size={20} />
        <span className="font-bold tracking-widest text-[10px] uppercase">Back to Menu</span>
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
              <h1 className="text-6xl font-black italic tracking-tighter text-white mb-12 drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                PRIVATE ARENA
              </h1>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                <button 
                  onClick={handleCreateRoom}
                  className="group flex flex-col items-center gap-6 p-8 bg-white/5 border border-white/10 rounded-3xl hover:bg-white hover:text-black transition-all duration-500 transform hover:scale-105"
                >
                  <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center group-hover:bg-black/5">
                    <Plus size={32} />
                  </div>
                  <div className="text-center">
                    <h3 className="text-2xl font-black italic tracking-tighter uppercase">Create Room</h3>
                    <p className="text-white/40 group-hover:text-black/40 text-[10px] uppercase font-mono tracking-widest mt-2">Get a code & invite a friend</p>
                  </div>
                </button>

                <button 
                  onClick={() => setView('join')}
                  className="group flex flex-col items-center gap-6 p-8 bg-white/5 border border-white/10 rounded-3xl hover:bg-white hover:text-black transition-all duration-500 transform hover:scale-105"
                >
                  <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center group-hover:bg-black/5">
                    <Users size={32} />
                  </div>
                  <div className="text-center">
                    <h3 className="text-2xl font-black italic tracking-tighter uppercase">Join Room</h3>
                    <p className="text-white/40 group-hover:text-black/40 text-[10px] uppercase font-mono tracking-widest mt-2">Enter a shared room code</p>
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
              <h2 className="text-4xl font-black italic tracking-tighter text-white mb-8">JOIN ARENA</h2>
              
              <form onSubmit={handleJoinRoom} className="w-full space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40 ml-2">Room Code</label>
                  <input 
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="E.G. 123456"
                    className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 text-white font-black italic tracking-widest text-3xl focus:outline-none focus:border-white transition-all text-center"
                    autoFocus
                  />
                </div>
                
                {error && <p className="text-red-500 text-xs font-bold text-center italic">{error}</p>}
                
                <div className="flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setView('choice')}
                    className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl font-bold uppercase tracking-widest text-[11px] hover:bg-white/10 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-4 bg-white text-black rounded-2xl font-black italic tracking-tighter text-lg hover:bg-red-600 hover:text-white transition-all transform hover:scale-105 flex items-center justify-center gap-2"
                  >
                    <Play size={20} fill="currentColor" />
                    ENTER ARENA
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
              <div className="mb-8">
                <h2 className="text-2xl font-black italic tracking-tighter text-white/40 uppercase mb-2">Room Ready</h2>
                <div className="flex items-center gap-4 bg-white/5 border-2 border-white/10 rounded-3xl px-8 py-6 group">
                  <span className="text-4xl font-black italic tracking-[0.2em] text-white">{roomCode}</span>
                  <button 
                    onClick={copyToClipboard}
                    className="p-3 hover:bg-white/10 rounded-xl transition-all"
                    title="Copy Code"
                  >
                    {copied ? <Check size={24} className="text-green-500" /> : <Copy size={24} className="text-white/40" />}
                  </button>
                </div>
                <p className="mt-4 text-[10px] font-mono uppercase tracking-[0.4em] text-white/30">Share this code with your opponent</p>
              </div>

              <div className="w-full bg-white/5 border border-white/5 rounded-3xl p-8 backdrop-blur-sm">
                <h3 className="text-sm font-black italic tracking-widest text-white/60 mb-6 uppercase">Participants</h3>
                <div className="space-y-4">
                  {/* Always show YOU */}
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
                        <Users size={18} className="text-cyan-500" />
                      </div>
                      <span className="font-bold tracking-tight italic">
                        {participants.find(p => p.session_id === sessionId)?.player_name || 'YOU'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-cyan-500 uppercase tracking-widest">YOU</span>
                  </div>

                  {/* Show Opponent if waiting or found */}
                  {participants.length < 2 && status === 'waiting' ? (
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-dashed border-white/10 animate-pulse">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                          <Loader2 size={18} className="text-white/20 animate-spin" />
                        </div>
                        <span className="font-bold tracking-tight italic text-white/20 uppercase">Waiting...</span>
                      </div>
                    </div>
                  ) : (
                    participants.filter(p => p.session_id !== sessionId).map((opponent) => (
                      <motion.div 
                        key={opponent.session_id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between p-4 bg-red-500/10 rounded-2xl border border-red-500/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                            <Users size={18} className="text-red-500" />
                          </div>
                          <span className="font-bold tracking-tight italic uppercase">
                            {opponent.player_name}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-red-500 uppercase tracking-widest">READY</span>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>

              {status === 'ready' && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8 flex flex-col items-center gap-2"
                >
                  <p className="text-green-500 font-black italic animate-bounce">FIGHT STARTING...</p>
                  <div className="w-32 h-1 bg-white/10 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 3 }}
                      className="h-full bg-green-500"
                    />
                  </div>
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
