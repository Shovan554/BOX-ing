import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';

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

// Glitch effect for text
const GlitchText = ({ text, className, delay = 0 }) => {
  return (
    <motion.div
      className={`relative ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
    >
      {/* glitch layer 1 */}
      <motion.span
        className="absolute inset-0 text-red-500/30 select-none"
        animate={{ x: [0, -3, 2, 0], opacity: [0, 0.8, 0, 0] }}
        transition={{ duration: 0.15, repeat: Infinity, repeatDelay: 3 + delay, ease: "steps(1)" }}
        aria-hidden
      >
        {text}
      </motion.span>
      {/* glitch layer 2 */}
      <motion.span
        className="absolute inset-0 text-cyan-400/30 select-none"
        animate={{ x: [0, 3, -2, 0], opacity: [0, 0.8, 0, 0] }}
        transition={{ duration: 0.15, repeat: Infinity, repeatDelay: 4 + delay, delay: 0.05, ease: "steps(1)" }}
        aria-hidden
      >
        {text}
      </motion.span>
      <span className="relative">{text}</span>
    </motion.div>
  );
};

// Scanline overlay
const Scanlines = () => (
  <div
    className="pointer-events-none absolute inset-0 z-10"
    style={{
      background:
        "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)",
    }}
  />
);

// Animated grid / vignette backdrop
const Backdrop = () => (
  <>
    {/* radial vignette */}
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_30%,_black_100%)] z-0" />

    {/* grid lines */}
    <motion.div
      className="pointer-events-none absolute inset-0 z-0 opacity-[0.06]"
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }}
      animate={{ backgroundPosition: ["0px 0px", "0px 60px"] }}
      transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
    />

    {/* red accent line top */}
    <motion.div
      className="pointer-events-none absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-600 to-transparent z-0"
      animate={{ opacity: [0.4, 1, 0.4] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
    />
    {/* red accent line bottom */}
    <motion.div
      className="pointer-events-none absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-600 to-transparent z-0"
      animate={{ opacity: [0.4, 1, 0.4] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1 }}
    />
  </>
);

// Corner brackets
const CornerBrackets = () => (
  <>
    {[
      "top-4 left-4 border-t-2 border-l-2",
      "top-4 right-4 border-t-2 border-r-2",
      "bottom-4 left-4 border-b-2 border-l-2",
      "bottom-4 right-4 border-b-2 border-r-2",
    ].map((cls, i) => (
      <motion.div
        key={i}
        className={`absolute w-8 h-8 border-white/20 ${cls}`}
        initial={{ opacity: 0, scale: 1.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.2 + i * 0.05 }}
      />
    ))}
  </>
);

// Progress bar (one continuous bar across the whole intro)
const ProgressBar = ({ totalDuration }) => (
  <motion.div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-64 z-20">
    <div className="h-[2px] w-full bg-white/10 rounded-full overflow-hidden">
      <motion.div
        className="h-full bg-gradient-to-r from-red-600 via-red-400 to-red-600 rounded-full"
        initial={{ width: "0%" }}
        animate={{ width: "100%" }}
        transition={{ duration: totalDuration, ease: "linear" }}
      />
    </div>
  </motion.div>
);

const SLIDE_DURATION = 5000; // ms per slide
const EXIT_DELAY = 1000;     // ms after last slide before onFinish

const Intro = ({ onFinish }) => {
  const [index, setIndex] = useState(0);
  const [skipping, setSkipping] = useState(false);

  const totalDuration = (titles.length * SLIDE_DURATION + EXIT_DELAY) / 1000;

  const skip = useCallback(() => {
    if (skipping) return;
    setSkipping(true);
    setTimeout(onFinish, 400);
  }, [skipping, onFinish]);

  useEffect(() => {
    if (skipping) return;
    if (index < titles.length) {
      const t = setTimeout(() => setIndex(prev => prev + 1), SLIDE_DURATION);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(onFinish, EXIT_DELAY);
      return () => clearTimeout(t);
    }
  }, [index, onFinish, skipping]);

  // Keyboard shortcut — any key skips
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') skip();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [skip]);

  return (
    <AnimatePresence>
      {!skipping && (
        <motion.div
          key="intro-wrapper"
          className="fixed inset-0 bg-black flex items-center justify-center z-[200] overflow-hidden"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        >
          <Backdrop />
          <Scanlines />
          <CornerBrackets />

          {/* Slide content */}
          <div className="relative z-10 flex flex-col items-center justify-center text-center px-8 w-full">
            <AnimatePresence mode="wait">
              {index < titles.length && (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.96, filter: "blur(8px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 1.04, filter: "blur(8px)" }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                  className="flex flex-col items-center gap-4"
                >
                  {/* top divider */}
                  <motion.div
                    className="w-24 h-[1px] bg-gradient-to-r from-transparent via-red-500 to-transparent mb-2"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                  />

                  <GlitchText
                    text={titles[index].line1}
                    className="text-sm md:text-base font-light text-white/50 tracking-[0.5em] uppercase"
                    delay={0.1}
                  />
                  <GlitchText
                    text={titles[index].line2}
                    className="text-2xl md:text-4xl font-black text-white tracking-[0.3em] uppercase"
                    delay={0.25}
                  />
                  <GlitchText
                    text={titles[index].line3}
                    className="text-sm md:text-lg font-medium text-white/40 tracking-[0.45em] uppercase"
                    delay={0.4}
                  />

                  {/* bottom divider */}
                  <motion.div
                    className="w-24 h-[1px] bg-gradient-to-r from-transparent via-red-500 to-transparent mt-2"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Progress bar */}
          <ProgressBar totalDuration={totalDuration} />

          {/* Skip button */}
          <motion.button
            onClick={skip}
            className="absolute bottom-8 right-8 z-20 group flex items-center gap-2 text-white/30 hover:text-white/80 transition-colors duration-200"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.4 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <span className="text-xs tracking-[0.3em] uppercase font-light">Skip</span>
            {/* animated chevrons */}
            <span className="flex gap-[2px] overflow-hidden">
              {[0, 1, 2].map(i => (
                <motion.span
                  key={i}
                  className="text-xs leading-none"
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                >
                  ›
                </motion.span>
              ))}
            </span>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Intro;
