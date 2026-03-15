import React, { Suspense, useRef, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera, OrbitControls, Environment, ContactShadows, Html } from '@react-three/drei';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Info, Zap, WifiOff, AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import NinjaModel from '../components/NinjaModel';

const PovTest = () => {
  const playerRef = useRef();
  const opponentRef = useRef();
  const socketRef = useRef();
  const location = useLocation();
  const navigate = useNavigate();
  const roomCode = location.state?.roomCode;
  const playerName = location.state?.playerName || 'You';
  const opponentName = location.state?.opponentName || 'Opponent';
  
  const [isOpponentDisconnected, setIsOpponentDisconnected] = useState(false);
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [showFightAnim, setShowFightAnim] = useState(false);

  // Sync animations over WebSockets
  useEffect(() => {
    if (!roomCode) return;

    let ws;
    const timeoutId = setTimeout(() => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.hostname}:8000/ws/${roomCode}`;
      ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        // Start "FIGHT!" animation shortly after connection
        setTimeout(() => setShowFightAnim(true), 1000);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'disconnect') {
          setIsOpponentDisconnected(true);
          return;
        }

        if (data.action && opponentRef.current) {
          let targetAction = data.action;
          opponentRef.current.playAction(targetAction);
          
          if (targetAction === 'Left_Hit' || targetAction === 'Right_Hit') {
            playerRef.current?.playAction('Got_Hit');
          }
        }
      };

      ws.onclose = () => {
        setIsOpponentDisconnected(true);
      };
    }, 500); // Small delay to ensure component is fully ready

    return () => {
      clearTimeout(timeoutId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [roomCode]);

  const playLocalAction = (actionName) => {
    if (playerRef.current) {
      playerRef.current.playAction(actionName);
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        try {
          socketRef.current.send(JSON.stringify({ action: actionName }));
        } catch (e) {
          console.error("Failed to send action:", e);
        }
      }
    }
  };

  const forfeitMatch = (e) => {
    e.preventDefault();
    setShowForfeitModal(true);
  };

  const confirmForfeit = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'disconnect', reason: 'forfeit' }));
    }
    navigate('/menu');
  };

  const animations = [
    { name: 'Idle', key: '1' },
    { name: 'Block', key: '2' },
    { name: 'Left_Hit', key: '3' },
    { name: 'Right_Hit', key: '4' },
    { name: 'Got_Hit', key: '5' },
    { name: 'Defeat', key: '6' },
    { name: 'Bow', key: '7' }
  ];

  // Listen for keys to trigger animations
  useEffect(() => {
    const handleKeyDown = (e) => {
      const anim = animations.find(a => a.key === e.key);
      if (anim) {
        playLocalAction(anim.name);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [animations]);

  return (
    <div className="w-full h-full relative bg-[#050505]">
      {/* HUD Header */}
      <div className="absolute top-0 left-0 w-full p-8 z-50 flex justify-between items-start pointer-events-none">
        <button 
          onClick={forfeitMatch}
          className="flex items-center gap-3 text-white/40 hover:text-white transition-all bg-zinc-900/80 px-6 py-3 rounded-xl border border-white/5 backdrop-blur-md pointer-events-auto group"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span className="font-black tracking-[0.2em] text-xs uppercase">Return to Menu</span>
        </button>
        
        <div className="text-right">
          <h2 className="text-white font-black italic tracking-tighter text-2xl uppercase">
            {roomCode ? `ROOM: ${roomCode}` : 'Ninja Animation Test'}
          </h2>
          <p className="text-red-500/60 font-mono text-[10px] tracking-widest uppercase mt-1">
            {roomCode ? 'MULTIPLAYER COMBAT READY' : 'Experimental Perspective Engine v1.1'}
          </p>
        </div>
      </div>

      {/* Animation Controls Overlay */}
      <div className="absolute top-24 right-8 z-50 bg-black/40 border border-white/5 backdrop-blur-xl p-6 rounded-2xl w-64 pointer-events-auto">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={14} className="text-yellow-500" />
          <span className="text-[10px] font-black uppercase tracking-widest text-white">Animation Controls</span>
        </div>
        
        <div className="grid grid-cols-1 gap-2">
          {animations.map((anim) => (
            <button
              key={anim.name}
              onClick={() => playLocalAction(anim.name)}
              className="flex justify-between items-center px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-all text-left group"
            >
              <span className="text-white/60 group-hover:text-white text-[11px] font-bold uppercase tracking-wider">{anim.name}</span>
              <span className="text-white/20 text-[9px] font-mono bg-black/40 px-2 py-0.5 rounded border border-white/5">{anim.key}</span>
            </button>
          ))}
        </div>
        
        <p className="mt-4 text-white/40 text-[10px] leading-relaxed italic border-t border-white/5 pt-4">
          Click buttons or press number keys to trigger animations for the player ninja.
        </p>
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
            {/* Opponent: Facing the player, slightly left and further back */}
            <group position={[-0.8, -1, -0.8]}>
              <Html position={[0, 4.5, 0]} center distanceFactor={10}>
                <div className="flex flex-col items-center gap-2 pointer-events-none select-none">
                  <div className="bg-black/60 backdrop-blur-md border border-red-500/30 px-4 py-1.5 rounded-lg">
                    <span className="text-white font-black italic tracking-widest text-sm uppercase whitespace-nowrap">
                      {opponentName}
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
              <NinjaModel 
                ref={opponentRef} 
                scale={1.8} 
                rotation={[0, Math.PI / 4, 0]} 
                color="#ff0000"
              />
              <mesh position={[0, 3, 0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshStandardMaterial color="red" emissive="red" emissiveIntensity={2} />
              </mesh>
            </group>

            {/* Player: Ninja (Facing Opponent, closer and on the right) */}
            <group position={[0.8, -1, 0.8]}>
              <NinjaModel 
                ref={playerRef} 
                scale={1.8} 
                rotation={[0, -Math.PI * 0.75, 0]} 
                color="#00ffff"
              />
              <mesh position={[0, 3, 0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshStandardMaterial color="cyan" emissive="cyan" emissiveIntensity={2} />
              </mesh>
            </group>

            <Environment preset="night" />
            <ContactShadows opacity={0.4} scale={20} blur={2.4} far={4.5} />
          </Suspense>

          <gridHelper args={[20, 20, 0x333333, 0x111111]} position={[0, -1.01, 0]} />
        </Canvas>
      </div>

      {/* Control Tips Overlay */}
      <div className="absolute bottom-12 right-12 flex flex-col items-end gap-2 z-50 pointer-events-none opacity-40">
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400 block">Cyan Marker</span>
            <span className="text-xs font-bold text-white uppercase italic">Ninja (You - Right)</span>
          </div>
          <div className="w-1 h-8 bg-cyan-400/50" />
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] font-black uppercase tracking-widest text-red-500 block">Red Marker</span>
            <span className="text-xs font-bold text-white uppercase italic">Opponent (Left)</span>
          </div>
          <div className="w-1 h-8 bg-red-500/50" />
        </div>
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

      {/* Custom Forfeit Modal */}
      <AnimatePresence>
        {showForfeitModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowForfeitModal(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-zinc-950 border border-white/10 rounded-2xl p-8 shadow-2xl"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                  <AlertTriangle size={32} className="text-red-500" />
                </div>
                <h2 className="text-2xl font-black italic text-white uppercase tracking-tighter mb-2">Forfeit Match?</h2>
                <p className="text-white/40 text-sm font-medium mb-8">
                  Leaving now will count as a defeat. Are you sure you want to exit the arena?
                </p>
                <div className="grid grid-cols-2 gap-4 w-full">
                  <button 
                    onClick={() => setShowForfeitModal(false)}
                    className="py-3 px-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-bold uppercase text-[10px] tracking-widest transition-all"
                  >
                    Stay & Fight
                  </button>
                  <button 
                    onClick={confirmForfeit}
                    className="py-3 px-6 bg-red-600 hover:bg-red-700 rounded-xl text-white font-black italic uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-red-600/20"
                  >
                    Yes, Forfeit
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PovTest;
