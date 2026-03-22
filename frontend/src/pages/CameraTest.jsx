import React, { useRef, useEffect, useState, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera, ContactShadows, Preload } from '@react-three/drei';
import NinjaModel from '../components/NinjaModel';
import { usePoseDetection } from '../hooks/usePoseDetection';
import { useHandDetection } from '../hooks/useHandDetection';
import { analyzeLocalPose, DEFAULT_BOXING_THRESHOLDS } from '../utils/boxingLocalDetect';
import { API_BASE_URL, WS_BASE_URL } from '../config/api';

// Pose skeleton connections to draw
const POSE_CONNECTIONS = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],
  [23,25],[24,26],[25,27],[26,28],
];

// Hand connections
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17],
];

const MOTION_KEYS = ['idle', 'right_hit', 'left_hit', 'block'];

/** Fixed defaults for camera test (no live calibration UI). */
const CAMERA_TEST_THRESHOLDS = {
  ...DEFAULT_BOXING_THRESHOLDS,
  fistThreshold: 3,
};

const getLabel = (value) => {
  if (!value) return 'Unknown';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
};

const getHandState = (hand, fistThreshold = 3) => {
  if (!hand || hand.length < 21) return 'unknown';
  const fingerPairs = [[8, 6], [12, 10], [16, 14], [20, 18]];
  let curled = 0;
  fingerPairs.forEach(([tip, pip]) => {
    if (hand[tip]?.y > hand[pip]?.y) curled += 1;
  });
  if (curled >= fistThreshold) return 'clenched';
  if (curled <= 1) return 'opened';
  return 'partial';
};

const CameraTest = () => {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const ninjaRef    = useRef(null);
  const wsRef       = useRef(null);
  const lockRef     = useRef(false);   // animation input lock

  const poseData = usePoseDetection(videoRef);
  const handData = useHandDetection(videoRef);

  const [ready,      setReady]      = useState(false);   // camera ready
  const [connected,  setConnected]  = useState(false);   // WS connected
  const [sessionId,  setSessionId]  = useState(null);
  const [log,        setLog]        = useState([]);       // action log entries
  const [lastAction, setLastAction] = useState(null);    // { action, side, ts }
  const [motionState, setMotionState] = useState('idle');
  const [leftHandState, setLeftHandState] = useState('unknown');
  const [rightHandState, setRightHandState] = useState('unknown');
  const [poseDebugJson, setPoseDebugJson] = useState('');
  const [poseDebugCopied, setPoseDebugCopied] = useState(false);
  const copyPoseDebugTimerRef = useRef(null);
  const localDetectorRefs = {
    leftWristHist: useRef([]),
    rightWristHist: useRef([]),
    leftExtendHist: useRef([]),
    rightExtendHist: useRef([]),
    blockFrames: useRef(0),
  };
  const localAnimCooldownRef = useRef(0);
  const lastLocalMotionRef = useRef('idle');
  const lastLocalLogRef = useRef(0);

  const copyPoseDebugJson = () => {
    const text = poseDebugJson?.trim();
    if (!text || text === '…') return;
    navigator.clipboard.writeText(text).then(() => {
      setPoseDebugCopied(true);
      if (copyPoseDebugTimerRef.current) clearTimeout(copyPoseDebugTimerRef.current);
      copyPoseDebugTimerRef.current = setTimeout(() => setPoseDebugCopied(false), 2000);
    }).catch(() => {});
  };

  useEffect(() => () => {
    if (copyPoseDebugTimerRef.current) clearTimeout(copyPoseDebugTimerRef.current);
  }, []);

  // Camera setup
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { width:1280, height:720, facingMode:'user' } })
      .then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setReady(true);
        }
      });
  }, []);

  // Session init
  useEffect(() => {
    fetch(`${API_BASE_URL}/session/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(localStorage.getItem('access_token')
          ? { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
          : {}),
      },
    })
    .then(r => r.json())
    .then(d => setSessionId(d.id ?? d.session_id));
  }, []);

  // WebSocket
  useEffect(() => {
    if (!sessionId) return;

    const connect = () => {
      const ws = new WebSocket(`${WS_BASE_URL}/ws/detect/${sessionId}`);

      ws.onopen  = () => setConnected(true);
      ws.onclose = () => { setConnected(false); setTimeout(connect, 2000); };

      ws.onmessage = (e) => {
        const d = JSON.parse(e.data);
        if (!d.action || d.action === 'none') return;
        // Don't let server idle overwrite local pose detection (causes stuck Idle / wrong UI).
        if (d.action === 'idle') return;
        if (lockRef.current) return;

        // Play ninja animation
        if (ninjaRef.current) {
          if (d.action === 'hit') {
            ninjaRef.current.playAction(d.side === 'left' ? 'left_hit' : 'right_hit');
          } else if (d.action === 'block') {
            ninjaRef.current.playAction('block');
          }
        }

        // Lock input for 600ms while animation plays
        lockRef.current = true;
        setTimeout(() => { lockRef.current = false; }, 600);

        // Update log
        const motionKey = d.action === 'hit'
          ? `${d.side === 'left' ? 'left' : 'right'}_hit`
          : 'block';

        const entry = {
          id:     Date.now(),
          action: d.action,
          side:   d.side,
          label:  d.action === 'hit'
                    ? `${d.side.toUpperCase()} HIT`
                    : 'BLOCK',
          time:   new Date().toLocaleTimeString([], { hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit' }),
        };
        setMotionState(motionKey);
        setLastAction({ ...entry, ts: performance.now() });
        setLog(prev => [entry, ...prev].slice(0, 50));
      };

      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, [sessionId]);

  useEffect(() => {
    if (!poseData?.points) {
      setMotionState('idle');
      setPoseDebugJson('');
      return;
    }
    const { motion: nextMotion, debug } = analyzeLocalPose(poseData.points, CAMERA_TEST_THRESHOLDS, localDetectorRefs);
    if (debug) {
      setPoseDebugJson(JSON.stringify(debug, null, 2));
    } else {
      setPoseDebugJson('(no pose debug — landmarks missing or low visibility)');
    }
    setMotionState(nextMotion);
    const now = performance.now();
    const motionChanged = nextMotion !== lastLocalMotionRef.current;
    lastLocalMotionRef.current = nextMotion;
    if (ninjaRef.current && nextMotion !== 'idle' && motionChanged && now >= localAnimCooldownRef.current) {
      ninjaRef.current.playAction(nextMotion);
      localAnimCooldownRef.current = now + 450;
    }
    if (nextMotion !== 'idle' && motionChanged && now - lastLocalLogRef.current > 450) {
      lastLocalLogRef.current = now;
      const isBlock = nextMotion === 'block';
      const side = nextMotion === 'left_hit' ? 'left' : nextMotion === 'right_hit' ? 'right' : '';
      const entry = {
        id: Date.now(),
        action: isBlock ? 'block' : 'hit',
        side,
        label: isBlock ? 'BLOCK' : `${side.toUpperCase()} HIT`,
        time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        source: 'local',
      };
      setLastAction({ ...entry, ts: now });
      setLog(prev => {
        const head = prev[0];
        if (head && head.label === entry.label && entry.id - head.id < 500) return prev;
        return [entry, ...prev].slice(0, 50);
      });
    }
  }, [poseData]);

  useEffect(() => {
    if (!handData?.landmarks || !handData?.handedness) {
      setLeftHandState('unknown');
      setRightHandState('unknown');
      return;
    }

    let nextLeft = 'unknown';
    let nextRight = 'unknown';

    handData.landmarks.forEach((hand, hi) => {
      const h = handData.handedness[hi]?.[0] ?? {};
      const label = h.categoryName ?? h.category_name ?? h.label ?? '';
      const state = getHandState(hand, CAMERA_TEST_THRESHOLDS.fistThreshold);
      // Video is mirrored, so MediaPipe Left maps to user right.
      if (label === 'Left') nextRight = state;
      if (label === 'Right') nextLeft = state;
    });

    setLeftHandState(nextLeft);
    setRightHandState(nextRight);
  }, [handData]);

  // Send landmarks every frame
  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (!poseData) return;

    wsRef.current.send(JSON.stringify({
      landmarks:  poseData.points,
      timestamp:  poseData.timestamp,
      hand_data:  handData ? {
        landmarks:  handData.landmarks,
        handedness: handData.handedness,
        timestamp:  handData.timestamp,
      } : null,
    }));
  }, [poseData, handData]);

  // Canvas skeleton draw
  useEffect(() => {
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    canvas.width  = video.clientWidth;
    canvas.height = video.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const W = canvas.width;
    const H = canvas.height;

    // Pose skeleton — mirror X because video is CSS-mirrored
    if (poseData?.points) {
      const pts = poseData.points;

      // Draw connections
      ctx.strokeStyle = 'rgba(0,242,255,0.7)';
      ctx.lineWidth   = 2;
      POSE_CONNECTIONS.forEach(([i,j]) => {
        const a = pts[i], b = pts[j];
        if (!a || !b || a.visibility < 0.5 || b.visibility < 0.5) return;
        ctx.beginPath();
        ctx.moveTo(W - a.x*W, a.y*H);
        ctx.lineTo(W - b.x*W, b.y*H);
        ctx.stroke();
      });

      // Draw points
      pts.forEach((p, i) => {
        if (!p || p.visibility < 0.5) return;
        const x = W - p.x*W;
        const y = p.y*H;
        ctx.beginPath();
        ctx.arc(x, y, i === 0 ? 5 : 3, 0, Math.PI*2);
        ctx.fillStyle = i === 0 ? '#ff5050'
                      : (i === 15 || i === 16) ? '#00f2ff'
                      : 'rgba(255,255,255,0.7)';
        ctx.fill();
      });
    }

    // Hand skeleton
    if (handData?.landmarks) {
      handData.landmarks.forEach((hand, hi) => {
        const h    = handData.handedness[hi]?.[0] ?? {};
        const label = h.categoryName ?? h.category_name ?? h.label ?? '';
        // Mirror: MediaPipe "Left" → user's right hand (because video is mirrored)
        const color = label === 'Left' ? '#00ff55' : '#ff0055';

        ctx.strokeStyle = color;
        ctx.lineWidth   = 1.5;
        HAND_CONNECTIONS.forEach(([i,j]) => {
          const a = hand[i], b = hand[j];
          if (!a || !b) return;
          ctx.beginPath();
          ctx.moveTo(W - a.x*W, a.y*H);
          ctx.lineTo(W - b.x*W, b.y*H);
          ctx.stroke();
        });

        ctx.fillStyle = color;
        hand.forEach(p => {
          if (!p) return;
          ctx.beginPath();
          ctx.arc(W - p.x*W, p.y*H, 2, 0, Math.PI*2);
          ctx.fill();
        });
      });
    }
  });

  return (
    <div style={{ width:'100%', height:'100vh', background:'radial-gradient(circle at 20% 10%, #101d2a 0%, #070b12 35%, #000 100%)', display:'flex', flexDirection:'column', position:'relative' }}>
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', opacity:0.08, background:'linear-gradient(transparent 50%, rgba(255,255,255,0.15) 50%)', backgroundSize:'100% 4px' }} />

      {/* Top bar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 24px', borderBottom:'1px solid rgba(255,255,255,0.1)' }}>
        <Link to="/menu" style={{ color:'rgba(255,255,255,0.5)', textDecoration:'none', fontSize:13, letterSpacing:'0.15em' }}>
          ← BACK
        </Link>
        <span style={{ fontSize:11, letterSpacing:'0.2em', color: connected ? '#22c55e' : '#ef4444' }}>
          {connected ? '● DETECTION ONLINE' : '● CONNECTING...'}
        </span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:12, padding:'12px 16px 0' }}>
        <div style={{ border:'1px solid rgba(255,255,255,0.12)', borderRadius:12, padding:'10px 12px', background:'rgba(255,255,255,0.03)' }}>
          <div style={{ fontSize:10, letterSpacing:'0.16em', color:'rgba(255,255,255,0.45)', marginBottom:10 }}>
            MOTION STATUS
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:8 }}>
            {MOTION_KEYS.map((key) => {
              const active = motionState === key;
              return (
                <div key={key} style={{ border:'1px solid rgba(255,255,255,0.12)', borderRadius:10, padding:'8px 10px', background: active ? 'rgba(34,197,94,0.16)' : 'rgba(0,0,0,0.25)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:active ? '#22c55e' : 'rgba(255,255,255,0.25)', boxShadow:active ? '0 0 14px #22c55e' : 'none' }} />
                    <span style={{ fontSize:11, letterSpacing:'0.08em', color: active ? '#dcfce7' : 'rgba(255,255,255,0.65)' }}>
                      {getLabel(key)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ border:'1px solid rgba(255,255,255,0.12)', borderRadius:12, padding:'10px 12px', background:'rgba(255,255,255,0.03)' }}>
          <div style={{ fontSize:10, letterSpacing:'0.16em', color:'rgba(255,255,255,0.45)', marginBottom:10 }}>
            HAND STATE
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[['Left Hand', leftHandState], ['Right Hand', rightHandState]].map(([title, state]) => {
              const active = state === 'opened' || state === 'clenched' || state === 'partial';
              const color = state === 'clenched' ? '#ef4444' : state === 'opened' ? '#22c55e' : state === 'partial' ? '#eab308' : '#94a3b8';
              return (
                <div key={title} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', border:'1px solid rgba(255,255,255,0.12)', borderRadius:10, padding:'8px 10px', background:'rgba(0,0,0,0.2)' }}>
                  <span style={{ fontSize:11, letterSpacing:'0.08em', color:'rgba(255,255,255,0.75)' }}>{title}</span>
                  <span style={{ fontSize:11, letterSpacing:'0.08em', color:active ? color : 'rgba(255,255,255,0.5)', textTransform:'uppercase' }}>
                    {state}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ margin:'8px 16px 0', display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'8px 12px', background:'rgba(0,0,0,0.35)' }}>
        <span style={{ fontSize:10, letterSpacing:'0.18em', color:'rgba(255,255,255,0.45)' }}>ARENA FEED</span>
        <span style={{ fontSize:13, letterSpacing:'0.1em', fontWeight:700, color: motionState === 'block' ? '#60a5fa' : motionState === 'idle' ? '#86efac' : '#f87171' }}>
          {getLabel(motionState)}
        </span>
      </div>

      <div style={{ margin:'8px 16px 0', border:`1px solid ${motionState !== 'idle' ? 'rgba(34,197,94,0.45)' : 'rgba(255,255,255,0.12)'}`, borderRadius:12, background:'rgba(0,0,0,0.4)', padding:'8px 10px' }}>
        <div style={{ fontSize:9, letterSpacing:'0.14em', color:'rgba(255,255,255,0.45)', marginBottom:6 }}>
          POSE / HIT DEBUG
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <pre
            style={{
              flex:1,
              minWidth:0,
              margin:0,
              height:96,
              minHeight:96,
              maxHeight:96,
              overflow:'auto',
              padding:'6px 8px',
              borderRadius:8,
              border:'1px solid rgba(255,255,255,0.08)',
              background:'rgba(0,0,0,0.35)',
              fontSize:9,
              lineHeight:1.3,
              color:'#a7f3d0',
              fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              whiteSpace:'pre',
              overflowWrap:'normal',
            }}
          >
            {poseDebugJson || '…'}
          </pre>
          <button
            type="button"
            onClick={copyPoseDebugJson}
            disabled={!poseDebugJson?.trim() || poseDebugJson === '…'}
            style={{
              flexShrink:0,
              fontSize:10,
              letterSpacing:'0.12em',
              color: poseDebugCopied ? '#4ade80' : '#cbd5e1',
              background:'rgba(255,255,255,0.06)',
              border:'1px solid rgba(255,255,255,0.2)',
              borderRadius:8,
              padding:'6px 12px',
              cursor: (!poseDebugJson?.trim() || poseDebugJson === '…') ? 'not-allowed' : 'pointer',
              opacity: (!poseDebugJson?.trim() || poseDebugJson === '…') ? 0.45 : 1,
            }}
          >
            {poseDebugCopied ? 'COPIED' : 'COPY JSON'}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex:1, display:'flex', gap:16, padding:16, overflow:'hidden' }}>

        {/* Left column: camera + log */}
        <div style={{ display:'flex', flexDirection:'column', gap:12, width:'45%' }}>

          {/* Camera feed */}
          <div style={{ position:'relative', borderRadius:16, overflow:'hidden', border:'1px solid rgba(255,255,255,0.1)', aspectRatio:'16/9', background:'#111' }}>
            <video
              ref={videoRef}
              autoPlay playsInline muted
              style={{ width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)' }}
            />
            <canvas
              ref={canvasRef}
              style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }}
            />
            {/* Ready indicator */}
            <div style={{ position:'absolute', top:10, left:10, background:'rgba(0,0,0,0.7)', padding:'4px 10px', borderRadius:8, fontSize:11, letterSpacing:'0.15em', color: ready ? '#22c55e' : '#888' }}>
              {ready ? '● VISION ACTIVE' : '● INITIALISING...'}
            </div>
          </div>

          {/* Action log */}
          <div style={{ flex:1, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)', fontSize:11, letterSpacing:'0.2em', color:'rgba(255,255,255,0.4)' }}>
              ACTION LOG
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:12, display:'flex', flexDirection:'column', gap:6 }}>
              {log.length === 0 && (
                <div style={{ color:'rgba(255,255,255,0.2)', fontSize:12, letterSpacing:'0.15em', textAlign:'center', marginTop:24 }}>
                  AWAITING INPUT
                </div>
              )}
              {log.map(entry => (
                <div key={entry.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'rgba(255,255,255,0.03)', borderRadius:8, border:'1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontWeight:700, letterSpacing:'0.1em', fontSize:13, color: entry.action === 'block' ? '#3b82f6' : '#ef4444' }}>
                    {entry.label}
                  </span>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)', fontFamily:'monospace' }}>
                    {entry.time}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: ninja model */}
        <div style={{ flex:1, position:'relative', borderRadius:16, overflow:'hidden', border:'1px solid rgba(255,255,255,0.1)', background:'#0a0a0a' }}>

          {/* Last action flash */}
          {lastAction && performance.now() - lastAction.ts < 1000 && (
            <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:10, textAlign:'center', pointerEvents:'none' }}>
              <div style={{ fontSize:48, fontWeight:900, letterSpacing:'0.05em', fontStyle:'italic', color: lastAction.action === 'block' ? '#3b82f6' : '#ef4444', textShadow:'0 0 40px currentColor' }}>
                {lastAction.label}
              </div>
            </div>
          )}

          <Canvas
            shadows
            gl={{ antialias: true, alpha: true }}
            dpr={[1, 1.5]}
            style={{ width:'100%', height:'100%' }}
          >
            <PerspectiveCamera makeDefault position={[0, 1.2, 4]} fov={45} />
            <ambientLight intensity={1.0} />
            <directionalLight position={[5, 5, 5]} intensity={1.5} castShadow />
            <pointLight position={[-3, 3, -3]} intensity={0.6} color="#4488ff" />
            <Suspense fallback={null}>
              <NinjaModel ref={ninjaRef} position={[0, -1.2, 0]} scale={2} />
              <Preload all />
            </Suspense>
            <ContactShadows opacity={0.4} scale={10} blur={2} far={4} />
          </Canvas>
        </div>

      </div>
    </div>
  );
};

export default CameraTest;
