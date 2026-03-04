import React, { Suspense, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera, OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { Link } from 'react-router-dom';
import { ArrowLeft, Info, Zap } from 'lucide-react';
import GrannyModel from '../components/GrannyModel';
import NinjaModel from '../components/NinjaModel';

const PovTest = () => {
  const playerRef = useRef();
  const opponentRef = useRef();

  // Listen for 'w' key to trigger animations manually
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key.toLowerCase() === 'w') {
        // Trigger jab/hook on both
        if (playerRef.current) playerRef.current.playAction('Punch');
        if (opponentRef.current) opponentRef.current.playAction('left hook');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="w-full h-full relative bg-[#050505]">
      {/* HUD Header */}
      <div className="absolute top-0 left-0 w-full p-8 z-50 flex justify-between items-start pointer-events-none">
        <Link 
          to="/menu" 
          className="flex items-center gap-3 text-white/40 hover:text-white transition-all bg-zinc-900/80 px-6 py-3 rounded-xl border border-white/5 backdrop-blur-md pointer-events-auto group"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span className="font-black tracking-[0.2em] text-xs uppercase">Return to Menu</span>
        </Link>
        
        <div className="text-right">
          <h2 className="text-white font-black italic tracking-tighter text-2xl uppercase">Animation Sync Test</h2>
          <p className="text-red-500/60 font-mono text-[10px] tracking-widest uppercase mt-1">Experimental Perspective Engine v1.1</p>
        </div>
      </div>

      {/* Instruction Overlay */}
      <div className="absolute top-24 right-8 z-50 bg-black/40 border border-white/5 backdrop-blur-xl p-4 rounded-2xl w-64 pointer-events-none">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={14} className="text-yellow-500" />
          <span className="text-[10px] font-black uppercase tracking-widest text-white">Input Control</span>
        </div>
        <p className="text-white/40 text-[11px] leading-relaxed italic">
          Press <span className="text-white font-bold">'W'</span> to trigger simultaneous attack animations.
        </p>
      </div>

      {/* 3D Scene */}
      <div className="w-full h-full">
        <Canvas shadows>
          <PerspectiveCamera makeDefault position={[0, 2, 8]} fov={50} />
          <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.75} />
          
          <ambientLight intensity={0.5} />
          <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={2} color="#ff0000" castShadow />
          <pointLight position={[-10, 10, -10]} intensity={1} color="#0066ff" />
          
          <Suspense fallback={null}>
            {/* Opponent: Facing the camera/player */}
            <group position={[0, -1, -1.5]}>
              <GrannyModel 
                ref={opponentRef} 
                scale={1.8} 
                rotation={[0, 0, 0]} 
              />
              <mesh position={[0, 3, 0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshStandardMaterial color="red" emissive="red" emissiveIntensity={2} />
              </mesh>
            </group>

            {/* Player: Ninja (Facing Opponent) */}
            <group position={[0, -1, 3.0]}>
              <NinjaModel 
                ref={playerRef} 
                scale={1.8} 
                rotation={[0, Math.PI, 0]} 
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
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-8 z-50 pointer-events-none opacity-40">
        <div className="flex flex-col items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Cyan Marker</span>
          <span className="text-xs font-bold text-white uppercase italic">Ninja (You)</span>
        </div>
        <div className="w-[1px] h-8 bg-white/10" />
        <div className="flex flex-col items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-red-500">Red Marker</span>
          <span className="text-xs font-bold text-white uppercase italic">Opponent</span>
        </div>
      </div>
    </div>
  );
};

export default PovTest;
