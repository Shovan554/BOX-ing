import math
import time
from collections import deque
from typing import Any, Dict, List, Optional

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
    return math.hypot(a[0] - b[0], a[1] - b[1])


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def angle_deg(a, b, c):
    """2D angle ABC at point b (degrees)"""
    bax, bay = a[0] - b[0], a[1] - b[1]
    bcx, bcy = c[0] - b[0], c[1] - b[1]
    dot = bax * bcx + bay * bcy
    na = math.hypot(bax, bay) + 1e-9
    nc = math.hypot(bcx, bcy) + 1e-9
    cosv = clamp(dot / (na * nc), -1.0, 1.0)
    return math.degrees(math.acos(cosv))


class BoxingDetector:
    def __init__(self):
        self.state = "IDLE"
        self.last_event_time = 0.0
        self.cooldown_s = 0.35

        # Motion history
        self.lw_hist = deque(maxlen=6)
        self.rw_hist = deque(maxlen=6)

        # Extension history
        self.l_ext_hist = deque(maxlen=20)
        self.r_ext_hist = deque(maxlen=20)

        # Thresholds
        self.block_elbow_close = 0.72
        self.block_max_extend = 1.45
        self.block_max_elbow_ang = 150

        self.hit_elbow_angle = 150
        self.hit_extend_floor = 1.25
        self.hit_delta = 0.30
        self.hit_speed_px = 5

        # Reference resolution for pixel-based thresholds
        self.ref_w = 640
        self.ref_h = 480

    def _speed(self, hist):
        if len(hist) < 2:
            return 0.0
        x1, y1 = hist[-1]
        x0, y0 = hist[-2]
        return math.hypot(x1 - x0, y1 - y0)

    def _dist3d(self, a, b):
        return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)

    def is_fist(self, hand_lms: List[Landmark]) -> bool:
        if len(hand_lms) < 21:
            return False
        wrist = hand_lms[0]
        palm_size = (self._dist3d(hand_lms[0], hand_lms[9]) + self._dist3d(hand_lms[5], hand_lms[17])) * 0.5
        if palm_size < 1e-5:
            return False
        curled_count = 0
        for tip, pip, mcp in ((8, 6, 5), (12, 10, 9), (16, 14, 13), (20, 18, 17)):
            tip_to_wrist = self._dist3d(hand_lms[tip], wrist)
            pip_to_wrist = self._dist3d(hand_lms[pip], wrist)
            tip_to_mcp = self._dist3d(hand_lms[tip], hand_lms[mcp])
            if tip_to_wrist < (pip_to_wrist * 1.12) and tip_to_mcp < (palm_size * 1.05):
                curled_count += 1
        return curled_count >= 3

    def process(self, landmarks, ts_ms, hand_data=None):
        hand_status = {
            "left": {"detected": False, "fist": False},
            "right": {"detected": False, "fist": False}
        }

        if len(landmarks) < 33:
            return {"action": "none", "side": "", "velocity": 0.0, "hand_status": hand_status}

        def pt(idx):
            p = landmarks[idx]
            return (p.x * self.ref_w, p.y * self.ref_h), p.visibility

        # Required joints (2D)
        LS, _ = pt(11)
        RS, _ = pt(12)
        LE, _ = pt(13)
        RE, _ = pt(14)
        LW, _ = pt(15)
        RW, _ = pt(16)

        shoulder_w = dist(LS, RS) + 1e-6

        # Hand Detection Logic
        if hand_data:
            for idx, hand_lms in enumerate(hand_data.landmarks):
                if not hand_lms: continue
                # MediaPipe JS uses categoryName, Python uses category_name. Check both.
                h_info = hand_data.handedness[idx][0] if hand_data.handedness[idx] else {}
                cat_name = h_info.get("categoryName") or h_info.get("category_name") or h_info.get("label", "")
                handedness = str(cat_name).lower()
                
                # Handedness from MediaPipe is usually reversed in mirror view, but let's just use it
                side = "left" if "left" in handedness else "right"
                hand_status[side]["detected"] = True
                hand_status[side]["fist"] = self.is_fist(hand_lms)

        # Update histories
        self.lw_hist.append(LW)
        self.rw_hist.append(RW)

        lw_speed = self._speed(self.lw_hist)
        rw_speed = self._speed(self.rw_hist)

        # Normalized extension (wrist-to-shoulder)
        l_extend = dist(LW, LS) / shoulder_w
        r_extend = dist(RW, RS) / shoulder_w

        # Store extension history
        self.l_ext_hist.append(l_extend)
        self.r_ext_hist.append(r_extend)

        l_base = min(self.l_ext_hist) if len(self.l_ext_hist) >= 8 else l_extend
        r_base = min(self.r_ext_hist) if len(self.r_ext_hist) >= 8 else r_extend

        l_delta = l_extend - l_base
        r_delta = r_extend - r_base

        l_elbow_ang = angle_deg(LS, LE, LW)
        r_elbow_ang = angle_deg(RS, RE, RW)

        elbows_close_ratio = dist(LE, RE) / shoulder_w

        now = ts_ms / 1000.0
        can_fire = (now - self.last_event_time) >= self.cooldown_s

        # BLOCK
        block = (
            elbows_close_ratio < self.block_elbow_close and
            l_extend < self.block_max_extend and
            r_extend < self.block_max_extend and
            l_elbow_ang < self.block_max_elbow_ang and
            r_elbow_ang < self.block_max_elbow_ang
        )

        if block:
            self.state = "BLOCK"
            return {"action": "block", "side": "", "velocity": 1.0, "hand_status": hand_status}

        # HITS
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
            if left_hit and right_hit:
                side = "left" if l_delta >= r_delta else "right"
            else:
                side = "left" if left_hit else "right"
            
            vel = lw_speed if side == "left" else rw_speed
            return {"action": "hit", "side": side, "velocity": float(vel), "hand_status": hand_status}

        self.state = "IDLE"
        return {"action": "idle", "side": "", "velocity": 0.0, "hand_status": hand_status}


@router.websocket("/ws/detect/{session_id}")
async def websocket_detection(websocket: WebSocket, session_id: str):
    await websocket.accept()
    detector = BoxingDetector()

    try:
        while True:
            data = await websocket.receive_json()

            landmarks_raw = data.get("landmarks", [])
            pose_landmarks = [Landmark(**lm) for lm in landmarks_raw]
            ts = data.get("timestamp", time.time() * 1000)

            hand_data_raw = data.get("hand_data")
            hand_data = HandData(**hand_data_raw) if hand_data_raw else None

            result = detector.process(pose_landmarks, ts, hand_data)

            if not result:
                await websocket.send_json({"action": "none", "hand_status": {"left": {"detected": False, "fist": False}, "right": {"detected": False, "fist": False}}})
                continue

            action = result.get("action", "none")
            side = result.get("side", "")
            vel = float(result.get("velocity", 0.0))

            points = 0
            if action in ("hit", "block"):
                points = compute_points(action, vel)
                if session_id in SESSIONS:
                    SESSIONS[session_id]["points"] += points

            await websocket.send_json(
                {
                    "action": action,
                    "side": side,
                    "points": points,
                    "velocity": vel,
                    "hand_status": result.get("hand_status", {}),
                    "total_points": SESSIONS.get(session_id, {}).get("points", 0),
                }
            )

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except Exception:
            pass
