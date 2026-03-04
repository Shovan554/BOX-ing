import cv2
import time
import math
from collections import deque
import mediapipe as mp


# -----------------------------
# Math helpers
# -----------------------------
def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def angle_deg(a, b, c):
    """
    2D angle ABC at point b (degrees)
    """
    bax, bay = a[0] - b[0], a[1] - b[1]
    bcx, bcy = c[0] - b[0], c[1] - b[1]
    dot = bax * bcx + bay * bcy
    na = math.hypot(bax, bay) + 1e-9
    nc = math.hypot(bcx, bcy) + 1e-9
    cosv = clamp(dot / (na * nc), -1.0, 1.0)
    return math.degrees(math.acos(cosv))


# -----------------------------
# Boxing Detector (Pose)
# -----------------------------
class BoxingDetector:
    """
    Labels:
      - RIGHT_HIT
      - LEFT_HIT
      - BLOCK
      - IDLE

    Player faces the camera.

    BLOCK:
      - elbows close together (normalized by shoulder width)
      - AND both arms not extended (guard-like)

    HITS:
      - corresponding elbow angle is high (arm straight)
      - AND extension increased vs baseline (delta)
      - AND wrist is moving (speed threshold)
      - cooldown to prevent spamming

    Notes:
      - If you flip the frame (mirror selfie view), perceived left/right swaps.
        We handle that with MIRROR_VIEW mapping (optional).
    """

    def __init__(self):
        self.state = "IDLE"
        self.last_event_time = 0.0
        self.cooldown_s = 0.35

        # Motion history (pixel positions)
        self.lw_hist = deque(maxlen=6)
        self.rw_hist = deque(maxlen=6)

        # Extension history (normalized)
        self.l_ext_hist = deque(maxlen=20)
        self.r_ext_hist = deque(maxlen=20)

        # -----------------------------
        # Thresholds (tune if needed)
        # -----------------------------
        # BLOCK
        self.block_elbow_close = 0.55   # dist(LE,RE)/shoulder_width < this => elbows tucked
        self.block_max_extend = 1.35    # both wrists not too far from shoulders
        self.block_max_elbow_ang = 150  # arms not fully straight in block

        # HIT
        self.hit_elbow_angle = 150      # elbow angle >= this => arm "straight-ish"
        self.hit_extend_floor = 1.25    # minimal extension ratio safety floor
        self.hit_delta = 0.30           # extension increase vs baseline needed
        self.hit_speed_px = 5           # wrist speed pixels/frame (lower helps left register)

    def _speed(self, hist):
        if len(hist) < 2:
            return 0.0
        x1, y1 = hist[-1]
        x0, y0 = hist[-2]
        return math.hypot(x1 - x0, y1 - y0)

    def detect(self, landmarks, w, h):
        PoseLandmark = mp.solutions.pose.PoseLandmark

        def pt(idx):
            p = landmarks[idx]
            return (p.x * w, p.y * h), p.visibility

        # Required joints (2D)
        LS, _ = pt(PoseLandmark.LEFT_SHOULDER.value)
        RS, _ = pt(PoseLandmark.RIGHT_SHOULDER.value)
        LE, _ = pt(PoseLandmark.LEFT_ELBOW.value)
        RE, _ = pt(PoseLandmark.RIGHT_ELBOW.value)
        LW, _ = pt(PoseLandmark.LEFT_WRIST.value)
        RW, _ = pt(PoseLandmark.RIGHT_WRIST.value)

        shoulder_w = dist(LS, RS) + 1e-6

        # Update histories
        self.lw_hist.append(LW)
        self.rw_hist.append(RW)

        lw_speed = self._speed(self.lw_hist)
        rw_speed = self._speed(self.rw_hist)

        # Normalized extension (wrist-to-shoulder)
        l_extend = dist(LW, LS) / shoulder_w
        r_extend = dist(RW, RS) / shoulder_w

        # Store extension history to estimate "guard baseline"
        self.l_ext_hist.append(l_extend)
        self.r_ext_hist.append(r_extend)

        # Baseline: minimum extension seen recently (represents guard / tucked)
        # Need some frames to stabilize.
        if len(self.l_ext_hist) >= 8:
            l_base = min(self.l_ext_hist)
        else:
            l_base = l_extend

        if len(self.r_ext_hist) >= 8:
            r_base = min(self.r_ext_hist)
        else:
            r_base = r_extend

        l_delta = l_extend - l_base
        r_delta = r_extend - r_base

        # Elbow angles (shoulder - elbow - wrist)
        l_elbow_ang = angle_deg(LS, LE, LW)
        r_elbow_ang = angle_deg(RS, RE, RW)

        elbows_close_ratio = dist(LE, RE) / shoulder_w

        now = time.time()
        can_fire = (now - self.last_event_time) >= self.cooldown_s

        # -----------------------------
        # BLOCK (priority)
        # -----------------------------
        block = (
            elbows_close_ratio < self.block_elbow_close and
            l_extend < self.block_max_extend and
            r_extend < self.block_max_extend and
            l_elbow_ang < self.block_max_elbow_ang and
            r_elbow_ang < self.block_max_elbow_ang
        )

        debug = {
            "elbows_close_ratio": elbows_close_ratio,
            "l_extend": l_extend,
            "r_extend": r_extend,
            "l_base": l_base,
            "r_base": r_base,
            "l_delta": l_delta,
            "r_delta": r_delta,
            "l_elbow_ang": l_elbow_ang,
            "r_elbow_ang": r_elbow_ang,
            "lw_speed": lw_speed,
            "rw_speed": rw_speed,
        }

        if block:
            self.state = "BLOCK"
            return self.state, debug

        # -----------------------------
        # HITS
        # -----------------------------
        left_hit = (
            can_fire and
            l_elbow_ang >= self.hit_elbow_angle and
            l_extend >= self.hit_extend_floor and
            l_delta >= self.hit_delta and
            lw_speed >= self.hit_speed_px
        )

        right_hit = (
            can_fire and
            r_elbow_ang >= self.hit_elbow_angle and
            r_extend >= self.hit_extend_floor and
            r_delta >= self.hit_delta and
            rw_speed >= self.hit_speed_px
        )

        if left_hit or right_hit:
            self.last_event_time = now

            # If both fire, pick the one with larger delta (stronger extension increase)
            if left_hit and right_hit:
                self.state = "LEFT_HIT" if l_delta >= r_delta else "RIGHT_HIT"
            else:
                self.state = "LEFT_HIT" if left_hit else "RIGHT_HIT"

            return self.state, debug

        self.state = "IDLE"
        return self.state, debug


# -----------------------------
# Main App
# -----------------------------
def main():
    # If you use cv2.flip(frame, 1), your view is mirrored.
    # This makes the on-screen "left/right" feel swapped.
    MIRROR_VIEW = True

    SHOW_DEBUG = True
    SHOW_LANDMARK_IDS = False  # set True if you want all landmark index numbers

    mp_pose = mp.solutions.pose
    mp_draw = mp.solutions.drawing_utils
    mp_style = mp.solutions.drawing_styles

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("Could not open webcam. Try camera index 1 or 2.")

    detector = BoxingDetector()

    with mp_pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        smooth_landmarks=True,
        enable_segmentation=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as pose:

        prev_t = time.time()

        while True:
            ok, frame = cap.read()
            if not ok:
                break

            # Mirror selfie view
            frame = cv2.flip(frame, 1)
            h, w = frame.shape[:2]

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            rgb.flags.writeable = False
            res = pose.process(rgb)
            rgb.flags.writeable = True

            label = "NO_POSE"
            debug = {}

            if res.pose_landmarks:
                # Draw skeleton
                mp_draw.draw_landmarks(
                    frame,
                    res.pose_landmarks,
                    mp_pose.POSE_CONNECTIONS,
                    landmark_drawing_spec=mp_style.get_default_pose_landmarks_style(),
                )

                # Optional: draw landmark indices
                if SHOW_LANDMARK_IDS:
                    for idx, lm in enumerate(res.pose_landmarks.landmark):
                        cx, cy = int(lm.x * w), int(lm.y * h)
                        if 0 <= cx < w and 0 <= cy < h:
                            cv2.putText(frame, str(idx), (cx + 3, cy - 3),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)

                # Detect action
                label, debug = detector.detect(res.pose_landmarks.landmark, w, h)

                # Because we mirror the frame, perceived left/right swaps.
                if MIRROR_VIEW:
                    if label == "LEFT_HIT":
                        label = "RIGHT_HIT"
                    elif label == "RIGHT_HIT":
                        label = "LEFT_HIT"

                # Highlight key joints
                key_ids = [
                    mp_pose.PoseLandmark.LEFT_SHOULDER.value,
                    mp_pose.PoseLandmark.RIGHT_SHOULDER.value,
                    mp_pose.PoseLandmark.LEFT_ELBOW.value,
                    mp_pose.PoseLandmark.RIGHT_ELBOW.value,
                    mp_pose.PoseLandmark.LEFT_WRIST.value,
                    mp_pose.PoseLandmark.RIGHT_WRIST.value,
                ]
                for idx in key_ids:
                    lm = res.pose_landmarks.landmark[idx]
                    cx, cy = int(lm.x * w), int(lm.y * h)
                    cv2.circle(frame, (cx, cy), 6, (255, 255, 255), -1)

            # FPS
            now = time.time()
            fps = 1.0 / max(now - prev_t, 1e-6)
            prev_t = now

            # UI
            cv2.putText(frame, label, (20, 55),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 255, 0), 3)
            cv2.putText(frame, f"FPS: {fps:.1f}", (20, 95),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

            if SHOW_DEBUG and debug:
                # Display a compact set of debug values (for threshold tuning)
                lines = [
                    f"elbows_close_ratio: {debug['elbows_close_ratio']:.3f}",
                    f"l_extend/base/delta: {debug['l_extend']:.3f} / {debug['l_base']:.3f} / {debug['l_delta']:.3f}",
                    f"r_extend/base/delta: {debug['r_extend']:.3f} / {debug['r_base']:.3f} / {debug['r_delta']:.3f}",
                    f"l_elbow_ang: {debug['l_elbow_ang']:.1f}   lw_speed: {debug['lw_speed']:.1f}",
                    f"r_elbow_ang: {debug['r_elbow_ang']:.1f}   rw_speed: {debug['rw_speed']:.1f}",
                ]
                y = 130
                for t in lines:
                    cv2.putText(frame, t, (20, y),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.62, (230, 230, 230), 2)
                    y += 26

            cv2.imshow("MediaPipe Boxing Detector (Pose)", frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()