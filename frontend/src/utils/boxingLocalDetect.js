/**
 * Local boxing gesture detection (MediaPipe pose landmarks, normalized coords).
 * Shared by Camera Test and Multiplayer Arena.
 */

export const DEFAULT_BOXING_THRESHOLDS = {
  hitElbowAngle: 150,
  hitExtendFloor: 1.1,
  hitDelta: 0.3,
  hitMinSpeed: 0.015,
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

/**
 * @param {Array} points - pose landmarks
 * @param {object} thresholds - see DEFAULT_BOXING_THRESHOLDS
 * @param {object} refs - { leftWristHist, rightWristHist, leftExtendHist, rightExtendHist, blockFrames } with .current
 * @returns {'idle'|'block'|'left_hit'|'right_hit'}
 */
export function detectLocalMotion(points, thresholds, refs) {
  if (!points) return 'idle';
  const leftShoulder = points[11];
  const rightShoulder = points[12];
  const leftElbow = points[13];
  const rightElbow = points[14];
  const leftWrist = points[15];
  const rightWrist = points[16];
  const leftHip = points[23];
  const rightHip = points[24];
  const nose = points[0];
  if (!leftShoulder || !rightShoulder || !leftWrist || !rightWrist || !rightElbow || !leftElbow || !rightHip || !leftHip || !nose) return 'idle';
  if (
    leftShoulder.visibility < 0.5 ||
    rightShoulder.visibility < 0.5 ||
    leftWrist.visibility < 0.5 ||
    rightWrist.visibility < 0.5 ||
    leftElbow.visibility < 0.5 ||
    rightElbow.visibility < 0.5
  ) return 'idle';

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

  const hitExtFloor = thresholds.hitExtendFloor ?? 1.1;
  const hitElbowMin = thresholds.hitElbowAngle ?? 150;
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
  if (refs.blockFrames.current >= thresholds.blockConfirmFrames) return 'block';

  const lShoulderFwd = (leftShoulder.z - rightShoulder.z) * Z_SCALE;
  const rShoulderFwd = (rightShoulder.z - leftShoulder.z) * Z_SCALE;

  const noseGap = thresholds.hitStrikeNoseGap ?? 0.028;
  const leftStriking = lDistToNose > rDistToNose + noseGap;
  const rightStriking = rDistToNose > lDistToNose + noseGap;

  const leftHitCore =
    lHandUp &&
    lElbowAng >= thresholds.hitElbowAngle &&
    lExtend >= thresholds.hitExtendFloor &&
    lDelta >= thresholds.hitDelta &&
    lwSpeed >= thresholds.hitMinSpeed;

  const rightHitCore =
    rHandUp &&
    rElbowAng >= thresholds.hitElbowAngle &&
    rExtend >= thresholds.hitExtendFloor &&
    rDelta >= thresholds.hitDelta &&
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
    if (motion === 'left_hit') return 'right_hit';
    if (motion === 'right_hit') return 'left_hit';
  }
  return motion;
}
