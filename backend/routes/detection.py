import math
import time
from collections import deque
from typing import List, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from state import SESSIONS, compute_points

router = APIRouter()


class Landmark(BaseModel):
    x: float
    y: float
    z: float
    visibility: Optional[float] = 1.0


class HandData(BaseModel):
    landmarks: List[List[Landmark]]
    handedness: List[List[dict]]
    timestamp: float


def dist(a, b):
    return math.sqrt(sum((i - j) ** 2 for i, j in zip(a, b)))


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def angle_deg(a, b, c):
    """3D angle ABC at point b (degrees)"""
    v1 = [a[i] - b[i] for i in range(3)]
    v2 = [c[i] - b[i] for i in range(3)]
    dot = sum(v1[i] * v2[i] for i in range(3))
    n1 = math.sqrt(sum(x * x for x in v1)) + 1e-9
    n2 = math.sqrt(sum(x * x for x in v2)) + 1e-9
    return math.degrees(math.acos(clamp(dot / (n1 * n2), -1.0, 1.0)))


class BoxingDetector:
    def __init__(self):
        self.last_event_time      = 0.0
        self.cooldown_s           = 0.5

        self.lw_hist    = deque(maxlen=6)
        self.rw_hist    = deque(maxlen=6)
        self.l_ext_hist = deque(maxlen=30)
        self.r_ext_hist = deque(maxlen=30)

        self.block_frames         = 0
        self.BLOCK_CONFIRM_FRAMES = 3

        # HIT thresholds
        self.hit_elbow_angle  = 150    # arm must be nearly straight
        self.hit_extend_floor = 1.10   # wrist >= 1.1x torso-height from shoulder
        self.hit_delta        = 0.30   # wrist must move outward >= 0.30 from baseline
        self.hit_min_speed    = 8.0    # wrist speed >= 8 px/frame
        self.hit_shoulder_fwd = -10    # shoulder rotation tolerance

        # BLOCK thresholds
        self.block_wrist_to_nose = 0.15  # max normalised wrist-to-nose distance

        self.REF_W = 640
        self.REF_H = 480

    def _dist3d(self, a, b):
        return math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2)

    def _rolling_median(self, hist: deque) -> float:
        if len(hist) < 4:
            return hist[-1] if hist else 0.0
        recent = sorted(list(hist)[-10:])
        mid    = len(recent) // 2
        return (recent[mid-1] + recent[mid]) / 2 if len(recent) % 2 == 0 else recent[mid]

    def is_fist(self, hand_lms: List[Landmark]) -> bool:
        if len(hand_lms) < 21:
            return False
        wrist = hand_lms[0]
        palm_size = (
            self._dist3d(hand_lms[0], hand_lms[9])
            + self._dist3d(hand_lms[5], hand_lms[17])
        ) * 0.5
        if palm_size < 1e-5:
            return False
        curled = 0
        for tip, pip, mcp in ((8,6,5),(12,10,9),(16,14,13),(20,18,17)):
            if (self._dist3d(hand_lms[tip], wrist) < self._dist3d(hand_lms[pip], wrist) * 1.12 and
                    self._dist3d(hand_lms[tip], hand_lms[mcp]) < palm_size * 1.05):
                curled += 1
        return curled >= 3

    def process(self, landmarks, ts_ms, hand_data=None):
        hand_status = {
            "left":  {"detected": False, "fist": False},
            "right": {"detected": False, "fist": False},
        }

        if len(landmarks) < 33:
            return {"action": "none", "side": "", "velocity": 0.0, "hand_status": hand_status}

        def pt(idx):
            p = landmarks[idx]
            return (p.x * self.REF_W, p.y * self.REF_H, p.z * self.REF_W)

        def pt_raw(idx):
            p = landmarks[idx]
            return (p.x, p.y)   # normalised, for nose-distance check

        RS = pt(11)   # user's RIGHT shoulder  (MediaPipe subject-left)
        LS = pt(12)   # user's LEFT  shoulder  (MediaPipe subject-right)
        RE = pt(13)   # user's RIGHT elbow
        LE = pt(14)   # user's LEFT  elbow
        RW = pt(15)   # user's RIGHT wrist
        LW = pt(16)   # user's LEFT  wrist
        RH = pt(23)   # user's RIGHT hip
        LH = pt(24)   # user's LEFT  hip

        NOSE_n = pt_raw(0)    # nose, normalised
        LW_n   = pt_raw(16)   # LEFT  wrist, normalised
        RW_n   = pt_raw(15)   # RIGHT wrist, normalised

        torso_h   = dist(LS, LH) + 1e-6
        mid_hip_y = (LH[1] + RH[1]) / 2.0

        # Hands-up gate for hits (wrist above mid-hip)
        l_hand_up = LW[1] < mid_hip_y
        r_hand_up = RW[1] < mid_hip_y

        # Wrist speed (pixels/frame)
        self.lw_hist.append(LW)
        self.rw_hist.append(RW)
        lw_speed = dist(self.lw_hist[-1], self.lw_hist[-2]) if len(self.lw_hist) >= 2 else 0.0
        rw_speed = dist(self.rw_hist[-1], self.rw_hist[-2]) if len(self.rw_hist) >= 2 else 0.0

        # Normalised extension
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

        now      = ts_ms / 1000.0
        can_fire = (now - self.last_event_time) >= self.cooldown_s

        # Step 4 — hand status
        if hand_data:
            for idx, hand_lms in enumerate(hand_data.landmarks):
                if not hand_lms: continue
                h_info = hand_data.handedness[idx][0] if hand_data.handedness[idx] else {}
                cat_name = h_info.get("categoryName") or h_info.get("category_name") or h_info.get("label", "")
                side = "right" if "left" in str(cat_name).lower() else "left"
                hand_status[side]["detected"] = True
                hand_status[side]["fist"] = self.is_fist(hand_lms)

        # Step 5 — BLOCK detection
        l_dist_to_nose = dist(LW_n, NOSE_n)
        r_dist_to_nose = dist(RW_n, NOSE_n)

        l_wrist_above_shoulder = landmarks[16].y < landmarks[12].y
        r_wrist_above_shoulder = landmarks[15].y < landmarks[11].y

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
            return {"action": "block", "side": "", "velocity": 1.0, "hand_status": hand_status}

        # Step 6 — HIT detection
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

        if left_hit or right_hit:
            self.last_event_time = now
            side = "left" if (left_hit and (not right_hit or l_delta >= r_delta)) else "right"
            vel  = lw_speed if side == "left" else rw_speed
            return {"action": "hit", "side": side, "velocity": float(vel), "hand_status": hand_status}

        return {"action": "idle", "side": "", "velocity": 0.0, "hand_status": hand_status}


@router.websocket("/ws/detect/{session_id}")
async def websocket_detection(websocket: WebSocket, session_id: str):
    await websocket.accept()
    detector = BoxingDetector()

    try:
        while True:
            data = await websocket.receive_json()

            landmarks_raw  = data.get("landmarks", [])
            pose_landmarks = [Landmark(**lm) for lm in landmarks_raw]
            ts             = data.get("timestamp", time.time() * 1000)

            hand_data_raw = data.get("hand_data")
            hand_data     = HandData(**hand_data_raw) if hand_data_raw else None

            result = detector.process(pose_landmarks, ts, hand_data)

            if not result:
                await websocket.send_json({
                    "action": "none",
                    "hand_status": {
                        "left":  {"detected": False, "fist": False},
                        "right": {"detected": False, "fist": False},
                    },
                })
                continue

            action = result.get("action", "none")
            side   = result.get("side", "")
            vel    = float(result.get("velocity", 0.0))

            points = 0
            if action in ("hit", "block"):
                points = compute_points(action, vel)
                if session_id in SESSIONS:
                    SESSIONS[session_id]["points"] += points

            await websocket.send_json({
                "action":       action,
                "side":         side,
                "points":       points,
                "velocity":     vel,
                "hand_status":  result.get("hand_status", {}),
                "total_points": SESSIONS.get(session_id, {}).get("points", 0),
            })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except Exception:
            pass
