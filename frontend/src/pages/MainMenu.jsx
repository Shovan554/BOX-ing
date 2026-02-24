import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera, ContactShadows, Preload } from '@react-three/drei';
import GrannyModel from '../components/GrannyModel';
import { useSoundEffects } from '../hooks/useSoundEffects';

const MenuItem = ({ label, onClick, onHover }) => (
  <button
    onClick={onClick}
    onMouseEnter={onHover}
    className="group w-full text-left px-12 py-5 text-4xl font-black italic tracking-tighter hover:bg-white hover:text-black transition-all duration-300 uppercase relative overflow-hidden"
  >
    <div className="absolute inset-0 bg-red-600 translate-x-[-101%] group-hover:translate-x-0 transition-transform duration-300 -z-10" />
    <span className="inline-block transform group-hover:translate-x-6 transition-transform duration-300">
      {label}
    </span>
    <div className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-1 bg-white opacity-0 group-hover:opacity-100 transition-opacity" />
  </button>
);

const MainMenu = () => {
  const navigate = useNavigate();
  const { playSound } = useSoundEffects();

  const menuOptions = [
    { label: 'Multiplayer', path: '/multiplayer' },
    { label: 'Create Room', path: '/create-room' },
    { label: 'Leaderboard', path: '/leaderboard' },
    { label: 'Settings', path: '/settings' },
    { label: 'Camera Test', path: '/camera-test' },
  ];

  return (
    <div className="w-full h-full flex flex-col md:flex-row overflow-hidden bg-black/40">
      {/* Scanline Effect Overlay */}
      <div className="absolute inset-0 pointer-events-none z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.02),rgba(0,255,0,0.01),rgba(0,0,255,0.02))] bg-[length:100%_4px,3px_100%] opacity-20" />

      {/* 3D Character Section */}
      <div className="w-full md:w-1/2 h-1/2 md:h-full relative">
        <div className="absolute top-12 left-12 z-10 border-l-4 border-red-600 pl-4">
          <h2 className="text-sm font-black tracking-[0.4em] uppercase text-white/40">Fighter Status</h2>
          <p className="text-xl font-bold italic text-white uppercase tracking-wider">Ready for Combat</p>
        </div>
        
        <Canvas 
          shadows
          flat
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          dpr={[1, 1.5]}
          eventSource={document.getElementById('root')}
          eventPrefix="client"
        >
          <PerspectiveCamera makeDefault position={[0, 1.5, 4]} fov={50} />
          <ambientLight intensity={0.7} />
          <spotLight position={[5, 5, 5]} angle={0.15} penumbra={1} intensity={2} color="#ff0000" castShadow />
          <pointLight position={[-5, 5, -5]} intensity={1} color="#00ffff" />
          
          <Suspense fallback={null}>
            <GrannyModel position={[0, -1, 0]} scale={1.5} />
            <Preload all />
          </Suspense>
          
          <ContactShadows opacity={0.6} scale={10} blur={2.5} far={4.5} color="#000000" />
        </Canvas>
      </div>

      {/* Menu Options Section */}
      <div className="w-full md:w-1/2 h-1/2 md:h-full flex flex-col justify-center bg-zinc-950/80 backdrop-blur-xl border-l border-white/5 relative">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <span className="text-[120px] font-black italic tracking-tighter leading-none select-none">BOX</span>
        </div>
        
        <div className="py-8 z-10">
          {menuOptions.map((option) => (
            <MenuItem
              key={option.label}
              label={option.label}
              onHover={() => playSound('SELECT')}
              onClick={() => {
                playSound('START');
                setTimeout(() => navigate(option.path), 200);
              }}
            />
          ))}
        </div>
        
        <div className="mt-auto p-12 border-t border-white/5 flex justify-between items-center z-10">
          <button 
            onMouseEnter={() => playSound('SELECT')}
            onClick={() => navigate('/')}
            className="text-white/20 hover:text-red-500 transition-colors uppercase font-black tracking-[0.3em] text-xs group flex items-center gap-2"
          >
            <div className="w-4 h-[1px] bg-current" />
            Quit to Title
          </button>
          <span className="text-white/5 font-black text-xs tracking-widest">v0.3.0 ALPHA</span>
        </div>
      </div>
    </div>
  );
};

export default MainMenu;
