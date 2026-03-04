import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { useSoundEffects } from '../hooks/useSoundEffects';

const API_BASE_URL = `http://${window.location.hostname}:8000`;

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    display_name: ''
  });
  
  const navigate = useNavigate();
  const { playSound } = useSoundEffects();

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    playSound('SELECT');

    const endpoint = isLogin ? '/auth/login' : '/auth/signup';
    const payload = isLogin 
      ? { email: formData.email, password: formData.password }
      : { email: formData.email, password: formData.password, display_name: formData.display_name };

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Authentication failed');
      }

      localStorage.setItem('access_token', data.access_token);
      playSound('START');
      navigate('/');
    } catch (err) {
      setError(err.message);
      console.error('Auth error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-[#0a0a0a]">
      {/* Background Elements - Matching MainMenu style */}
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

      {/* Scanline Effect Overlay (Consistency) */}
      <div className="absolute inset-0 pointer-events-none z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.02),rgba(0,255,0,0.01),rgba(0,0,255,0.02))] bg-[length:100%_4px,3px_100%] opacity-20" />

      {/* Background Text Decor */}
      <div className="absolute inset-0 flex flex-col items-center justify-center opacity-[0.03] select-none pointer-events-none">
        <h1 className="text-[18vw] font-black italic tracking-tighter uppercase leading-[0.8] font-title text-center">
          SHADOW<br />BOXING
        </h1>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md z-10"
      >
        <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl relative">
          <div className="text-center mb-8">
            <h1 className="text-6xl md:text-7xl font-black italic tracking-tighter text-white mb-2 uppercase font-title text-outline leading-[0.7]">
              SHADOW
            </h1>
            <h1 className="text-8xl md:text-9xl font-black italic tracking-tighter text-red-600 mb-6 uppercase font-title text-outline leading-[0.7]">
              BOXING
            </h1>
            <p className="text-white/40 text-[10px] font-black tracking-[0.5em] uppercase">
              {isLogin ? 'Authentication Required' : 'Initialize Fighter Profile'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                >
                  <label className="text-[10px] font-black text-white/40 uppercase ml-1 tracking-widest">Display Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input
                      type="text"
                      name="display_name"
                      required={!isLogin}
                      value={formData.display_name}
                      onChange={handleInputChange}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder:text-white/10 focus:outline-none focus:ring-1 focus:ring-red-600 transition-all font-mono text-sm"
                      placeholder="FIGHTER_ID"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase ml-1 tracking-widest">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder:text-white/10 focus:outline-none focus:ring-1 focus:ring-red-600 transition-all font-mono text-sm"
                  placeholder="COMM_LINK"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase ml-1 tracking-widest">Access Key</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="password"
                  name="password"
                  required
                  value={formData.password}
                  onChange={handleInputChange}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder:text-white/10 focus:outline-none focus:ring-1 focus:ring-red-600 transition-all font-mono text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 text-red-500 bg-red-500/10 p-3 rounded-xl border border-red-500/20"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-sm font-medium">{error}</span>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white hover:bg-red-600 text-black hover:text-white font-black italic tracking-[0.2em] uppercase py-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-[0_0_20px_rgba(255,255,255,0.05)]"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span className="text-sm">{isLogin ? 'Sign In' : 'Create Account'}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                playSound('SELECT');
              }}
              className="text-white/20 hover:text-red-500 text-[10px] font-black uppercase tracking-[0.3em] transition-colors"
            >
              {isLogin ? "// REQUEST_NEW_ACCESS" : "// RETURN_TO_LOGIN"}
            </button>
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

export default AuthPage;
