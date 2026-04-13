import { DEFAULT_BOXING_THRESHOLDS } from './boxingLocalDetect';

export const CALIBRATION_STORAGE_KEY = 'boxing_calibration_v1';

export function loadCalibration() {
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveCalibration(data) {
  localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(data));
}

export function clearCalibration() {
  localStorage.removeItem(CALIBRATION_STORAGE_KEY);
}

function minOf(vals) {
  const f = vals.filter(Number.isFinite);
  return f.length ? Math.min(...f) : null;
}

function maxOf(vals) {
  const f = vals.filter(Number.isFinite);
  return f.length ? Math.max(...f) : null;
}

function meanOf(vals) {
  const f = vals.filter(Number.isFinite);
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : null;
}

/**
 * Compute personalized thresholds from calibration samples.
 *
 * We only calibrate 3 stable body-measurement metrics:
 *
 *   hitExtendFloor  — set between idle extend and punch extend, per body
 *   hitElbowAngle   — how straight YOUR elbow gets at full extension
 *   blockWristToNose — how close YOUR hands come to face in guard
 *
 * Everything else (hitDelta, hitMinSpeed, hitShoulderFwd) stays at defaults
 * because those depend on the rolling median baseline that only stabilises
 * over a full session, not a short calibration.
 *
 * samples shape:
 *   idlePoses: [{ extendL, extendR, elbowL, elbowR }]
 *   leftHits:  [{ extend, elbow }]
 *   rightHits: [{ extend, elbow }]
 *   blocks:    [{ lDist, rDist }]
 */
export function computeThresholds(samples) {
  const { idlePoses = [], leftHits = [], rightHits = [], blocks = [] } = samples;
  const allHits = [...leftHits, ...rightHits];
  const out = { ...DEFAULT_BOXING_THRESHOLDS };

  // ── arm extension floor ───────────────────────────────────────────────────
  // Key insight: set the floor BETWEEN the observed idle extend and the
  // observed punch extend. This means idle never triggers and punches always do.
  //
  //   idle arm extend  →  [floor here]  →  punch arm extend
  //
  const idleExtVals  = idlePoses.flatMap(p => [p.extendL, p.extendR]).filter(Number.isFinite);
  const punchExtVals = allHits.map(h => h.extend).filter(Number.isFinite);

  const idleMax  = maxOf(idleExtVals);
  const punchMin = minOf(punchExtVals);

  if (idleMax != null && punchMin != null && punchMin > idleMax) {
    // Place floor at 70% of the gap above idle max (not midpoint).
    // Midpoint was too close to idle — natural arm jitter could push extend above it.
    out.hitExtendFloor = idleMax + (punchMin - idleMax) * 0.70;
  } else if (punchMin != null) {
    // Overlap or no idle data: use 90% of weakest punch, at least 0.05 above observed idle.
    const conservativeFloor = Math.max(0.85, punchMin * 0.90);
    out.hitExtendFloor = idleMax != null
      ? Math.max(conservativeFloor, idleMax + 0.05)
      : conservativeFloor;
  }

  // ── forward-punch path tightening ────────────────────────────────────────────
  // After calibration the extend floor is lower, which makes the forward-punch
  // relaxation path (lDelta >= hitDeltaForwardMin) fire at idle — the wrist
  // naturally sits slightly in front of the shoulder. Require real forward depth
  // and a non-negative delta so idle posture never qualifies.
  out.forwardPunchDepthMin = 40;   // was 22; natural forward lean ≈ 15–25, real punch ≈ 40+
  out.hitDeltaForwardMin   = 0.01; // was −0.25; require slight extension even face-on

  // ── elbow straightness ────────────────────────────────────────────────────
  // Allow 12° below the minimum observed punch angle.
  const elbowVals = allHits.map(h => h.elbow).filter(Number.isFinite);
  const minElbow  = minOf(elbowVals);
  if (minElbow != null) {
    out.hitElbowAngle = Math.max(100, minElbow - 12);
  }

  // ── block guard distance ──────────────────────────────────────────────────
  // Max observed + 10% so they don't have to be as tight in real gameplay.
  const blockDists = blocks.flatMap(b => [b.lDist, b.rDist]).filter(Number.isFinite);
  const maxDist    = maxOf(blockDists);
  if (maxDist != null) {
    out.blockWristToNose = Math.min(0.38, maxDist * 1.10);
  }

  return out;
}
