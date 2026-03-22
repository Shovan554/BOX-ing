/**
 * Local boxing gesture detection (MediaPipe pose landmarks, normalized coords).
 * Shared by Camera Test and Multiplayer Arena.
 */

export const DEFAULT_BOXING_THRESHOLDS = {
  /** Straight arm at shoulder–elbow–wrist; real jabs are often ~125–148°. */
  hitElbowAngle: 145,
  /**
   * When that arm is clearly punching forward (Z depth), allow this many degrees below hitElbowAngle.
   * Matches bent-elbow snaps that still have strong forward depth.
   */
  hitElbowForwardRelax: 22,
  hitExtendFloor: 1.1,
  /** Min extend vs rolling median; forward-punch path can use hitDeltaForwardMin instead. */
  hitDelta: 0.04,
  /** When forwardPunch + depth + extend pass, allow negative delta (median often stays high mid-combo). */
  hitDeltaForwardMin: -0.25,
  hitMinSpeed: 0.012,
  hitShoulderFwd: -15,
  hitShoulderFwdRelax: 22,
  hitStrikeNoseGap: 0.028,
  swapMirrorArms: false,
  blockWristToNose: 0.15,
  /**
   * If set (e.g. 1.08–1.22), block only when *both* arms are shorter than this extend ratio — helps avoid
   * face-on jabs reading as block, but can reject real guards if too tight. null = off (classic block).
   */
  blockMaxExtend: null,
  blockConfirmFrames: 3,
  /** Min |wrist.z − shoulder.z|×640 for “forward punch” (face-on). */
  forwardPunchDepthMin: 22,
  /**
   * When true: if wrists are near the nose in 2D but the pose looks like a straight punch toward the camera,
   * do not count as block (hits win). Restores reliable guard without the old strict arm-length gate.
   */
  blockSuppressForwardPunch: true,
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

const dist = (a, b) => Math.sqrt(a.reduce((acc, v, i) => acc + (v - b[i]) ** 2, 0));


const angleDeg = (a, b, c) => {
  const v1 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const v2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const n1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2 + v1[2] ** 2) + 1e-9;
  const n2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2 + v2[2] ** 2) + 1e-9;
  return Math.acos(clamp(dot / (n1 * n2), -1, 1)) * (180 / Math.PI);
};

const round3 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 1000) / 1000 : n);

const lm = (p) =>
  p
    ? { x: round3(p.x), y: round3(p.y), z: round3(p.z), vis: round3(p.visibility ?? 1) }
    : null;

/**
 * Full pose analysis for local detection + Camera Test debug overlay.
 * MediaPipe indices: 11 L shoulder, 12 R shoulder, 15 L wrist, 16 R wrist (subject, not mirror).
 *
 * @param {Array} points - pose landmarks
 * @param {object} thresholds - see DEFAULT_BOXING_THRESHOLDS
 * @param {object} refs - { leftWristHist, rightWristHist, leftExtendHist, rightExtendHist, blockFrames } with .current
 * @returns {{ motion: 'idle'|'block'|'left_hit'|'right_hit', debug: object|null }}
 */
export function analyzeLocalPose(points, thresholds, refs) {
  if (!points) return { motion: 'idle', debug: null };
  const leftShoulder = points[11];
  const rightShoulder = points[12];
  const leftElbow = points[13];
  const rightElbow = points[14];
  const leftWrist = points[15];
  const rightWrist = points[16];
  const leftHip = points[23];
  const rightHip = points[24];
  const nose = points[0];
  if (!leftShoulder || !rightShoulder || !leftWrist || !rightWrist || !rightElbow || !leftElbow || !rightHip || !leftHip || !nose) {
    return { motion: 'idle', debug: null };
  }
  if (
    leftShoulder.visibility < 0.5 ||
    rightShoulder.visibility < 0.5 ||
    leftWrist.visibility < 0.5 ||
    rightWrist.visibility < 0.5 ||
    leftElbow.visibility < 0.5 ||
    rightElbow.visibility < 0.5
  ) {
    return { motion: 'idle', debug: null };
  }

  const LS = [leftShoulder.x, leftShoulder.y, leftShoulder.z];
  const RS = [rightShoulder.x, rightShoulder.y, rightShoulder.z];
  const LE = [leftElbow.x, leftElbow.y, leftElbow.z];
  const RE = [rightElbow.x, rightElbow.y, rightElbow.z];
  const LW = [leftWrist.x, leftWrist.y, leftWrist.z];
  const RW = [rightWrist.x, rightWrist.y, rightWrist.z];
  const LH = [leftHip.x, leftHip.y, leftHip.z];
  const RH = [rightHip.x, rightHip.y, rightHip.z];
  const torsoLeft = dist(LS, LH) + 1e-6;
  const torsoRight = dist(RS, RH) + 1e-6;
  const midHipY = (leftHip.y + rightHip.y) / 2;
  const lHandUp = leftWrist.y < midHipY;
  const rHandUp = rightWrist.y < midHipY;

  refs.leftWristHist.current.push(LW);
  refs.rightWristHist.current.push(RW);
  if (refs.leftWristHist.current.length > 6) refs.leftWristHist.current.shift();
  if (refs.rightWristHist.current.length > 6) refs.rightWristHist.current.shift();

  const lwHist = refs.leftWristHist.current;
  const rwHist = refs.rightWristHist.current;
  const lwSpeed = lwHist.length >= 2 ? dist(lwHist[lwHist.length - 1], lwHist[lwHist.length - 2]) : 0;
  const rwSpeed = rwHist.length >= 2 ? dist(rwHist[rwHist.length - 1], rwHist[rwHist.length - 2]) : 0;

  const lExtend = dist(LW, LS) / torsoLeft;
  const rExtend = dist(RW, RS) / torsoRight;
  refs.leftExtendHist.current.push(lExtend);
  refs.rightExtendHist.current.push(rExtend);
  if (refs.leftExtendHist.current.length > 30) refs.leftExtendHist.current.shift();
  if (refs.rightExtendHist.current.length > 30) refs.rightExtendHist.current.shift();

  const lBase = refs.leftExtendHist.current.length
    ? [...refs.leftExtendHist.current].sort((a, b) => a - b)[Math.floor(refs.leftExtendHist.current.length / 2)]
    : 0;
  const rBase = refs.rightExtendHist.current.length
    ? [...refs.rightExtendHist.current].sort((a, b) => a - b)[Math.floor(refs.rightExtendHist.current.length / 2)]
    : 0;

  const lDelta = lExtend - lBase;
  const rDelta = rExtend - rBase;
  const lElbowAng = angleDeg(LS, LE, LW);
  const rElbowAng = angleDeg(RS, RE, RW);

  const lDistToNose = dist([leftWrist.x, leftWrist.y], [nose.x, nose.y]);
  const rDistToNose = dist([rightWrist.x, rightWrist.y], [nose.x, nose.y]);
  const lWristAboveShoulder = leftWrist.y < leftShoulder.y;
  const rWristAboveShoulder = rightWrist.y < rightShoulder.y;

  const Z_SCALE = 640;
  const fwdMin = thresholds.forwardPunchDepthMin ?? 22;
  const lForwardPunch = Math.abs(leftWrist.z - leftShoulder.z) * Z_SCALE >= fwdMin;
  const rForwardPunch = Math.abs(rightWrist.z - rightShoulder.z) * Z_SCALE >= fwdMin;
  const lPunchDepth = Math.abs(leftWrist.z - leftShoulder.z) * Z_SCALE;
  const rPunchDepth = Math.abs(rightWrist.z - rightShoulder.z) * Z_SCALE;

  const hitExtFloor = thresholds.hitExtendFloor ?? 1.1;
  const hitElbowMin = thresholds.hitElbowAngle ?? 145;
  const hitElbowFwdRelax = thresholds.hitElbowForwardRelax ?? 22;
  /** Optional cap: both arms must stay “short” for block (tightens vs face-on jabs; null = disabled). */
  const maxExt = thresholds.blockMaxExtend;
  const compactGuard =
    maxExt == null || maxExt === undefined ? true : lExtend < maxExt && rExtend < maxExt;
  /** Straight arm(s) punching toward lens — don’t treat 2D “hands by face” as guard. */
  const suppressBlockForStraightPunch =
    thresholds.blockSuppressForwardPunch !== false &&
    ((lForwardPunch && lExtend >= hitExtFloor - 0.08 && lElbowAng >= hitElbowMin - 12) ||
      (rForwardPunch && rExtend >= hitExtFloor - 0.08 && rElbowAng >= hitElbowMin - 12));

  const bothNearFace =
    lDistToNose < thresholds.blockWristToNose &&
    rDistToNose < thresholds.blockWristToNose &&
    lWristAboveShoulder &&
    rWristAboveShoulder &&
    compactGuard &&
    !suppressBlockForStraightPunch;

  if (bothNearFace) refs.blockFrames.current += 1;
  else refs.blockFrames.current = 0;
  if (refs.blockFrames.current >= thresholds.blockConfirmFrames) {
    const motion = 'block';
    const debug = {
      note: 'MediaPipe: idx 11=L shoulder, 12=R, 15=L wrist, 16=R wrist (subject). Preview is mirrored.',
      landmarks: {
        nose: lm(nose),
        L_shoulder: lm(leftShoulder),
        R_shoulder: lm(rightShoulder),
        L_elbow: lm(leftElbow),
        R_elbow: lm(rightElbow),
        L_wrist: lm(leftWrist),
        R_wrist: lm(rightWrist),
        L_hip: lm(leftHip),
        R_hip: lm(rightHip),
      },
      blockFrames: refs.blockFrames.current,
      bothNearFace,
      compactGuard,
      suppressBlockForStraightPunch,
      lDistToNose: round3(lDistToNose),
      rDistToNose: round3(rDistToNose),
      extend: { L: round3(lExtend), R: round3(rExtend) },
      motion,
    };
    return { motion, debug };
  }

  const lShoulderFwd = (leftShoulder.z - rightShoulder.z) * Z_SCALE;
  const rShoulderFwd = (rightShoulder.z - leftShoulder.z) * Z_SCALE;

  const noseGap = thresholds.hitStrikeNoseGap ?? 0.028;
  const leftStriking = lDistToNose > rDistToNose + noseGap;
  const rightStriking = rDistToNose > lDistToNose + noseGap;

  const hitDeltaBase = thresholds.hitDelta ?? 0.04;
  const hitDeltaFwdMin = thresholds.hitDeltaForwardMin ?? -0.25;
  const extendSlack = 0.05;
  const lForwardForHit =
    lForwardPunch && lPunchDepth >= fwdMin && lExtend >= hitExtFloor - extendSlack;
  const rForwardForHit =
    rForwardPunch && rPunchDepth >= fwdMin && rExtend >= hitExtFloor - extendSlack;
  const lDeltaOk = lDelta >= hitDeltaBase || (lForwardForHit && lDelta >= hitDeltaFwdMin);
  const rDeltaOk = rDelta >= hitDeltaBase || (rForwardForHit && rDelta >= hitDeltaFwdMin);

  const lElbowMinEff = lForwardForHit ? hitElbowMin - hitElbowFwdRelax : hitElbowMin;
  const rElbowMinEff = rForwardForHit ? hitElbowMin - hitElbowFwdRelax : hitElbowMin;

  const leftHitCore =
    lHandUp &&
    lElbowAng >= lElbowMinEff &&
    lExtend >= thresholds.hitExtendFloor &&
    lDeltaOk &&
    lwSpeed >= thresholds.hitMinSpeed;

  const rightHitCore =
    rHandUp &&
    rElbowAng >= rElbowMinEff &&
    rExtend >= thresholds.hitExtendFloor &&
    rDeltaOk &&
    rwSpeed >= thresholds.hitMinSpeed;

  const zLo = thresholds.hitShoulderFwd;
  const zRelax = thresholds.hitShoulderFwdRelax ?? 22;
  /** Face-on toward camera: forward depth OR classic shoulder yaw / nose strike geometry. */
  const leftHit =
    leftHitCore &&
    (lForwardPunch ||
      lShoulderFwd >= zLo ||
      (leftStriking && lShoulderFwd >= zLo - zRelax));
  const rightHit =
    rightHitCore &&
    (rForwardPunch ||
      rShoulderFwd >= zLo ||
      (rightStriking && rShoulderFwd >= zLo - zRelax));

  let motion = 'idle';
  if (!leftHit && !rightHit) motion = 'idle';
  else if (leftHit && !rightHit) motion = 'left_hit';
  else if (rightHit && !leftHit) motion = 'right_hit';
  else if (leftStriking && !rightStriking) motion = 'left_hit';
  else if (rightStriking && !leftStriking) motion = 'right_hit';
  else {
    const lScore = lDelta * lwSpeed + lExtend * 0.15;
    const rScore = rDelta * rwSpeed + rExtend * 0.15;
    const scoreDiff = Math.abs(lScore - rScore);
    if (scoreDiff < 0.035) {
      if (lDistToNose > rDistToNose + 0.004) motion = 'left_hit';
      else if (rDistToNose > lDistToNose + 0.004) motion = 'right_hit';
      else if (leftStriking && !rightStriking) motion = 'left_hit';
      else if (rightStriking && !leftStriking) motion = 'right_hit';
      else motion = lScore >= rScore ? 'left_hit' : 'right_hit';
    } else {
      motion = lScore >= rScore ? 'left_hit' : 'right_hit';
    }
  }

  if (motion !== 'idle' && thresholds.swapMirrorArms) {
    if (motion === 'left_hit') motion = 'right_hit';
    else if (motion === 'right_hit') motion = 'left_hit';
  }

  const zLoNum = zLo;
  const debug = {
    note: 'MediaPipe: idx 11=L shoulder, 12=R, 15=L wrist, 16=R wrist (subject). Preview is mirrored.',
    landmarks: {
      nose: lm(nose),
      L_shoulder: lm(leftShoulder),
      R_shoulder: lm(rightShoulder),
      L_elbow: lm(leftElbow),
      R_elbow: lm(rightElbow),
      L_wrist: lm(leftWrist),
      R_wrist: lm(rightWrist),
      L_hip: lm(leftHip),
      R_hip: lm(rightHip),
    },
    noseGap: round3(noseGap),
    distToNose2D: { L_wrist: round3(lDistToNose), R_wrist: round3(rDistToNose), deltaLR: round3(lDistToNose - rDistToNose) },
    strikingFlag: { left: leftStriking, right: rightStriking },
    shoulderFwdZ: { L_minus_R_x640: round3(lShoulderFwd), R_minus_L_x640: round3(rShoulderFwd), needMin: zLoNum, relaxBand: zRelax },
    punchDepthZ: { L: round3(lPunchDepth), R: round3(rPunchDepth), needMin: fwdMin },
    extend: { L: round3(lExtend), R: round3(rExtend), baseL: round3(lBase), baseR: round3(rBase) },
    delta: {
      L: round3(lDelta),
      R: round3(rDelta),
      needMin: hitDeltaBase,
      needMinForward: hitDeltaFwdMin,
      forwardRelax: { L: lForwardForHit, R: rForwardForHit },
    },
    speed: { L: round3(lwSpeed), R: round3(rwSpeed), needMin: thresholds.hitMinSpeed },
    elbowDeg: {
      L: round3(lElbowAng),
      R: round3(rElbowAng),
      needMin: hitElbowMin,
      needMinForward: round3(hitElbowMin - hitElbowFwdRelax),
      forwardRelax: { L: lForwardForHit, R: rForwardForHit },
    },
    handUp: { L: lHandUp, R: rHandUp },
    hitCore: { L: leftHitCore, R: rightHitCore },
    hitGate: { L: leftHit, R: rightHit },
    tieBreak: { lScore: round3(lDelta * lwSpeed + lExtend * 0.15), rScore: round3(rDelta * rwSpeed + rExtend * 0.15) },
    blockFrames: refs.blockFrames.current,
    swapMirrorArms: !!thresholds.swapMirrorArms,
    motion,
  };

  return { motion, debug };
}

/**
 * @param {Array} points - pose landmarks
 * @param {object} thresholds - see DEFAULT_BOXING_THRESHOLDS
 * @param {object} refs - { leftWristHist, rightWristHist, leftExtendHist, rightExtendHist, blockFrames } with .current
 * @returns {'idle'|'block'|'left_hit'|'right_hit'}
 */
export function detectLocalMotion(points, thresholds, refs) {
  return analyzeLocalPose(points, thresholds, refs).motion;
}
