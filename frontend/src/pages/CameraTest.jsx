import React, { useRef, useEffect, useState, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Zap, Wifi, WifiOff, History, Activity } from 'lucide-react';
import { Canvas as ThreeCanvas } from '@react-three/fiber';
import { PerspectiveCamera, Preload, ContactShadows } from '@react-three/drei';
import GrannyModel from '../components/GrannyModel';
import { usePoseDetection } from '../hooks/usePoseDetection';
import { useHandDetection } from '../hooks/useHandDetection';
import { useSoundEffects } from '../hooks/useSoundEffects';

const API_BASE_URL = `http://${window.location.hostname}:8000`;
const WS_BASE_URL = `ws://${window.location.hostname}:8000`;

const CameraTest = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const grannyRef = useRef(null);
  const landmarksData = usePoseDetection(videoRef);
  const handData = useHandDetection(videoRef);
  const { playSound } = useSoundEffects();
  const [currentState, setCurrentState] = useState('STAND BY');
  const [handStatus, setHandStatus] = useState({ left: { detected: false, fist: false }, right: { detected: false, fist: false } });
  const [lastAction, setLastAction] = useState({ type: 'None', side: '', timestamp: 0 });
  const [actionLog, setActionLog] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const wsRef = useRef(null);
  const logEndRef = useRef(null);

  // Draw landmarks on canvas
  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const video = videoRef.current;
    
    // Set canvas size to match video display size
    canvasRef.current.width = video.clientWidth;
    canvasRef.current.height = video.clientHeight;
    
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    const drawPoint = (x, y, color = 'red', size = 3) => {
      ctx.beginPath();
      // Mirror x since video is mirrored
      const mirroredX = canvasRef.current.width - (x * canvasRef.current.width);
      ctx.arc(mirroredX, y * canvasRef.current.height, size, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    };

    const drawLine = (p1, p2, color = 'white', width = 1) => {
      ctx.beginPath();
      const x1 = canvasRef.current.width - (p1.x * canvasRef.current.width);
      const x2 = canvasRef.current.width - (p2.x * canvasRef.current.width);
      ctx.moveTo(x1, p1.y * canvasRef.current.height);
      ctx.lineTo(x2, p2.y * canvasRef.current.height);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    // Draw Pose Landmarks
    if (landmarksData?.points) {
      // Key pose connections for boxing (shoulders, arms)
      const connections = [
        [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], // Shoulders and arms
        [11, 23], [12, 24], [23, 24] // Torso
      ];
      
      connections.forEach(([i, j]) => {
        const p1 = landmarksData.points[i];
        const p2 = landmarksData.points[j];
        if (p1 && p2 && p1.visibility > 0.5 && p2.visibility > 0.5) {
          drawLine(p1, p2, 'rgba(255, 255, 255, 0.3)', 2);
        }
      });

      landmarksData.points.forEach((pt, i) => {
        if (pt.visibility > 0.5) {
          // Color coding: 0 is nose, 11-16 are arms
          let color = 'rgba(255, 255, 255, 0.5)';
          if (i === 0) color = 'red';
          if (i === 15 || i === 16) color = '#00f2ff'; // Wrists
          drawPoint(pt.x, pt.y, color, i === 0 ? 4 : 2);
        }
      });
    }

    // Draw Hand Landmarks
    if (handData?.landmarks) {
      handData.landmarks.forEach((hand, handIdx) => {
        const isLeft = handData.handedness[handIdx][0].category_name === 'Left';
        const color = isLeft ? '#ff0055' : '#00ff55';
        
        // Draw hand connections
        const handConnections = [
          [0, 1], [1, 2], [2, 3], [3, 4], // thumb
          [0, 5], [5, 6], [6, 7], [7, 8], // index
          [5, 9], [9, 10], [10, 11], [11, 12], // middle
          [9, 13], [13, 14], [14, 15], [15, 16], // ring
          [13, 17], [17, 18], [18, 19], [19, 20], [0, 17] // pinky
        ];
        
        handConnections.forEach(([i, j]) => {
          drawLine(hand[i], hand[j], color, 1.5);
        });
        
        hand.forEach(pt => drawPoint(pt.x, pt.y, color, 2));
      });
    }
  }, [landmarksData, handData]);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [actionLog]);

  // Initialize Session
  useEffect(() => {
    const startSession = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE_URL}/session/start`, { 
          method: 'POST',
          headers: headers
        });
        const data = await response.json();
        setSessionId(data.id || data.session_id);
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
        if (data.hand_status) {
          setHandStatus(data.hand_status);
        }
        if (data.action) {
          if (data.action !== 'none') {
            const actionType = data.action.charAt(0).toUpperCase() + data.action.slice(1);
            setCurrentState(actionType === 'Idle' ? 'IDLE' : actionType.toUpperCase());
            
            // Trigger Granny Animation
            if (grannyRef.current) {
              if (actionType === 'Hit') {
                grannyRef.current.playAction(Math.random() > 0.5 ? 'right hook' : 'left hook');
              } else if (actionType === 'Block') {
                grannyRef.current.playAction('right block');
              } else if (actionType === 'Idle') {
                grannyRef.current.playAction('Idle');
              }
            }

            // Skip logging and sound for idle
            if (data.action === 'idle') return;

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
          } else {
            setCurrentState('ACTIVE');
          }
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
      const payload = {
        landmarks: landmarksData.points,
        timestamp: landmarksData.timestamp,
        hand_data: handData ? {
          landmarks: handData.landmarks,
          handedness: handData.handedness,
          timestamp: handData.timestamp
        } : null
      };
      
      wsRef.current.send(JSON.stringify(payload));
    }
  }, [landmarksData, handData]);

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
        <div className="flex-1 flex flex-col gap-8">
          <div className="flex-1 relative rounded-3xl overflow-hidden border-2 border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] bg-zinc-950 group">
            <video
              ref={videoRef}
              className="w-full h-full object-cover scale-x-[-1] opacity-80"
              autoPlay
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
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

              {/* Hand Status HUD */}
              <div className="w-full flex justify-between px-4">
                <div className={`flex flex-col gap-1 transition-all duration-300 ${handStatus?.left?.detected ? 'opacity-100' : 'opacity-30'}`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${handStatus?.left?.detected ? (handStatus?.left?.fist ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-green-500') : 'bg-zinc-800'}`} />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Left Peripheral</span>
                  </div>
                  <div className="text-xl font-black italic text-white tracking-tighter uppercase">
                    {handStatus?.left?.detected ? (handStatus?.left?.fist ? 'Fist Clenched' : 'Hand Open') : 'Searching...'}
                  </div>
                </div>

                <div className={`flex flex-col items-end gap-1 transition-all duration-300 ${handStatus?.right?.detected ? 'opacity-100' : 'opacity-30'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Right Peripheral</span>
                    <div className={`w-2 h-2 rounded-full ${handStatus?.right?.detected ? (handStatus?.right?.fist ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-green-500') : 'bg-zinc-800'}`} />
                  </div>
                  <div className="text-xl font-black italic text-white tracking-tighter uppercase">
                    {handStatus?.right?.detected ? (handStatus?.right?.fist ? 'Fist Clenched' : 'Hand Open') : 'Searching...'}
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
                  <div className="flex flex-col items-center">
                    <div className="text-white/5 text-2xl font-black italic uppercase tracking-[0.8em] select-none mb-2">
                      System Status
                    </div>
                    <div className={`text-4xl font-black italic uppercase tracking-[0.4em] ${currentState === 'IDLE' ? 'text-white/20' : 'text-green-500/50'}`}>
                      {currentState}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Indicators */}
              <div className="w-full max-w-lg grid grid-cols-4 gap-3 bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/5 shadow-2xl">
                {['Left-Hit', 'Right-Hit', 'Block', 'Idle'].map((label) => {
                  const isActive = (label === 'Block' && currentState === 'BLOCK') || 
                                 (label === 'Left-Hit' && currentState === 'HIT' && lastAction.side === 'left') ||
                                 (label === 'Right-Hit' && currentState === 'HIT' && lastAction.side === 'right') ||
                                 (label === 'Idle' && currentState === 'IDLE');
                  return (
                    <div key={label} className="flex flex-col items-center gap-2">
                      <span className={`text-[9px] font-black uppercase tracking-widest transition-colors ${isActive ? 'text-white' : 'text-white/20'}`}>{label}</span>
                      <div className={`h-1.5 w-full rounded-full transition-all duration-200 ${
                        isActive 
                          ? (label === 'Block' ? 'bg-blue-500 shadow-[0_0_15px_#3b82f6]' 
                             : label === 'Idle' ? 'bg-green-500 shadow-[0_0_15px_#22c55e]'
                             : 'bg-red-500 shadow-[0_0_15px_#ef4444]') 
                          : 'bg-white/5'
                      }`} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3D Model Viewport */}
          <div className="h-64 relative rounded-3xl overflow-hidden border-2 border-white/10 bg-zinc-950 shadow-2xl">
            <ThreeCanvas 
              shadows
              flat
              gl={{ antialias: true, alpha: true }}
              dpr={[1, 1.5]}
            >
              <PerspectiveCamera makeDefault position={[0, 1.5, 4]} fov={50} />
              <ambientLight intensity={1} />
              <spotLight position={[5, 5, 5]} angle={0.15} penumbra={1} intensity={2} color="#ff0000" castShadow />
              
              <Suspense fallback={null}>
                <GrannyModel ref={grannyRef} position={[0, -1, 0]} scale={1.5} />
                <Preload all />
              </Suspense>
              
              <ContactShadows opacity={0.6} scale={10} blur={2.5} far={4.5} color="#000000" />
            </ThreeCanvas>
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
