import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Lock, Trophy, Zap, Check, AlertCircle, Save } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { API_BASE_URL } from '../config/api';

const StatCard = ({ icon: Icon, label, value, accent }) => (
  <div className="flex flex-col items-center justify-center px-6 py-8 bg-white/[0.03] border border-white/10 rounded-2xl backdrop-blur-md relative overflow-hidden">
    <div className={`absolute -top-10 -right-10 w-32 h-32 ${accent} blur-3xl opacity-30 rounded-full`} />
    <Icon size={28} className="text-white/60 mb-3 relative z-10" />
    <span className="text-5xl font-black italic tracking-tighter text-white relative z-10">{value}</span>
    <span className="text-[9px] tracking-[0.3em] uppercase text-white/40 mt-2 font-black relative z-10">{label}</span>
  </div>
);

const Banner = ({ kind, message }) => {
  if (!message) return null;
  const styles =
    kind === 'success'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      : 'border-red-500/40 bg-red-500/10 text-red-300';
  const Icon = kind === 'success' ? Check : AlertCircle;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${styles} text-xs tracking-wider`}>
      <Icon size={16} />
      <span className="font-mono">{message}</span>
    </div>
  );
};

const Profile = () => {
  const navigate = useNavigate();
  const { playSound } = useSoundEffects();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState({ kind: '', text: '' });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState({ kind: '', text: '' });

  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  const loadProfile = useCallback(async () => {
    if (!token) {
      setLoadError('You must be logged in.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/auth/me/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) {
        localStorage.removeItem('access_token');
        navigate('/auth');
        return;
      }
      if (!r.ok) throw new Error(`Status ${r.status}`);
      const data = await r.json();
      setProfile(data);
      setDisplayName(data.display_name || '');
      setLoadError('');
    } catch (e) {
      setLoadError('Failed to load profile.');
    } finally {
      setLoading(false);
    }
  }, [token, navigate]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSaveName = async (e) => {
    e.preventDefault();
    setNameMsg({ kind: '', text: '' });
    const trimmed = displayName.trim();
    if (!trimmed) {
      setNameMsg({ kind: 'error', text: 'Username cannot be empty.' });
      return;
    }
    if (trimmed.length > 40) {
      setNameMsg({ kind: 'error', text: 'Max 40 characters.' });
      return;
    }
    if (trimmed === profile?.display_name) {
      setNameMsg({ kind: 'error', text: 'Username unchanged.' });
      return;
    }
    setSavingName(true);
    try {
      const r = await fetch(`${API_BASE_URL}/auth/me/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ display_name: trimmed }),
      });
      if (!r.ok) {
        let detail = `Error ${r.status}`;
        try {
          const j = await r.json();
          detail = j.detail || detail;
        } catch { /* ignore */ }
        setNameMsg({ kind: 'error', text: String(detail) });
      } else {
        const updated = await r.json();
        setProfile((p) => ({ ...p, display_name: updated.display_name }));
        setNameMsg({ kind: 'success', text: 'Username updated.' });
        playSound('START');
      }
    } catch {
      setNameMsg({ kind: 'error', text: 'Network error.' });
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMsg({ kind: '', text: '' });
    if (!currentPassword || !newPassword) {
      setPasswordMsg({ kind: 'error', text: 'Fill in both password fields.' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ kind: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ kind: 'error', text: 'New passwords do not match.' });
      return;
    }
    setSavingPassword(true);
    try {
      const r = await fetch(`${API_BASE_URL}/auth/me/password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      if (!r.ok) {
        let detail = `Error ${r.status}`;
        try {
          const j = await r.json();
          detail = j.detail || detail;
        } catch { /* ignore */ }
        setPasswordMsg({ kind: 'error', text: String(detail) });
      } else {
        setPasswordMsg({ kind: 'success', text: 'Password updated.' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        playSound('START');
      }
    } catch {
      setPasswordMsg({ kind: 'error', text: 'Network error.' });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-full relative bg-[#0a0a0a] overflow-y-auto p-8 pt-24 font-mono">
      {/* Background blobs (matches MainMenu/Leaderboard) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.25, 0.15] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-red-600/20 blur-[150px] rounded-full"
        />
        <motion.div
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-600/15 blur-[150px] rounded-full"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-red-950/5 to-black/80" />
      </div>

      <div className="absolute inset-0 pointer-events-none z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.02),rgba(0,255,0,0.01),rgba(0,0,255,0.02))] bg-[length:100%_4px,3px_100%] opacity-20" />

      <div className="absolute inset-0 flex flex-col items-center justify-center opacity-[0.03] select-none pointer-events-none">
        <h1 className="text-[18vw] font-black italic tracking-tighter uppercase leading-[0.8] font-title text-center">
          SHADOW<br />BOXING
        </h1>
      </div>

      <Link
        to="/menu"
        onMouseEnter={() => playSound('SELECT')}
        className="fixed top-12 left-24 flex items-center gap-2 text-white/40 hover:text-white transition-all bg-white/5 px-4 py-2 rounded-lg border border-white/5 backdrop-blur-md z-[60] group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        <span className="font-black tracking-[0.3em] text-[10px] uppercase">Back to Menu</span>
      </Link>

      <div className="z-10 w-full max-w-3xl flex flex-col items-center">
        <div className="mb-12 flex flex-col items-center text-center">
          <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} className="w-24 h-1 bg-red-600 mb-8" />
          <h1 className="text-[7vw] font-black italic tracking-tighter text-white uppercase leading-none whitespace-nowrap mb-4 drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">
            COMBATANT <span className="text-red-600">PROFILE</span>
          </h1>
          <div className="text-white/20 font-black text-[10px] tracking-[0.8em] uppercase">
            Identity • Credentials • Record
          </div>
        </div>

        {loading ? (
          <div className="p-20 text-center text-white/40 animate-pulse font-black tracking-widest uppercase text-xs">
            Loading combatant data...
          </div>
        ) : loadError ? (
          <Banner kind="error" message={loadError} />
        ) : (
          <div className="w-full flex flex-col gap-8">
            {/* Identity card */}
            <section className="p-8 bg-black/40 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl">
              <div className="flex items-center gap-3 mb-6">
                <User size={18} className="text-red-500" />
                <h2 className="text-sm font-black tracking-[0.4em] uppercase text-white/70">Identity</h2>
              </div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/30 mb-1">Email</p>
              <p className="text-base font-mono text-white/90 mb-6 break-all">{profile?.email}</p>

              <form onSubmit={handleSaveName} className="flex flex-col gap-3">
                <p className="text-[10px] uppercase tracking-[0.3em] text-white/30">Username</p>
                <div className="flex gap-3 flex-col sm:flex-row">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={40}
                    placeholder="Your handle"
                    className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/60 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={savingName}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white font-black italic tracking-wider text-sm uppercase rounded-lg hover:bg-white hover:text-black transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save size={16} />
                    {savingName ? 'Saving...' : 'Save'}
                  </button>
                </div>
                <Banner kind={nameMsg.kind} message={nameMsg.text} />
              </form>
            </section>

            {/* Stats */}
            <section className="p-8 bg-black/40 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl">
              <div className="flex items-center gap-3 mb-6">
                <Trophy size={18} className="text-yellow-500" />
                <h2 className="text-sm font-black tracking-[0.4em] uppercase text-white/70">Combat Record</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StatCard
                  icon={Trophy}
                  label="Multiplayer Wins"
                  value={profile?.stats?.multiplayer_wins ?? 0}
                  accent="bg-yellow-500"
                />
                <StatCard
                  icon={Zap}
                  label="Best Points"
                  value={profile?.stats?.best_points ?? 0}
                  accent="bg-red-600"
                />
              </div>
            </section>

            {/* Password */}
            <section className="p-8 bg-black/40 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl">
              <div className="flex items-center gap-3 mb-6">
                <Lock size={18} className="text-cyan-400" />
                <h2 className="text-sm font-black tracking-[0.4em] uppercase text-white/70">Change Password</h2>
              </div>
              <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/30 block mb-2">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500/60 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/30 block mb-2">
                    New Password (min 8)
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500/60 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/30 block mb-2">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500/60 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="self-end flex items-center gap-2 px-6 py-3 bg-cyan-600 text-white font-black italic tracking-wider text-sm uppercase rounded-lg hover:bg-white hover:text-black transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Lock size={16} />
                  {savingPassword ? 'Updating...' : 'Update Password'}
                </button>
                <Banner kind={passwordMsg.kind} message={passwordMsg.text} />
              </form>
            </section>
          </div>
        )}

        <div className="mt-16 text-white/5 font-black text-[10px] tracking-[1em] uppercase">
          Secure Channel • End-to-End Encrypted
        </div>
      </div>
    </div>
  );
};

export default Profile;
