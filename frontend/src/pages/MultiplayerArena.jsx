import React, { Suspense, useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Preload, Environment } from '@react-three/drei';
import * as THREE from 'three';
import NinjaModel from '../components/NinjaModel';
import HealthBar from '../components/HealthBar';
import MatchEndOverlay from '../components/MatchEndOverlay';
import { usePoseDetection } from '../hooks/usePoseDetection';
import { detectLocalMotion, DEFAULT_BOXING_THRESHOLDS } from '../utils/boxingLocalDetect';
import { API_BASE_URL, WS_BASE_URL } from '../config/api';

const MAX_HP = 100;
const DAMAGE_PER_HIT = 10;
/** If we were in block any time in this window (ms) before a remote hit, the hit is absorbed. */
const BLOCK_ABSORB_WINDOW_MS = 320;
/** Ignore local hit gestures briefly right after a guard to avoid block->hit flicker damage. */
const BLOCK_TO_HIT_GRACE_MS = 240;
/** Min gap between applying damage from remote hits (anti double-tap / lag dupes). */
const MIN_REMOTE_HIT_DAMAGE_MS = 180;
/** Throttle opponent ninja animation only (not damage). */
const REMOTE_ANIM_COOLDOWN_MS = 380;

function wasBlockingInWindow(history, nowPerf, windowMs) {
  const cut = nowPerf - windowMs;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const e = history[i];
    if (e.perf < cut) break;
    if (e.motion === 'block') return true;
  }
  return false;
}

/**
 * Fighting stance from PovTest / arena layout:
 * - Opponent (left / back-left in world): red, faces toward player.
 * - You (right / forward-right): cyan, faces toward opponent.
 */
const OPPONENT_POS = [-0.8, -1, -0.8];
const OPPONENT_ROT = [0, Math.PI / 4, 0];
const PLAYER_POS = [0.8, -1, 0.8];
const PLAYER_ROT = [0, -Math.PI * 0.75, 0];
const FIGHTER_SCALE = 1.8;

const OPPONENT_COLOR = '#ff0000';
const PLAYER_COLOR = '#00ffff';

/** Camera behind local player, shifted left + slightly toward opponent so the rival stays in frame. */
function ArenaCamera() {
  const { camera } = useThree();
  const me = useMemo(() => new THREE.Vector3(...PLAYER_POS), []);
  const opp = useMemo(() => new THREE.Vector3(...OPPONENT_POS), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame(() => {
    const towardOpp = opp.clone().sub(me).normalize();
    const camPos = me.clone().sub(towardOpp.clone().multiplyScalar(4.6));
    camPos.y += 2.55;
    const left = new THREE.Vector3().crossVectors(up, towardOpp).normalize();
    camPos.add(left.multiplyScalar(0.75));
    camPos.add(towardOpp.clone().multiplyScalar(0.28));
    camPos.y += 0.08;
    camera.position.copy(camPos);
    camera.lookAt(opp.x, 0.22, opp.z);
  });
  return null;
}

const MultiplayerArena = () => {
  const location = useLocation();
  const videoRef = useRef(null);
  const opponentRef = useRef(null);
  const playerRef = useRef(null);
  const wsRef = useRef(null);
  const lastMotionRef = useRef('idle');
  const lastLocalAnimRef = useRef(0);
  const lastSendRef = useRef(0);
  const remoteAnimCooldownUntilRef = useRef(0);
  const lastRemoteHitDamageAtRef = useRef(0);
  const lastBlockAtRef = useRef(0);
  const gestureSeqRef = useRef(0);
  const localMotionRef = useRef('idle');
  const poseHistoryRef = useRef([]);
  const matchEndedRef = useRef(false);
  const localDetectorRefs = {
    leftWristHist: useRef([]),
    rightWristHist: useRef([]),
    leftExtendHist: useRef([]),
    rightExtendHist: useRef([]),
    blockFrames: useRef(0),
  };

  const state = location.state ?? {};
  const roomCode = state.roomCode || state.room_code || '';
  const sessionId = state.sessionId || state.session_id || '';
  const playerName = state.playerName || state.player_name || 'You';
  const opponentName = state.opponentName || state.opponent_name || 'Opponent';

  const [roomReady, setRoomReady] = useState(false);
  const [opponentSessionId, setOpponentSessionId] = useState(null);
  const [roomConnected, setRoomConnected] = useState(false);
  const [camReady, setCamReady] = useState(false);
  const [localMotion, setLocalMotion] = useState('idle');

  const [myHp, setMyHp] = useState(MAX_HP);
  const [opponentHp, setOpponentHp] = useState(MAX_HP);
  const [gameResult, setGameResult] = useState(null); // null | 'win' | 'lose'
  const [winSaveStatus, setWinSaveStatus] = useState('idle');
  const [winErrorMsg, setWinErrorMsg] = useState('');

  const thresholds = useMemo(() => ({ ...DEFAULT_BOXING_THRESHOLDS }), []);
  const poseData = usePoseDetection(videoRef);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' } })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setCamReady(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!roomCode) {
      setRoomReady(true);
      return;
    }
    fetch(`${API_BASE_URL}/room/${roomCode}`)
      .then((r) => r.json())
      .then((room) => {
        const users = room.users || [];
        const opp = users.find((u) => u.session_id !== sessionId);
        setOpponentSessionId(opp?.session_id ?? null);
        setRoomReady(true);
      })
      .catch(() => setRoomReady(true));
  }, [roomCode, sessionId]);

  const handleRoomMessage = useCallback(
    (raw) => {
      let d;
      try {
        d = JSON.parse(raw.data);
      } catch {
        return;
      }
      if (d.type === 'disconnect') return;
      if (d.session_id === sessionId) return;

      if (d.type === 'health' && typeof d.hp === 'number') {
        setOpponentHp(Math.min(MAX_HP, Math.max(0, d.hp)));
        return;
      }

      if (d.type === 'hit_absorbed' && d.absorbed === 'block') {
        // Attacker: punch was blocked on the other side (optional feedback).
        return;
      }

      if (d.type !== 'gesture' || d.motion == null) return;
      if (matchEndedRef.current) return;

      const now = performance.now();

      const isHit = d.motion === 'left_hit' || d.motion === 'right_hit';
      if (isHit) {
        const blocking =
          localMotionRef.current === 'block' ||
          wasBlockingInWindow(poseHistoryRef.current, now, BLOCK_ABSORB_WINDOW_MS);
        if (blocking) {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'hit_absorbed',
                absorbed: 'block',
                attackTs: d.ts ?? null,
                attackPerf: d.perf ?? null,
                attackSeq: d.seq ?? null,
              })
            );
          }
        } else if (now - lastRemoteHitDamageAtRef.current >= MIN_REMOTE_HIT_DAMAGE_MS) {
          lastRemoteHitDamageAtRef.current = now;
          setMyHp((prev) => {
            const n = Math.max(0, prev - DAMAGE_PER_HIT);
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'health', hp: n }));
            }
            return n;
          });
        }
      }

      if (opponentRef.current && d.motion !== 'idle') {
        if (now >= remoteAnimCooldownUntilRef.current) {
          opponentRef.current.playAction(d.motion);
          remoteAnimCooldownUntilRef.current = now + REMOTE_ANIM_COOLDOWN_MS;
        }
      }
    },
    [sessionId]
  );

  useEffect(() => {
    if (!roomReady || !roomCode || !sessionId) return;

    const connect = () => {
      const ws = new WebSocket(`${WS_BASE_URL}/ws/${roomCode}/${sessionId}`);
      ws.onopen = () => {
        setRoomConnected(true);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'health', hp: MAX_HP }));
        }
      };
      ws.onclose = () => {
        setRoomConnected(false);
        setTimeout(connect, 2000);
      };
      ws.onmessage = handleRoomMessage;
      wsRef.current = ws;
    };
    connect();
    return () => wsRef.current?.close();
  }, [roomReady, roomCode, sessionId, handleRoomMessage]);

  useEffect(() => {
    if (gameResult) return;
    if (myHp <= 0) {
      setGameResult('lose');
      matchEndedRef.current = true;
    } else if (opponentHp <= 0) {
      setGameResult('win');
      matchEndedRef.current = true;
    }
  }, [myHp, opponentHp, gameResult]);

  useEffect(() => {
    matchEndedRef.current = !!gameResult;
  }, [gameResult]);

  useEffect(() => {
    if (gameResult === 'win') {
      opponentRef.current?.playAction('defeat');
    } else if (gameResult === 'lose') {
      playerRef.current?.playAction('defeat');
    }
  }, [gameResult]);

  useEffect(() => {
    if (gameResult !== 'win') return;
    const key = `box_mp_win_saved_${roomCode}_${sessionId}`;
    if (sessionStorage.getItem(key) === '1') {
      setWinSaveStatus('saved');
      return;
    }

    const token = localStorage.getItem('access_token');
    if (!token) {
      setWinSaveStatus('error');
      setWinErrorMsg('Log in to save wins to the leaderboard.');
      return;
    }

    setWinSaveStatus('loading');
    let cancelled = false;

    fetch(`${API_BASE_URL}/multiplayer/record-win`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (cancelled) return;
        if (r.ok) {
          sessionStorage.setItem(key, '1');
          setWinSaveStatus('saved');
        } else {
          let detail = `Error ${r.status}`;
          try {
            const j = await r.json();
            detail = j.detail || detail;
          } catch {
            /* ignore */
          }
          setWinSaveStatus('error');
          setWinErrorMsg(String(detail));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWinSaveStatus('error');
          setWinErrorMsg('Network error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [gameResult, roomCode, sessionId]);

  useEffect(() => {
    if (gameResult) return;
    if (!poseData?.points) {
      setLocalMotion('idle');
      return;
    }
    const detected = detectLocalMotion(poseData.points, thresholds, localDetectorRefs);
    const now = performance.now();
    if (detected === 'block') {
      lastBlockAtRef.current = now;
    }

    const isDetectedHit = detected === 'left_hit' || detected === 'right_hit';
    const withinPostBlockGrace = now - lastBlockAtRef.current < BLOCK_TO_HIT_GRACE_MS;
    const next = isDetectedHit && withinPostBlockGrace ? 'block' : detected;

    localMotionRef.current = next;
    poseHistoryRef.current.push({ perf: now, motion: next });
    const pruneBefore = now - 600;
    while (poseHistoryRef.current.length && poseHistoryRef.current[0].perf < pruneBefore) {
      poseHistoryRef.current.shift();
    }

    setLocalMotion(next);

    const changed = next !== lastMotionRef.current;
    lastMotionRef.current = next;

    if (playerRef.current && next !== 'idle' && changed && now >= lastLocalAnimRef.current) {
      playerRef.current.playAction(next);
      lastLocalAnimRef.current = now + 450;
    }

    if (
      next !== 'idle' &&
      changed &&
      wsRef.current?.readyState === WebSocket.OPEN &&
      now - lastSendRef.current > 380
    ) {
      lastSendRef.current = now;
      gestureSeqRef.current += 1;
      wsRef.current.send(
        JSON.stringify({
          type: 'gesture',
          motion: next,
          ts: Date.now(),
          perf: now,
          seq: gestureSeqRef.current,
        })
      );
    }
  }, [poseData, thresholds, gameResult]);

  const labels = useMemo(
    () => [
      { name: opponentName, sub: 'Opponent', x: '22%' },
      { name: `${playerName} (YOU)`, sub: 'Your fighter', x: '78%' },
    ],
    [playerName, opponentName]
  );

  return (
    <div className="w-full h-screen bg-[#050505] text-white relative overflow-hidden">
      {gameResult && (
        <MatchEndOverlay
          result={gameResult}
          playerName={playerName}
          opponentName={opponentName}
          winStatus={gameResult === 'win' ? winSaveStatus : null}
          winErrorMsg={winErrorMsg}
        />
      )}

      <div className="absolute top-4 left-4 z-20 flex flex-col gap-1">
        <Link to="/menu" className="text-white/60 hover:text-white text-xs tracking-[0.2em]">
          BACK TO MENU
        </Link>
        {roomCode && (
          <span className="text-[10px] text-white/35 tracking-widest font-mono">ROOM {roomCode}</span>
        )}
      </div>

      <div className="absolute top-4 right-4 z-20 text-right">
        <span
          className={`text-[10px] tracking-[0.25em] ${roomConnected ? 'text-emerald-400' : 'text-amber-500'}`}
        >
          {roomConnected ? '● SYNC LIVE' : '● CONNECTING…'}
        </span>
        {opponentSessionId && (
          <p className="text-[9px] text-white/25 mt-1 font-mono truncate max-w-[180px]">
            vs session …{opponentSessionId.slice(-6)}
          </p>
        )}
      </div>

      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 w-[min(96%,720px)] px-4 flex flex-col sm:flex-row justify-between gap-4 pointer-events-none">
        <HealthBar hp={opponentHp} maxHp={MAX_HP} name={opponentName} isOpponent />
        <HealthBar hp={myHp} maxHp={MAX_HP} name={playerName} isOpponent={false} />
      </div>

      {labels.map((item) => (
        <div
          key={`${item.name}-${item.sub}`}
          className="absolute top-36 md:top-32 -translate-x-1/2 z-20 text-center pointer-events-none"
          style={{ left: item.x }}
        >
          <div className="px-4 py-2 rounded-full border border-white/20 bg-black/50 backdrop-blur-sm">
            <span className="text-sm md:text-base font-black italic tracking-wide uppercase block">{item.name}</span>
            <span className="text-[9px] text-white/40 tracking-[0.2em]">{item.sub}</span>
          </div>
        </div>
      ))}

      <div className="absolute bottom-6 left-6 z-30 w-[min(280px,38vw)] aspect-video rounded-lg overflow-hidden border border-white/15 shadow-[0_0_30px_rgba(0,0,0,0.6)] bg-zinc-900">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
        <div className="absolute bottom-1 left-2 text-[9px] tracking-widest text-white/50">
          {camReady ? 'YOUR CAMERA' : 'CAMERA…'}
        </div>
        <div className="absolute top-1 right-2 text-[9px] font-mono text-emerald-400/90">{localMotion}</div>
      </div>

      <Canvas
        shadows
        camera={{ fov: 45, near: 0.1, far: 100 }}
        gl={{ antialias: true }}
        dpr={[1, 1.5]}
        className={`w-full h-full ${gameResult ? 'pointer-events-none' : ''}`}
      >
        <ArenaCamera />
        <ambientLight intensity={0.55} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={2} color="#ff3333" castShadow />
        <pointLight position={[-10, 10, -10]} intensity={1} color="#0066ff" />
        <directionalLight position={[0, 8, 4]} intensity={0.6} />

        <Suspense fallback={null}>
          <group position={OPPONENT_POS}>
            <NinjaModel ref={opponentRef} scale={FIGHTER_SCALE} rotation={OPPONENT_ROT} color={OPPONENT_COLOR} />
          </group>
          <group position={PLAYER_POS}>
            <NinjaModel ref={playerRef} scale={FIGHTER_SCALE} rotation={PLAYER_ROT} color={PLAYER_COLOR} />
          </group>

          <Environment preset="night" />
          <Preload all />
        </Suspense>

        <gridHelper args={[20, 20, 0x333333, 0x111111]} position={[0, -1.01, 0]} />
        <ContactShadows opacity={0.4} scale={20} blur={2.4} far={4.5} position={[0, -1.01, 0]} />
      </Canvas>
    </div>
  );
};

export default MultiplayerArena;
