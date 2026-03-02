import React, { useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, Float, PerspectiveCamera, Preload } from '@react-three/drei';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSoundEffects } from '../hooks/useSoundEffects';
import * as THREE from 'three';

const LandingPage = () => {
  const navigate = useNavigate();
  const { playSound } = useSoundEffects();

  const handleStart = () => {
    playSound('START');
    setTimeout(() => navigate('/menu'), 300);
  };

  return (
    <div className="w-full h-full relative overflow-hidden">
      {/* Animated Overlay for atmosphere */}
      <div className="absolute inset-0 z-[1] bg-gradient-to-t from-red-900/20 to-transparent pointer-events-none" />
      
      <div className="absolute inset-0 z-0 opacity-100">
        <Canvas 
          shadows 
          flat
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          dpr={[1, 1.5]}
          eventSource={document.getElementById('root')}
          eventPrefix="client"
        >
          <PerspectiveCamera makeDefault position={[0, 0, 5]} />
          <ambientLight intensity={0.5} />
          <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={2} color="#ff0000" castShadow />
          <pointLight position={[-10, -10, -10]} intensity={0.5} color="#00ffff" />
          
          <Suspense fallback={null}>
            <Preload all />
          </Suspense>
        </Canvas>
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, ease: "circOut" }}
          className="relative px-12 py-8 mt-32 mb-auto group text-center"
        >
          <h1 
            className="text-[12rem] md:text-[16rem] font-black tracking-[-0.05em] text-white font-title uppercase leading-[0.8] mix-blend-difference"
          >
            SHADOW<br /><span className="text-[16rem] md:text-[22rem]">BOXING</span>
          </h1>

          {/* Subtitle/Version text for extra tech feel */}
          <div className="mt-4 flex items-center justify-center gap-4">
            <div className="h-[1px] w-12 bg-white/40" />
            <span className="text-[10px] font-mono tracking-[0.5em] text-white/40 uppercase">Combat System v1.0.4</span>
            <div className="h-[1px] w-12 bg-white/40" />
          </div>
        </motion.div>

        <div className="pb-32">
          <motion.button
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.8, duration: 1, ease: "circOut" }}
            onMouseEnter={() => playSound('SELECT')}
            onClick={handleStart}
            className="group relative px-16 py-5 overflow-hidden"
          >
            <div className="absolute inset-0 bg-white group-hover:bg-red-600 transition-colors duration-300" />
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-[radial-gradient(circle,rgba(255,255,255,0.8)_0%,transparent_70%)]" />
            
            <span className="relative z-10 text-black group-hover:text-white text-2xl font-black italic tracking-[0.3em] uppercase transition-colors duration-300">
              Start Game
            </span>
            
            {/* Corner Accents */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-black group-hover:border-white transition-colors" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-black group-hover:border-white transition-colors" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-black group-hover:border-white transition-colors" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-black group-hover:border-white transition-colors" />
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
