import React, { Suspense, useRef, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera, OrbitControls, Environment, ContactShadows, Html } from '@react-three/drei';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Info, Zap, WifiOff, AlertTriangle, X, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import NinjaModel from '../components/NinjaModel';
import { usePoseDetection } from '../hooks/usePoseDetection';
import { useCombatGestures } from '../hooks/useCombatGestures';

const PovTest = () => {
  const playerRef = useRef();
  const opponentRef = useRef();
  const socketRef = useRef();
  const videoRef = useRef();
  const location = useLocation();
  const navigate = useNavigate();
  const roomCode = location.state?.roomCode;
  const playerName = location.state?.playerName || 'You';
  const opponentName = location.state?.opponentName || 'Opponent';
  const sessionId = location.state?.sessionId;
  
  const [isOpponentDisconnected, setIsOpponentDisconnected] = useState(false);
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [showFightAnim, setShowFightAnim] = useState(false);
  const [gameState, setGameState] = useState('waiting'); // waiting, bowing, fighting
  const [feedback, setFeedback] = useState(null); // { text: 'Hit!', color: 'text-green-500' }
  const [localLastAction, setLocalLastAction] = useState(null);
  const [isBlocking, setIsBlocking] = useState(false);
  const [scores, setScores] = useState({}); // { sessionId: score }
  const [matchEnded, setMatchEnded] = useState(false);
  const [winner, setWinner] = useState(null);
  const [isForfeit, setIsForfeit] = useState(false);
  const pendingHitTimeoutRef = useRef(null);
  const localHasHitInLastSecRef = useRef(false);

  // Initialize camera
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        console.error("Camera error:", err);
      }
    };
    startCamera();
    return () => {
      const stream = videoRef.current?.srcObject;
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  // Gesture detection
  const [gesture, processLandmarks] = useCombatGestures();
  const isPoseReady = usePoseDetection(videoRef, processLandmarks);

  // Sync animations over WebSockets
  useEffect(() => {
    if (!roomCode) return;

    let ws;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:8000/ws/${roomCode}`;
    ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'disconnect') {
        setIsOpponentDisconnected(true);
        // If opponent disconnects, player wins by forfeit
        if (!matchEnded) {
          if (pendingHitTimeoutRef.current) clearTimeout(pendingHitTimeoutRef.current);
          setWinner('YOU');
          setMatchEnded(true);
          setIsForfeit(true);
          opponentRef.current?.playAction('defeat', true);
        }
        return;
      }

      // Handle score updates from server
      if (data.type === 'score_update') {
        setScores(data.scores || {});
        return;
      }

      // Handle match end
      if (data.type === 'match_end') {
        if (pendingHitTimeoutRef.current) clearTimeout(pendingHitTimeoutRef.current);
        
        setScores(data.final_scores || {});
        const isWinner = data.winner_session_id === sessionId;
        setWinner(isWinner ? 'YOU' : opponentName);
        setMatchEnded(true);
        setIsForfeit(data.reason === 'forfeit');
        
        // Play defeat animation for the loser
        if (!isWinner) {
          playerRef.current?.playAction('defeat', true);
        } else {
          opponentRef.current?.playAction('defeat', true);
        }
        return;
      }

      // Game state sync
      if (data.type === 'gameState') {
        setGameState(data.state);
        if (data.state === 'fighting') {
          setShowFightAnim(true);
        }
        return;
      }

      if (data.action && opponentRef.current) {
        const targetAction = data.action;
        opponentRef.current.playAction(targetAction);
        
        // Combat logic: if opponent hits, check if we are blocking
        if (targetAction === 'Left_Hit' || targetAction === 'Right_Hit') {
          if (isBlocking) {
            showFeedback('BLOCKED!', 'text-blue-500');
            // Notify opponent their hit was blocked
            socketRef.current.send(JSON.stringify({ type: 'block_event', timestamp: Date.now() }));
          } else {
            // New logic: 1 second delay for the local player to "react"
            // If they hit back within 1s, they don't play Got_Hit
            localHasHitInLastSecRef.current = false;
            if (pendingHitTimeoutRef.current) clearTimeout(pendingHitTimeoutRef.current);
            
            pendingHitTimeoutRef.current = setTimeout(() => {
              if (!localHasHitInLastSecRef.current && !matchEnded) {
                showFeedback('BIG HIT RECEIVED!', 'text-red-500');
                playerRef.current?.playAction('Got_Hit');
              }
            }, 1000);
          }
        }
      }

      if (data.type === 'block_event') {
        showFeedback('OPPONENT BLOCKED!', 'text-yellow-500');
      }
    };

    ws.onclose = () => setIsOpponentDisconnected(true);

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [roomCode, isBlocking]);

  // Handle local gestures
  useEffect(() => {
    if (!gesture || gesture === localLastAction) return;
    
    // Only allow gestures in fighting state (Bow is now automatic)
    if (gameState === 'fighting') {
      // Don't register new actions if we are currently animating a hit or being hit
      if (playerRef.current?.isBusy()) return;

      if (gesture === 'Block') {
        setIsBlocking(true);
        playLocalAction('Block');
      } else {
        setIsBlocking(false);
        if (gesture === 'Left_Hit' || gesture === 'Right_Hit') {
          playLocalAction(gesture);
          showFeedback('HIT!', 'text-green-500');
        } else if (gesture === 'Idle') {
          playLocalAction('Idle');
        }
      }
    }
    setLocalLastAction(gesture);
  }, [gesture, gameState]);

  const showFeedback = (text, color) => {
    setFeedback({ text, color });
    setTimeout(() => setFeedback(null), 1000);
  };

  const playLocalAction = (actionName) => {
    if (playerRef.current && !matchEnded) {
      if (actionName === 'Left_Hit' || actionName === 'Right_Hit') {
        localHasHitInLastSecRef.current = true;
      }
      
      const played = playerRef.current.playAction(actionName);
      if (!played) return false;

      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        // Send normal action for animation broadcast
        socketRef.current.send(JSON.stringify({ 
          session_id: sessionId,
          action: actionName,
          timestamp: Date.now()
        }));

        // If it's a hit, also send as a hit_event for scoring
        if (actionName === 'Left_Hit' || actionName === 'Right_Hit') {
          socketRef.current.send(JSON.stringify({ 
            type: 'hit_event',
            session_id: sessionId,
            timestamp: Date.now()
          }));
        }
      }
    }
  };

  // Automated Bowing Sequence
  useEffect(() => {
    if (roomCode && gameState === 'waiting') {
      // 1. Move to bowing after 1.5s
      setTimeout(() => {
        setGameState('bowing');
        playLocalAction('Bow');
        
        // 2. Start fight after bowing animation completes (3s total)
        setTimeout(() => {
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: 'gameState', state: 'fighting' }));
          }
        }, 3000);
      }, 1500);
    }
  }, [roomCode, gameState]);

  const animations = [
    { name: 'Idle', key: '1' },
    { name: 'Block', key: '2' },
    { name: 'Left_Hit', key: '3' },
    { name: 'Right_Hit', key: '4' },
    { name: 'Got_Hit', key: '5' },
    { name: 'Defeat', key: '6' },
    { name: 'Bow', key: '7' }
  ];

  const forfeitMatch = (e) => {
    e.preventDefault();
    setShowForfeitModal(true);
  };

  const confirmForfeit = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ 
        type: 'disconnect', 
        reason: 'forfeit',
        session_id: sessionId 
      }));
    }
    navigate('/menu');
  };

  return (
    <div className="w-full h-full relative bg-[#050505] overflow-hidden">
      {/* Camera Preview */}
      <div className="absolute bottom-8 left-8 z-[60] w-48 aspect-video bg-black/40 border border-white/10 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
        <video 
          ref={videoRef}
          autoPlay 
          playsInline 
          muted 
          className="w-full h-full object-cover scale-x-[-1]"
        />
        <div className="absolute top-2 left-2 bg-black/60 px-2 py-0.5 rounded border border-white/5 flex items-center gap-1">
          <Camera size={10} className="text-cyan-400" />
          <span className="text-[8px] font-black uppercase tracking-widest text-white/60">Live Feed</span>
        </div>
      </div>

      {/* HUD Header */}
      <div className="absolute top-0 left-0 w-full p-8 z-50 flex justify-between items-start pointer-events-none">
        <button 
          onClick={forfeitMatch}
          className="flex items-center gap-3 text-white/40 hover:text-white transition-all bg-zinc-900/80 px-6 py-3 rounded-xl border border-white/5 backdrop-blur-md pointer-events-auto group"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span className="font-black tracking-[0.2em] text-xs uppercase">Forfeit Match</span>
        </button>
        
        <div className="text-right flex flex-col items-end">
          <div className="flex items-center gap-6 mb-1">
            <div className="flex flex-col items-end">
              <span className="text-[12px] font-mono text-cyan-400 uppercase tracking-widest font-black">Local Hero</span>
              <div className="flex items-baseline gap-4 mt-1">
                <span className="text-cyan-400 font-black text-6xl drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">{scores[sessionId] || 0}</span>
                <h3 className="text-white font-black italic tracking-tighter text-6xl uppercase leading-none drop-shadow-lg">{playerName}</h3>
              </div>
            </div>
            <div className="w-[2px] h-20 bg-white/20 mx-4" />
            <div className="flex flex-col items-start text-left">
              <span className="text-[12px] font-mono text-red-500 uppercase tracking-widest font-black">Hostile Rival</span>
              <div className="flex items-baseline gap-4 mt-1">
                <h3 className="text-white font-black italic tracking-tighter text-6xl uppercase leading-none drop-shadow-lg">{opponentName}</h3>
                <span className="text-red-500 font-black text-6xl drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]">
                  {Object.entries(scores).find(([sid]) => sid !== sessionId)?.[1] || 0}
                </span>
              </div>
            </div>
          </div>
          <p className="text-white/20 font-mono text-[9px] tracking-[0.5em] uppercase">Arena Sync {roomCode}</p>
        </div>
      </div>

      {/* Feedback Overlay */}
      <AnimatePresence>
        {feedback && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.5 }}
            className="absolute inset-0 z-[110] flex items-center justify-center pointer-events-none"
          >
            <h2 className={`text-8xl font-black italic uppercase tracking-tighter drop-shadow-2xl ${feedback.color}`}>
              {feedback.text}
            </h2>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game State Overlay */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-50 pointer-events-none text-center">
        {gameState === 'bowing' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-4"
          >
            <h2 className="text-4xl font-black italic text-white uppercase tracking-tighter">Prepare for Duel</h2>
            <p className="text-white/40 font-mono text-xs uppercase tracking-[0.3em] animate-pulse">Match Starting...</p>
          </motion.div>
        )}
      </div>

      {/* 3D Scene */}
      <div className="w-full h-full">
        <Canvas shadows>
          <PerspectiveCamera makeDefault position={[3, 2, 5]} fov={45} />
          <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.75} />
          
          <ambientLight intensity={0.5} />
          <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={2} color="#ff0000" castShadow />
          <pointLight position={[-10, 10, -10]} intensity={1} color="#0066ff" />
          
          <Suspense fallback={null}>
            <group position={[-0.8, -1, -0.8]}>
              <Html position={[0, 4.8, 0]} center distanceFactor={10}>
                <div className="flex flex-col items-center gap-4 pointer-events-none select-none">
                  <div className="bg-black/80 backdrop-blur-xl border-2 border-red-500/50 px-10 py-4 rounded-3xl flex items-center gap-6 shadow-[0_0_50px_rgba(239,68,68,0.3)]">
                    <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.8)]" />
                    <span className="text-white font-black italic tracking-tighter text-6xl uppercase whitespace-nowrap drop-shadow-lg">
                      {opponentName} 
                    </span>
                    <div className="w-[2px] h-12 bg-white/20 mx-2" />
                    <span className="text-red-500 font-black text-6xl drop-shadow-lg">
                      {Object.entries(scores).find(([sid]) => sid !== sessionId)?.[1] || 0}
                    </span>
                  </div>
                  {isOpponentDisconnected && (
                    <motion.div 
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-red-600/90 text-white px-3 py-1 rounded-full flex items-center gap-2 shadow-[0_0_20px_rgba(220,38,38,0.5)]"
                    >
                      <WifiOff size={12} />
                      <span className="text-[10px] font-black uppercase tracking-tighter">Disconnected</span>
                    </motion.div>
                  )}
                </div>
              </Html>
              <NinjaModel ref={opponentRef} scale={1.8} rotation={[0, Math.PI / 4, 0]} color="#ff0000" />
            </group>

            <group position={[0.8, -1, 0.8]}>
              <NinjaModel ref={playerRef} scale={1.8} rotation={[0, -Math.PI * 0.75, 0]} color="#00ffff" />
            </group>

            <Environment preset="night" />
            <ContactShadows opacity={0.4} scale={20} blur={2.4} far={4.5} />
          </Suspense>

          <gridHelper args={[20, 20, 0x333333, 0x111111]} position={[0, -1.01, 0]} />
        </Canvas>
      </div>

      {/* "FIGHT!" Animation */}
      <AnimatePresence>
        {showFightAnim && (
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1.5, opacity: 1 }}
            exit={{ scale: 3, opacity: 0 }}
            onAnimationComplete={() => setTimeout(() => setShowFightAnim(false), 800)}
            className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none"
          >
            <h1 className="text-[15vw] font-black italic text-red-600 drop-shadow-[0_0_50px_rgba(220,38,38,0.8)] uppercase tracking-tighter">
              FIGHT!
            </h1>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Forfeit Modal */}
      <AnimatePresence>
        {showForfeitModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowForfeitModal(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-sm bg-zinc-950 border border-white/10 rounded-2xl p-8 shadow-2xl">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6"><AlertTriangle size={32} className="text-red-500" /></div>
                <h2 className="text-2xl font-black italic text-white uppercase tracking-tighter mb-2">Forfeit Match?</h2>
                <p className="text-white/40 text-sm font-medium mb-8">Leaving now will count as a defeat. Are you sure you want to exit the arena?</p>
                <div className="grid grid-cols-2 gap-4 w-full">
                  <button onClick={() => setShowForfeitModal(false)} className="py-3 px-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-bold uppercase text-[10px] tracking-widest transition-all">Stay & Fight</button>
                  <button onClick={confirmForfeit} className="py-3 px-6 bg-red-600 hover:bg-red-700 rounded-xl text-white font-black italic uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-red-600/20">Yes, Forfeit</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Match End Button (Standalone at bottom) */}
      <AnimatePresence>
        {matchEnded && (
          <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[200] w-full max-w-xs px-4">
            <motion.div 
              initial={{ y: 100, opacity: 0 }} 
              animate={{ y: 0, opacity: 1 }} 
              className="flex flex-col items-center gap-4"
            >
              <div className="bg-black/60 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 mb-2">
                <p className="text-white font-black italic uppercase tracking-tighter text-sm">
                  {winner === 'YOU' ? 'VICTORY ACHIEVED' : 'DEFEAT SUSTAINED'}
                </p>
              </div>
              <button 
                onClick={() => navigate('/results', { 
                  state: { 
                    winner, 
                    scores, 
                    playerName, 
                    opponentName, 
                    sessionId 
                  } 
                })} 
                className="w-full py-5 bg-red-600 text-white rounded-2xl font-black italic uppercase text-lg tracking-tighter hover:bg-white hover:text-black transition-all transform hover:scale-105 shadow-[0_0_50px_rgba(220,38,38,0.4)]"
              >
                Show Results
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PovTest;
