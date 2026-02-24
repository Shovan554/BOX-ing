import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Zap, Wifi, WifiOff, History, Activity } from 'lucide-react';
import { usePoseDetection } from '../hooks/usePoseDetection';
import { useSoundEffects } from '../hooks/useSoundEffects';

const API_BASE_URL = 'http://127.0.0.1:8000';
const WS_BASE_URL = 'ws://127.0.0.1:8000';

const CameraTest = () => {
  const videoRef = useRef(null);
  const landmarksData = usePoseDetection(videoRef);
  const { playSound } = useSoundEffects();
  const [lastAction, setLastAction] = useState({ type: 'None', side: '', timestamp: 0 });
  const [actionLog, setActionLog] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const wsRef = useRef(null);
  const logEndRef = useRef(null);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [actionLog]);

  // Initialize Session
  useEffect(() => {
    const startSession = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/session/start`, { method: 'POST' });
        const data = await response.json();
        setSessionId(data.session_id);
      } catch (err) {
        console.error("Failed to start session:", err);
      }
    };
    startSession();
  }, []);

  // Handle WebSocket Connection
  useEffect(() => {
    if (!sessionId) return;

    const connectWs = () => {
      const ws = new WebSocket(`${WS_BASE_URL}/ws/detect/${sessionId}`);
      
      ws.onopen = () => {
        console.log("Connected to detection backend");
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.action && data.action !== 'none' && data.action !== 'idle') {
          const actionType = data.action.charAt(0).toUpperCase() + data.action.slice(1);
          
          // Play sound based on action
          if (actionType === 'Hit') playSound('HIT');
          if (actionType === 'Block') playSound('BLOCK');

          const newAction = {
            id: Date.now(),
            type: actionType,
            side: data.side,
            timestamp: performance.now(),
            timeStr: new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })
          };
          
          setLastAction(newAction);
          setActionLog(prev => [newAction, ...prev].slice(0, 50)); // Keep last 50
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        setTimeout(connectWs, 2000); // Reconnect
      };

      wsRef.current = ws;
    };

    connectWs();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [sessionId]);

  // Send landmarks to backend
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && landmarksData) {
      wsRef.current.send(JSON.stringify({
        landmarks: landmarksData.points,
        timestamp: landmarksData.timestamp
      }));
    }
  }, [landmarksData]);

  useEffect(() => {
    const setupCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 1280, height: 720, facingMode: 'user' } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setIsReady(true);
        }
      } catch (err) {
        console.error("Camera access error:", err);
      }
    };
    setupCamera();
  }, []);

  const getActionColor = (type) => {
    switch(type) {
      case 'Hit': return 'text-red-500';
      case 'Block': return 'text-blue-500';
      default: return 'text-white';
    }
  };

  return (
    <div className="w-full h-full relative bg-black flex flex-col items-center justify-center p-8 overflow-hidden">
      {/* HUD Background Decoration */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-1/4 left-0 w-full h-[1px] bg-red-600/30" />
        <div className="absolute top-3/4 left-0 w-full h-[1px] bg-red-600/30" />
        <div className="absolute left-1/4 top-0 w-[1px] h-full bg-red-600/30" />
        <div className="absolute left-3/4 top-0 w-[1px] h-full bg-red-600/30" />
      </div>

      <Link 
        to="/menu" 
        onMouseEnter={() => playSound('SELECT')}
        onClick={() => playSound('START')}
        className="absolute top-8 left-8 z-50 flex items-center gap-3 text-white/40 hover:text-white transition-all bg-zinc-900/80 px-6 py-3 rounded-xl border border-white/5 backdrop-blur-md group"
      >
        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
        <span className="font-black tracking-[0.2em] text-xs uppercase">Abort Mission</span>
      </Link>

      <div className="flex flex-col lg:flex-row gap-8 w-full max-w-7xl h-[80vh] z-10">
        {/* Main Viewport */}
        <div className="flex-1 relative rounded-3xl overflow-hidden border-2 border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] bg-zinc-950 group">
          <video
            ref={videoRef}
            className="w-full h-full object-cover scale-x-[-1] opacity-80"
            autoPlay
            playsInline
            muted
          />
          
          {/* HUD Overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-between p-10 pointer-events-none">
            <div className="w-full flex justify-between items-start">
              <div className="flex flex-col gap-4">
                <div className="bg-black/60 backdrop-blur-xl p-5 rounded-2xl border-l-4 border-green-500 flex flex-col gap-1 shadow-xl">
                  <div className="flex items-center gap-2 text-white/40 mb-1">
                    <Activity size={12} className="animate-pulse" />
                    <span className="text-[10px] font-black tracking-widest uppercase">Bio-Link</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${isReady ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-red-500 animate-pulse'}`} />
                    <span className="font-black text-sm text-white tracking-tighter">{isReady ? 'NEURAL LINK ACTIVE' : 'CONNECTING...'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-black/60 backdrop-blur-xl p-5 rounded-2xl border-r-4 border-red-500 flex flex-col items-end gap-1 shadow-xl">
                <div className="flex items-center gap-2 text-white/40 mb-1">
                  <span className="text-[10px] font-black tracking-widest uppercase">Remote Engine</span>
                  <Wifi size={12} className={wsConnected ? 'text-green-500' : 'text-red-500'} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-black text-sm text-white tracking-tighter uppercase">{wsConnected ? 'Python Core Online' : 'Linking...'}</span>
                </div>
              </div>
            </div>

            {/* Flash Feedback */}
            <div className="flex flex-col items-center gap-4 py-12">
              {performance.now() - lastAction.timestamp < 800 ? (
                <div className="flex flex-col items-center animate-in zoom-in duration-150">
                  <div className={`text-8xl font-black italic tracking-tighter ${getActionColor(lastAction.type)} drop-shadow-[0_0_30px_rgba(255,255,255,0.2)] uppercase`}>
                    {lastAction.side} {lastAction.type}
                  </div>
                  <div className="h-1 w-full bg-current mt-2 animate-out fade-out duration-700" />
                </div>
              ) : (
                <div className="text-white/5 text-2xl font-black italic uppercase tracking-[0.8em] select-none">
                  Stand By
                </div>
              )}
            </div>

            {/* Bottom Indicators */}
            <div className="w-full max-w-md grid grid-cols-3 gap-4 bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/5 shadow-2xl">
              {['Left-Hit', 'Right-Hit', 'Block'].map((label, idx) => {
                const isActive = (label === 'Block' && lastAction.type === 'Block') || 
                               (label === 'Left-Hit' && lastAction.type === 'Hit' && lastAction.side === 'left') ||
                               (label === 'Right-Hit' && lastAction.type === 'Hit' && lastAction.side === 'right');
                return (
                  <div key={label} className="flex flex-col items-center gap-2">
                    <span className={`text-[9px] font-black uppercase tracking-widest transition-colors ${isActive ? 'text-white' : 'text-white/20'}`}>{label}</span>
                    <div className={`h-1.5 w-full rounded-full transition-all duration-200 ${
                      isActive ? (label === 'Block' ? 'bg-blue-500 shadow-[0_0_15px_#3b82f6]' : 'bg-red-500 shadow-[0_0_15px_#ef4444]') : 'bg-white/5'
                    }`} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action Log Sidebar */}
        <div className="w-full lg:w-96 flex flex-col bg-zinc-950 rounded-3xl border border-white/10 overflow-hidden shadow-2xl relative">
          <div className="absolute inset-0 bg-red-900/5 pointer-events-none" />
          <div className="p-8 border-b border-white/5 flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-red-600 animate-pulse rounded-full" />
              <h2 className="font-black italic text-sm tracking-[0.3em] uppercase text-white">Action Feed</h2>
            </div>
            <div className="font-mono text-[10px] text-white/30 tracking-tighter">SEC_TYPE: LOG_A</div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-3 relative z-10 custom-scrollbar">
            {actionLog.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-4 opacity-10">
                <History size={40} />
                <span className="text-xs font-black uppercase tracking-[0.4em]">Listening...</span>
              </div>
            ) : (
              actionLog.map((log) => (
                <div 
                  key={log.id} 
                  className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/20 transition-all group animate-in slide-in-from-right duration-300"
                >
                  <div className="flex flex-col gap-1">
                    <span className={`text-sm font-black italic uppercase tracking-wider ${getActionColor(log.type)}`}>
                      {log.side} {log.type}
                    </span>
                    <span className="text-[9px] text-white/20 font-mono tracking-widest group-hover:text-white/40 transition-colors">
                      TIME_REF: {log.timeStr}
                    </span>
                  </div>
                  <div className={`p-2 rounded-lg bg-black/40 border border-white/5 ${getActionColor(log.type)} opacity-50`}>
                    {log.type === 'Hit' ? <Zap size={14} /> : <Shield size={14} />}
                  </div>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
      
      <div className="mt-8 flex items-center gap-8 opacity-20">
        <div className="h-[1px] w-32 bg-gradient-to-r from-transparent to-white" />
        <p className="text-[9px] font-black uppercase tracking-[1em] italic text-white whitespace-nowrap">Neural Combat Interface v0.3.5</p>
        <div className="h-[1px] w-32 bg-gradient-to-l from-transparent to-white" />
      </div>
    </div>
  );
};

export default CameraTest;
