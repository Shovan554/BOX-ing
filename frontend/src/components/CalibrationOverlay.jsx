import React, { useState, useEffect, useRef } from 'react';
import { analyzeLocalPose, DEFAULT_BOXING_THRESHOLDS } from '../utils/boxingLocalDetect';
import { computeThresholds, saveCalibration } from '../utils/calibration';

const IDLE_REPS = 5;
const HIT_REPS  = 5;
const BLOCK_REPS = 3;
const CALIB_COOLDOWN_MS = 900;
const IDLE_SAMPLE_INTERVAL_MS = 600; // ms between idle snapshots

const STEPS = ['idle', 'idle_pose', 'left_hit', 'right_hit', 'block', 'done'];

const STEP_CFG = {
  idle: {
    title: 'GET READY',
    sub: 'Stand relaxed with arms at your sides. Hold still.',
    color: '#60a5fa',
    icon: '◦',
    total: 0,
  },
  idle_pose: {
    title: 'IDLE  ×5',
    sub: 'Stay completely still with arms relaxed. Capturing your resting pose.',
    color: '#60a5fa',
    icon: '◦',
    total: IDLE_REPS,
  },
  left_hit: {
    title: 'LEFT PUNCH  ×5',
    sub: 'Throw your LEFT arm forward in a straight punch. Return to rest between reps.',
    color: '#f87171',
    icon: '←',
    total: HIT_REPS,
  },
  right_hit: {
    title: 'RIGHT PUNCH  ×5',
    sub: 'Throw your RIGHT arm forward in a straight punch. Return to rest between reps.',
    color: '#fb923c',
    icon: '→',
    total: HIT_REPS,
  },
  block: {
    title: 'GUARD  ×3',
    sub: 'Raise both hands to your face in a guard. Hold each for ~1 second.',
    color: '#a78bfa',
    icon: '▲',
    total: BLOCK_REPS,
  },
  done: {
    title: 'CALIBRATED',
    sub: 'Your calibration has been saved to this device.',
    color: '#4ade80',
    icon: '✓',
    total: 0,
  },
};

export default function CalibrationOverlay({ poseData, onComplete, onCancel }) {
  const [step, setStep] = useState('idle');
  const [reps, setReps] = useState(0);
  const [flash, setFlash] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [computed, setComputed] = useState(null);

  const stepRef         = useRef('idle');
  const samplesRef      = useRef({ idlePoses: [], leftHits: [], rightHits: [], blocks: [] });
  const cooldownRef     = useRef(0);
  const idleNextRef     = useRef(0); // next allowed idle snapshot timestamp
  const transitioningRef = useRef(false);

  // analyzeLocalPose needs its own history, separate from CameraTest
  const detectorRefs = {
    leftWristHist:   useRef([]),
    rightWristHist:  useRef([]),
    leftExtendHist:  useRef([]),
    rightExtendHist: useRef([]),
    blockFrames:     useRef(0),
  };

  const updateStep = (s) => { stepRef.current = s; setStep(s); };

  const doFlash = () => { setFlash(true); setTimeout(() => setFlash(false), 300); };

  const advance = (nextStep) => {
    if (transitioningRef.current) return;
    transitioningRef.current = true;
    doFlash();
    detectorRefs.leftWristHist.current   = [];
    detectorRefs.rightWristHist.current  = [];
    detectorRefs.leftExtendHist.current  = [];
    detectorRefs.rightExtendHist.current = [];
    detectorRefs.blockFrames.current     = 0;
    cooldownRef.current = Date.now() + 900;
    setTimeout(() => {
      updateStep(nextStep);
      setReps(0);
      transitioningRef.current = false;
    }, 700);
  };

  // ── 3-second countdown, then switch to idle_pose ──────────────────────────
  useEffect(() => {
    if (step !== 'idle') return;
    const endAt = Date.now() + 3000;
    setCountdown(3);
    const iv = setInterval(() => {
      const left = Math.ceil((endAt - Date.now()) / 1000);
      setCountdown(Math.max(0, left));
      if (Date.now() >= endAt) {
        clearInterval(iv);
        // don't use advance() here — we don't want to reset detector history
        // (we want it building from real idle frames)
        stepRef.current = 'idle_pose';
        setStep('idle_pose');
        setReps(0);
        idleNextRef.current = Date.now() + IDLE_SAMPLE_INTERVAL_MS;
      }
    }, 100);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── main pose detection effect ────────────────────────────────────────────
  useEffect(() => {
    if (!poseData?.points) return;
    const cur = stepRef.current;
    if (cur === 'idle' || cur === 'done') return;
    if (transitioningRef.current) return;

    const { motion, debug } = analyzeLocalPose(
      poseData.points,
      DEFAULT_BOXING_THRESHOLDS,
      detectorRefs,
    );

    if (!debug) return;

    const now = Date.now();

    // ── idle_pose: collect 5 still frames at interval ─────────────────────
    if (cur === 'idle_pose') {
      // Only sample when truly idle and not moving
      if (motion === 'idle' && debug.speed.L < 0.015 && debug.speed.R < 0.015 && now >= idleNextRef.current) {
        idleNextRef.current = now + IDLE_SAMPLE_INTERVAL_MS;
        samplesRef.current.idlePoses.push({
          extendL: debug.extend.L,
          extendR: debug.extend.R,
          elbowL:  debug.elbowDeg.L,
          elbowR:  debug.elbowDeg.R,
        });
        const next = samplesRef.current.idlePoses.length;
        doFlash();
        setReps(next);
        if (next >= IDLE_REPS) advance('left_hit');
      }
      return;
    }

    if (now < cooldownRef.current) return;

    // ── left punch ────────────────────────────────────────────────────────
    if (cur === 'left_hit' && motion === 'left_hit') {
      cooldownRef.current = now + CALIB_COOLDOWN_MS;
      samplesRef.current.leftHits.push({
        extend: debug.extend.L,
        elbow:  debug.elbowDeg.L,
      });
      const next = samplesRef.current.leftHits.length;
      doFlash();
      setReps(next);
      if (next >= HIT_REPS) advance('right_hit');

    // ── right punch ───────────────────────────────────────────────────────
    } else if (cur === 'right_hit' && motion === 'right_hit') {
      cooldownRef.current = now + CALIB_COOLDOWN_MS;
      samplesRef.current.rightHits.push({
        extend: debug.extend.R,
        elbow:  debug.elbowDeg.R,
      });
      const next = samplesRef.current.rightHits.length;
      doFlash();
      setReps(next);
      if (next >= HIT_REPS) advance('block');

    // ── block / guard ─────────────────────────────────────────────────────
    } else if (cur === 'block' && motion === 'block') {
      cooldownRef.current = now + 1400;
      samplesRef.current.blocks.push({
        lDist: debug.lDistToNose,
        rDist: debug.rDistToNose,
      });
      const next = samplesRef.current.blocks.length;
      doFlash();
      setReps(next);
      if (next >= BLOCK_REPS) {
        transitioningRef.current = true;
        setTimeout(() => {
          const thresholds = computeThresholds(samplesRef.current);
          saveCalibration({ thresholds, timestamp: Date.now() });
          setComputed(thresholds);
          updateStep('done');
          setReps(0);
          transitioningRef.current = false;
        }, 700);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poseData]);

  const cfg      = STEP_CFG[step] ?? STEP_CFG.idle;
  const stepIdx  = STEPS.indexOf(step);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.82)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 500, maxWidth: '92vw',
        background: 'linear-gradient(140deg, #0c1822 0%, #060b10 100%)',
        border: `1px solid ${cfg.color}44`,
        borderRadius: 22,
        padding: '36px 40px',
        boxShadow: `0 0 80px ${cfg.color}1a, 0 4px 40px rgba(0,0,0,0.6)`,
        position: 'relative',
        transition: 'border-color 0.4s, box-shadow 0.4s',
      }}>

        {/* Cancel */}
        {step !== 'done' && (
          <button onClick={onCancel} style={{
            position: 'absolute', top: 16, right: 18,
            background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,0.35)', fontSize: 18, cursor: 'pointer', lineHeight: 1,
          }}>✕</button>
        )}

        {/* Header */}
        <div style={{
          fontSize: 10, letterSpacing: '0.22em',
          color: 'rgba(255,255,255,0.35)', marginBottom: 22, textAlign: 'center',
        }}>
          CAMERA CALIBRATION
        </div>

        {/* Progress dots — group idle + idle_pose as one visible dot */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
          {['idle', 'left_hit', 'right_hit', 'block', 'done'].map((s, i) => {
            // map display steps to actual steps
            const actualStep = s === 'idle' ? (step === 'idle' || step === 'idle_pose' ? step : 'done') : s;
            const isIdleGroup = s === 'idle' && (step === 'idle' || step === 'idle_pose');
            const doneSteps = { idle: 0, idle_pose: 1, left_hit: 2, right_hit: 3, block: 4, done: 5 };
            const curIdx = doneSteps[step] ?? 0;
            const thisIdx = doneSteps[s === 'idle' ? 'idle_pose' : s] ?? 0;
            const done   = curIdx > thisIdx;
            const active = isIdleGroup || step === s;
            return (
              <React.Fragment key={s}>
                <div style={{
                  width: active ? 10 : 8, height: active ? 10 : 8,
                  borderRadius: '50%',
                  background: done ? '#4ade80' : active ? cfg.color : 'rgba(255,255,255,0.18)',
                  boxShadow: active ? `0 0 12px ${cfg.color}` : 'none',
                  transition: 'all 0.35s', flexShrink: 0,
                }} />
                {i < 4 && (
                  <div style={{
                    width: 32, height: 1,
                    background: done ? 'rgba(74,222,128,0.45)' : 'rgba(255,255,255,0.1)',
                    transition: 'background 0.35s', flexShrink: 0,
                  }} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Icon circle */}
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', margin: '0 auto',
            background: `${cfg.color}14`,
            border: `2px solid ${flash ? cfg.color : cfg.color + '44'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 700, color: cfg.color,
            boxShadow: flash ? `0 0 32px ${cfg.color}88` : 'none',
            transition: 'box-shadow 0.12s, border-color 0.12s',
            userSelect: 'none',
          }}>
            {cfg.icon}
          </div>
        </div>

        {/* Title */}
        <div style={{
          textAlign: 'center', marginBottom: 10,
          fontSize: 18, fontWeight: 700, letterSpacing: '0.1em', color: cfg.color,
        }}>
          {cfg.title}
        </div>

        {/* Subtitle */}
        <div style={{
          textAlign: 'center', marginBottom: 28,
          fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.65,
        }}>
          {cfg.sub}
        </div>

        {/* Countdown (idle only) */}
        {step === 'idle' && (
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <span style={{
              fontSize: 64, fontWeight: 900, lineHeight: 1,
              color: cfg.color, textShadow: `0 0 40px ${cfg.color}`,
            }}>
              {countdown}
            </span>
          </div>
        )}

        {/* Rep circles (idle_pose, left_hit, right_hit, block) */}
        {cfg.total > 0 && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 22 }}>
            {Array.from({ length: cfg.total }).map((_, i) => {
              const filled = i < reps;
              return (
                <div key={i} style={{
                  width: 44, height: 44, borderRadius: '50%',
                  border: `2px solid ${filled ? cfg.color : 'rgba(255,255,255,0.18)'}`,
                  background: filled ? `${cfg.color}28` : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: filled ? 16 : 12,
                  color: filled ? cfg.color : 'rgba(255,255,255,0.3)',
                  fontWeight: 700,
                  boxShadow: filled ? `0 0 14px ${cfg.color}55` : 'none',
                  transition: 'all 0.3s',
                }}>
                  {filled ? '✓' : i + 1}
                </div>
              );
            })}
          </div>
        )}

        {/* DETECTED flash */}
        <div style={{ textAlign: 'center', marginBottom: 8, height: 18, opacity: flash ? 1 : 0, transition: 'opacity 0.1s' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', color: cfg.color }}>
            ● DETECTED
          </span>
        </div>

        {/* Done: summary */}
        {step === 'done' && computed && (
          <div style={{
            background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)',
            borderRadius: 10, padding: '14px 18px', marginBottom: 22,
            fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace',
            color: '#a7f3d0', lineHeight: 1.8,
          }}>
            <div>hitExtendFloor   {computed.hitExtendFloor?.toFixed(3)}</div>
            <div>hitElbowAngle    {computed.hitElbowAngle?.toFixed(1)}°</div>
            <div>blockWristToNose {computed.blockWristToNose?.toFixed(3)}</div>
          </div>
        )}

        {/* Done CTA */}
        {step === 'done' && (
          <button onClick={() => onComplete(computed)} style={{
            width: '100%', padding: '13px 0',
            background: `linear-gradient(90deg, ${cfg.color}28, ${cfg.color}18)`,
            border: `1px solid ${cfg.color}66`,
            borderRadius: 11, color: cfg.color,
            fontSize: 12, letterSpacing: '0.2em', fontWeight: 700, cursor: 'pointer',
          }}>
            APPLY & START TESTING
          </button>
        )}
      </div>
    </div>
  );
}
