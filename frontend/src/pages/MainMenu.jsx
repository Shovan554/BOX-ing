import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSoundEffects } from '../hooks/useSoundEffects';

const MenuItem = ({ label, onClick, onHover, index }) => (
  <motion.button
    initial={{ x: -100, opacity: 0 }}
    animate={{ x: 0, opacity: 1 }}
    transition={{ delay: 0.1 * index, duration: 0.5, ease: "circOut" }}
    onClick={onClick}
    onMouseEnter={onHover}
    className="group w-full text-center px-12 py-6 text-6xl font-black italic tracking-tighter hover:bg-white hover:text-black transition-all duration-300 uppercase relative overflow-hidden"
  >
    <div className="absolute inset-0 bg-red-600 translate-x-[-101%] group-hover:translate-x-0 transition-transform duration-300 -z-10" />
    <span className="relative z-10 block transform group-hover:scale-110 transition-transform duration-300">
      {label}
    </span>
    {/* Animated underscore for active hover */}
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-0 h-1 bg-black group-hover:w-1/3 transition-all duration-300" />
  </motion.button>
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
    <div className="w-full h-full flex items-center justify-center overflow-hidden bg-[#0a0a0a] relative">
      {/* Dynamic Background Elements */}
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

      {/* Scanline Effect Overlay */}
      <div className="absolute inset-0 pointer-events-none z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.02),rgba(0,255,0,0.01),rgba(0,0,255,0.02))] bg-[length:100%_4px,3px_100%] opacity-20" />

      {/* Background Text Decor */}
      <div className="absolute inset-0 flex flex-col items-center justify-center opacity-[0.03] select-none pointer-events-none">
        <h1 className="text-[18vw] font-black italic tracking-tighter uppercase leading-[0.8] font-title text-center">
          SHADOW<br />BOXING
        </h1>
      </div>

      {/* Centered Menu Container */}
      <motion.div 
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "circOut" }}
        className="w-full max-w-4xl z-10 flex flex-col items-center"
      >
        <div className="mb-12 flex flex-col items-center">
          <motion.div 
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="w-24 h-1 bg-red-600 mb-4" 
          />
          <h2 className="text-sm font-black tracking-[0.8em] uppercase text-white/40 pl-[0.8em]">Main Menu</h2>
        </div>

        <div className="w-full flex flex-col space-y-2">
          {menuOptions.map((option, index) => (
            <MenuItem
              key={option.label}
              index={index}
              label={option.label}
              onHover={() => playSound('SELECT')}
              onClick={() => {
                playSound('START');
                setTimeout(() => navigate(option.path), 200);
              }}
            />
          ))}
        </div>

        <div className="mt-16 w-full flex justify-between items-center px-12 pt-8 border-t border-white/5">
          <button 
            onMouseEnter={() => playSound('SELECT')}
            onClick={() => navigate('/')}
            className="text-white/20 hover:text-red-500 transition-colors uppercase font-black tracking-[0.3em] text-xs group flex items-center gap-2"
          >
            <div className="w-4 h-[1px] bg-current" />
            Return to Title
          </button>
          <div className="flex flex-col items-end">
            <span className="text-white/5 font-black text-[10px] tracking-[0.4em]">SYSTEM v0.3.0 ALPHA</span>
            <span className="text-white/5 font-black text-[10px] tracking-[0.4em]">BUILD ID: 01032026</span>
          </div>
        </div>
      </motion.div>

      {/* Decorative Corner Accents */}
      <div className="absolute top-12 left-12 w-12 h-12 border-t border-l border-white/10" />
      <div className="absolute top-12 right-12 w-12 h-12 border-t border-r border-white/10" />
      <div className="absolute bottom-12 left-12 w-12 h-12 border-b border-l border-white/10" />
      <div className="absolute bottom-12 right-12 w-12 h-12 border-b border-r border-white/10" />
    </div>
  );
};

export default MainMenu;
