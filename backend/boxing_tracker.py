"""
boxing_tracker.py
-----------------
Standalone real-time boxing detection using your webcam.
Detects: LEFT HIT | RIGHT HIT | BLOCK | IDLE

BLOCK gesture: bring both fists up close to your face (cover-up guard).
The detector measures wrist-to-nose distance — when both wrists are
near your head simultaneously, it fires BLOCK. This is:
  - Natural boxing guard
  - Impossible to trigger during a punch (arm is extended away from face)
  - Robust to arm crossing / wrist landmark swapping

Run:
    pip install mediapipe opencv-python
    python boxing_tracker.py

Controls:
    Q  — quit
    R  — reset baseline
"""

import os
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["TF_CPP_MIN_LOG_LEVEL"]  = "3"

import math
import time
from collections import deque

import cv2
import mediapipe as mp


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def dist(a, b):
    return math.sqrt(sum((i - j) ** 2 for i, j in zip(a, b)))


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def angle_deg(a, b, c):
    """3D angle at point b, between rays b->a and b->c (degrees)."""
    v1 = [a[i] - b[i] for i in range(3)]
    v2 = [c[i] - b[i] for i in range(3)]
    dot = sum(v1[i] * v2[i] for i in range(3))
    n1  = math.sqrt(sum(x * x for x in v1)) + 1e-9
    n2  = math.sqrt(sum(x * x for x in v2)) + 1e-9
    return math.degrees(math.acos(clamp(dot / (n1 * n2), -1.0, 1.0)))


# ---------------------------------------------------------------------------
# Detector
# ---------------------------------------------------------------------------

class BoxingDetector:
    REF_W = 640
    REF_H = 480

    def __init__(self):
        self.last_event_time = 0.0
        self.cooldown_s      = 0.5

        self.lw_hist = deque(maxlen=6)
        self.rw_hist = deque(maxlen=6)

        self.l_ext_hist = deque(maxlen=30)
        self.r_ext_hist = deque(maxlen=30)

        self.block_frames         = 0
        self.BLOCK_CONFIRM_FRAMES = 3   # frames both wrists must be near face

        # ------------------------------------------------------------------
        # HIT thresholds (unchanged — working well)
        # ------------------------------------------------------------------
        self.hit_elbow_angle  = 150
        self.hit_extend_floor = 1.10
        self.hit_delta        = 0.30
        self.hit_min_speed    = 8.0
        self.hit_shoulder_fwd = -10

        # ------------------------------------------------------------------
        # BLOCK — wrist-to-nose distance threshold
        #
        # Measured in normalised units (0-1 of frame).
        # Face-cover guard:  wrists ~0.08-0.13 from nose
        # Idle arms at side: wrists ~0.35-0.55 from nose
        # Punching:          striking wrist ~0.50-0.80 from nose
        # 0.15 sits cleanly between guard and everything else.
        # A second gate (wrist above shoulder Y) ensures hands must
        # actually be raised — kills any remaining false positives.
        # ------------------------------------------------------------------
        self.block_wrist_to_nose = 0.15   # max normalised dist from nose

    def reset_baseline(self):
        self.l_ext_hist.clear()
        self.r_ext_hist.clear()
        self.block_frames = 0

    def _rolling_median(self, hist):
        if len(hist) < 4:
            return hist[-1] if hist else 0.0
        recent = sorted(list(hist)[-10:])
        mid    = len(recent) // 2
        return (recent[mid-1] + recent[mid]) / 2 if len(recent) % 2 == 0 else recent[mid]

    def _speed(self, hist):
        return dist(hist[-1], hist[-2]) if len(hist) >= 2 else 0.0

    def process(self, landmarks):
        if len(landmarks) < 33:
            return {"action": "idle", "side": "", "debug": {}}

        def pt(idx):
            p = landmarks[idx]
            return (p.x * self.REF_W, p.y * self.REF_H, p.z * self.REF_W)

        def pt_raw(idx):
            """Return raw normalised (x, y) — used for nose/wrist distance."""
            p = landmarks[idx]
            return (p.x, p.y)

        # ------------------------------------------------------------------
        # Landmark mapping — swapped to match mirrored camera
        # MediaPipe 11 = subject left  → screen right → user's RIGHT
        # MediaPipe 12 = subject right → screen left  → user's LEFT
        # ------------------------------------------------------------------
        RS = pt(11)   # user RIGHT shoulder
        LS = pt(12)   # user LEFT  shoulder
        RE = pt(13)   # user RIGHT elbow
        LE = pt(14)   # user LEFT  elbow
        RW = pt(15)   # user RIGHT wrist  (scaled)
        LW = pt(16)   # user LEFT  wrist  (scaled)
        RH = pt(23)   # user RIGHT hip
        LH = pt(24)   # user LEFT  hip

        # Raw normalised coords for distance-to-nose check
        NOSE_n = pt_raw(0)
        LW_n   = pt_raw(16)   # LEFT wrist  normalised
        RW_n   = pt_raw(15)   # RIGHT wrist normalised

        torso_h   = dist(LS, LH) + 1e-6
        mid_hip_y = (LH[1] + RH[1]) / 2.0

        l_hand_up = LW[1] < mid_hip_y
        r_hand_up = RW[1] < mid_hip_y

        self.lw_hist.append(LW)
        self.rw_hist.append(RW)
        lw_speed = self._speed(self.lw_hist)
        rw_speed = self._speed(self.rw_hist)

        l_extend = dist(LW, LS) / torso_h
        r_extend = dist(RW, RS) / torso_h

        self.l_ext_hist.append(l_extend)
        self.r_ext_hist.append(r_extend)

        l_base  = self._rolling_median(self.l_ext_hist)
        r_base  = self._rolling_median(self.r_ext_hist)
        l_delta = l_extend - l_base
        r_delta = r_extend - r_base

        l_elbow_ang = angle_deg(LS, LE, LW)
        r_elbow_ang = angle_deg(RS, RE, RW)

        l_shoulder_fwd = RS[2] - LS[2]
        r_shoulder_fwd = LS[2] - RS[2]

        now      = time.time()
        can_fire = (now - self.last_event_time) >= self.cooldown_s

        # ------------------------------------------------------------------
        # BLOCK — both wrists close to nose AND above shoulder line
        #
        # Two gates:
        #   1. wrist-to-nose < 0.15 (tight — only actual face cover)
        #   2. wrist Y < shoulder Y (hands must be raised to face level)
        #      MediaPipe Y increases downward so smaller Y = higher up
        #
        # Gate 2 kills the false positives completely — if hands are below
        # shoulders they can't be covering the face.
        # ------------------------------------------------------------------
        l_dist_to_nose = dist(LW_n, NOSE_n)
        r_dist_to_nose = dist(RW_n, NOSE_n)

        # Raw normalised shoulder Y values for the height gate
        l_shoulder_y = landmarks[12].y   # user LEFT shoulder (MediaPipe right)
        r_shoulder_y = landmarks[11].y   # user RIGHT shoulder (MediaPipe left)
        lw_raw_y     = landmarks[16].y   # user LEFT wrist
        rw_raw_y     = landmarks[15].y   # user RIGHT wrist

        l_wrist_above_shoulder = lw_raw_y < l_shoulder_y
        r_wrist_above_shoulder = rw_raw_y < r_shoulder_y

        both_near_face = (
            l_dist_to_nose < self.block_wrist_to_nose and
            r_dist_to_nose < self.block_wrist_to_nose and
            l_wrist_above_shoulder and r_wrist_above_shoulder
        )

        if both_near_face:
            self.block_frames += 1
        else:
            self.block_frames = 0

        if self.block_frames >= self.BLOCK_CONFIRM_FRAMES:
            debug = self._make_debug(
                l_elbow_ang, r_elbow_ang, l_extend, r_extend,
                l_delta, r_delta, lw_speed, rw_speed,
                l_shoulder_fwd, r_shoulder_fwd,
                l_dist_to_nose, r_dist_to_nose
            )
            return {"action": "block", "side": "", "debug": debug}

        # ------------------------------------------------------------------
        # HITS
        # ------------------------------------------------------------------
        left_hit = (
            can_fire                                   and
            l_hand_up                                  and
            l_elbow_ang    >= self.hit_elbow_angle     and
            l_extend       >= self.hit_extend_floor    and
            l_delta        >= self.hit_delta           and
            lw_speed       >= self.hit_min_speed       and
            l_shoulder_fwd >= self.hit_shoulder_fwd
        )

        right_hit = (
            can_fire                                   and
            r_hand_up                                  and
            r_elbow_ang    >= self.hit_elbow_angle     and
            r_extend       >= self.hit_extend_floor    and
            r_delta        >= self.hit_delta           and
            rw_speed       >= self.hit_min_speed       and
            r_shoulder_fwd >= self.hit_shoulder_fwd
        )

        debug = self._make_debug(
            l_elbow_ang, r_elbow_ang, l_extend, r_extend,
            l_delta, r_delta, lw_speed, rw_speed,
            l_shoulder_fwd, r_shoulder_fwd,
            l_dist_to_nose, r_dist_to_nose
        )

        if left_hit or right_hit:
            self.last_event_time = now
            side = "left" if (left_hit and (not right_hit or l_delta >= r_delta)) else "right"
            return {"action": "hit", "side": side, "debug": debug}

        return {"action": "idle", "side": "", "debug": debug}

    def _make_debug(self, le, re, lx, rx, ld, rd, ls, rs, lsf, rsf, ln, rn):
        return {
            "l_elbow":  round(le,  1),
            "r_elbow":  round(re,  1),
            "l_ext":    round(lx,  2),
            "r_ext":    round(rx,  2),
            "l_delta":  round(ld,  3),
            "r_delta":  round(rd,  3),
            "lw_spd":   round(ls,  1),
            "rw_spd":   round(rs,  1),
            "l_sfwd":   round(lsf, 1),
            "r_sfwd":   round(rsf, 1),
            "l_nose":   round(ln,  3),   # wrist-to-nose dist — tune block threshold here
            "r_nose":   round(rn,  3),
        }


# ---------------------------------------------------------------------------
# Drawing
# ---------------------------------------------------------------------------

COLORS = {
    "idle":  (100, 100, 100),
    "hit":   (0,   80,  255),
    "block": (255, 160,   0),
}

POSE_CONNECTIONS = [
    (11,12),(11,13),(13,15),(12,14),(14,16),
    (11,23),(12,24),(23,24),
    (23,25),(24,26),(25,27),(26,28),
]


def draw_skeleton(frame, landmarks, h, w):
    def px(lm):
        return (int((1 - lm.x) * w), int(lm.y * h))

    for i, j in POSE_CONNECTIONS:
        a, b = landmarks[i], landmarks[j]
        if a.visibility > 0.5 and b.visibility > 0.5:
            cv2.line(frame, px(a), px(b), (255, 255, 255), 1, cv2.LINE_AA)

    for idx, lm in enumerate(landmarks):
        if lm.visibility > 0.5:
            x, y  = px(lm)
            color = (200, 200, 200)
            if idx == 0:             color = (255, 80,  80)   # nose — red
            if idx in (15, 16):      color = (0,  242, 255)   # wrists — cyan
            cv2.circle(frame, (x, y), 5 if idx == 0 else 4, color, -1, cv2.LINE_AA)


def draw_hud(frame, result, flash_until, detector):
    h, w   = frame.shape[:2]
    action = result["action"]
    side   = result["side"]
    debug  = result.get("debug", {})
    now    = time.time()

    color = COLORS.get(action, (100, 100, 100))

    # Big flash label
    if action != "idle" and now < flash_until:
        label = f"{side.upper() + ' ' if side else ''}{action.upper()}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 2.2, 5)
        tx = (w - tw) // 2
        ty = h // 2
        cv2.putText(frame, label, (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, 2.2, color,    5, cv2.LINE_AA)
        cv2.putText(frame, label, (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, 2.2, (255,255,255), 2, cv2.LINE_AA)

    # Status bar
    cv2.rectangle(frame, (0, h - 110), (w, h), (15, 15, 15), -1)

    indicators = [
        ("LEFT HIT",  action == "hit"   and side == "left",  (0,  80, 255)),
        ("RIGHT HIT", action == "hit"   and side == "right", (0,  80, 255)),
        ("BLOCK",     action == "block",                      (255,160,  0)),
        ("IDLE",      action == "idle",                       (80, 180, 80)),
    ]

    pill_w, pill_h = 130, 36
    gap     = 20
    total   = len(indicators) * pill_w + (len(indicators) - 1) * gap
    start_x = (w - total) // 2

    for i, (label, active, col) in enumerate(indicators):
        x  = start_x + i * (pill_w + gap)
        y  = h - 80
        bg = col if active else (40, 40, 40)
        cv2.rectangle(frame, (x, y), (x+pill_w, y+pill_h), bg, -1, cv2.LINE_AA)
        cv2.rectangle(frame, (x, y), (x+pill_w, y+pill_h), col if active else (70,70,70), 1, cv2.LINE_AA)
        tc = (255,255,255) if active else (80,80,80)
        tx = x + pill_w//2 - len(label)*4
        cv2.putText(frame, label, (tx, y+24), cv2.FONT_HERSHEY_SIMPLEX, 0.5, tc, 1, cv2.LINE_AA)

    # Debug panel (top-right) — includes l_nose / r_nose so you can tune threshold
    lines = [
        f"L elbow:{debug.get('l_elbow','?')}  R elbow:{debug.get('r_elbow','?')}",
        f"L ext:{debug.get('l_ext','?')}  R ext:{debug.get('r_ext','?')}",
        f"L delta:{debug.get('l_delta','?')}  R delta:{debug.get('r_delta','?')}",
        f"LW spd:{debug.get('lw_spd','?')}  RW spd:{debug.get('rw_spd','?')}",
        f"L->nose:{debug.get('l_nose','?')}  R->nose:{debug.get('r_nose','?')}  (block<{detector.block_wrist_to_nose})",
    ]
    for k, line in enumerate(lines):
        cv2.putText(frame, line, (w - 420, 24 + k*18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (120,120,120), 1, cv2.LINE_AA)

    cv2.putText(frame, "Q: quit   R: reset baseline",
                (12, h-14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (60,60,60), 1)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    mp_pose = mp.solutions.pose
    pose    = mp_pose.Pose(
        model_complexity=0,
        smooth_landmarks=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS,          30)

    detector    = BoxingDetector()
    flash_until = 0.0
    last_result = {"action": "idle", "side": "", "debug": {}}

    print("Boxing tracker running — press Q to quit, R to reset baseline")
    print(f"BLOCK gesture: bring both fists close to your face")
    print(f"Block threshold (wrist-to-nose): {detector.block_wrist_to_nose}")
    print(f"Watch the l_nose / r_nose values in the debug panel to tune it")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.flip(frame, 1)
        h, w  = frame.shape[:2]

        rgb    = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = pose.process(rgb)

        if result.pose_landmarks:
            draw_skeleton(frame, result.pose_landmarks.landmark, h, w)
            det = detector.process(result.pose_landmarks.landmark)

            if det["action"] != "idle":
                flash_until = time.time() + 0.8
                last_result = det
            elif time.time() > flash_until:
                last_result = det
        else:
            last_result = {"action": "idle", "side": "", "debug": {}}

        draw_hud(frame, last_result, flash_until, detector)
        cv2.imshow("Boxing Tracker", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("r"):
            detector.reset_baseline()
            print("Baseline reset")

    cap.release()
    cv2.destroyAllWindows()
    pose.close()


if __name__ == "__main__":
    main()