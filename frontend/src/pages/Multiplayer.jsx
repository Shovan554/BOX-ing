import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Multiplayer = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full relative">
      <Link to="/menu" className="absolute top-8 left-8 flex items-center gap-2 text-white/60 hover:text-white transition-colors">
        <ArrowLeft size={24} />
        <span>Back to Menu</span>
      </Link>
      <h1 className="text-6xl font-black italic tracking-tighter text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">
        MULTIPLAYER
      </h1>
      <p className="mt-4 text-white/40">Feature coming soon...</p>
    </div>
  );
};

export default Multiplayer;
