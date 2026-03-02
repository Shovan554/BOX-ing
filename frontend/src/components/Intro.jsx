import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const titles = [
  {
    line1: "A CALDWELL STUDIO PRODUCTION",
    line2: "IN COLLABORATION WITH",
    line3: "SHADOW LABS INTERACTIVE"
  },
  {
    line1: "POWERED BY THREE.JS",
    line2: "MOTION RECOGNITION ENGINE v1.0",
    line3: "REAL-TIME COMBAT DETECTION"
  }
];

const Intro = ({ onFinish }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index < titles.length) {
      const timer = setTimeout(() => {
        setIndex(prev => prev + 1);
      }, 5000); // 5 seconds per title
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        onFinish();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [index, onFinish]);

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-[200]">
      <AnimatePresence mode="wait">
        {index < titles.length && (
          <motion.div
            key={index}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2, ease: "easeInOut" }}
            className="flex flex-col items-center justify-center space-y-4 px-8 text-center"
          >
            <h1 className="text-xl md:text-2xl font-light text-white/60 tracking-[0.5em] uppercase">
              {titles[index].line1}
            </h1>
            <h2 className="text-2xl md:text-4xl font-black text-white tracking-[0.3em] uppercase">
              {titles[index].line2}
            </h2>
            <h3 className="text-lg md:text-xl font-medium text-white/40 tracking-[0.4em] uppercase">
              {titles[index].line3}
            </h3>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Intro;
