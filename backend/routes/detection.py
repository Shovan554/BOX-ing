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

    cosv = clamp(dot / (n1 * n2), -1.0, 1.0)
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

        # --- BLOCK threshold ---
        # Wrists coming together (normalized by shoulder width).
        # ~0.35 = wrists roughly touching in front of the body.
        self.block_wrist_close = 0.35

        # --- HIT thresholds ---
        # hit_elbow_angle: lowered 150 -> 130 to catch hooks and shorter arm spans
        self.hit_elbow_angle  = 130
        # hit_extend_floor: lowered 1.25 -> 0.90; 125% torso = nearly hyper-extended,
        # 90% is a realistic mid-punch extension
        self.hit_extend_floor = 0.90
        # hit_delta: lowered 0.20 -> 0.12; pairs with the stable rolling baseline
        self.hit_delta        = 0.12
        # hit_shoulder_fwd: widened -15 -> -40; when the user faces camera and turns
        # slightly right the left shoulder pulls back, making l_shoulder_forward
        # go negative — the old threshold was rejecting nearly every left hit
        self.hit_shoulder_fwd = -40

        # Reference resolution for pixel-based thresholds
        self.ref_w = 640
        self.ref_h = 480

    def _dist3d(self, a, b):
        return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)

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
        curled_count = 0
        for tip, pip, mcp in ((8, 6, 5), (12, 10, 9), (16, 14, 13), (20, 18, 17)):
            tip_to_wrist = self._dist3d(hand_lms[tip], wrist)
            pip_to_wrist = self._dist3d(hand_lms[pip], wrist)
            tip_to_mcp   = self._dist3d(hand_lms[tip], hand_lms[mcp])
            if tip_to_wrist < (pip_to_wrist * 1.12) and tip_to_mcp < (palm_size * 1.05):
                curled_count += 1
        return curled_count >= 3

    def _rolling_base(self, hist: deque) -> float:
        """
        Median of the most recent 8 frames.

        Replaces the old global-minimum approach which drifted downward
        permanently after the first punch, causing l_delta / r_delta to
        shrink each punch until hits stopped registering entirely.
        A rolling median recovers cleanly between punches.
        """
        if len(hist) < 4:
            return hist[-1] if hist else 0.0
        recent = sorted(list(hist)[-8:])
        mid = len(recent) // 2
        if len(recent) % 2 == 0:
            return (recent[mid - 1] + recent[mid]) / 2
        return recent[mid]

    def process(self, landmarks, ts_ms, hand_data=None):
        hand_status = {
            "left":  {"detected": False, "fist": False},
            "right": {"detected": False, "fist": False},
        }

        if len(landmarks) < 33:
            return {"action": "none", "side": "", "velocity": 0.0, "hand_status": hand_status}

        def pt(idx):
            p = landmarks[idx]
            return (p.x * self.ref_w, p.y * self.ref_h, p.z * self.ref_w), p.visibility

        # Required joints (Pose Landmarks)
        LS, _ = pt(11)  # Left Shoulder
        RS, _ = pt(12)  # Right Shoulder
        LE, _ = pt(13)  # Left Elbow
        RE, _ = pt(14)  # Right Elbow
        LW, _ = pt(15)  # Left Wrist
        RW, _ = pt(16)  # Right Wrist
        LH, _ = pt(23)  # Left Hip
        RH, _ = pt(24)  # Right Hip

        shoulder_w = dist(LS, RS) + 1e-6
        torso_h    = dist(LS, LH) + 1e-6  # Vertical body length reference

        # Mid-hip Y — wrists must be above this to register anything.
        # In MediaPipe screen coords Y increases downward, so "above" = smaller Y.
        mid_hip_y = (LH[1] + RH[1]) / 2.0
        l_hand_up = LW[1] < mid_hip_y
        r_hand_up = RW[1] < mid_hip_y

        # Hand Detection Logic
        if hand_data:
            for idx, hand_lms in enumerate(hand_data.landmarks):
                if not hand_lms:
                    continue
                h_info   = hand_data.handedness[idx][0] if hand_data.handedness[idx] else {}
                cat_name = (
                    h_info.get("categoryName")
                    or h_info.get("category_name")
                    or h_info.get("label", "")
                )
                side = "left" if "left" in str(cat_name).lower() else "right"
                hand_status[side]["detected"] = True
                hand_status[side]["fist"]     = self.is_fist(hand_lms)

        # Update wrist histories (3D)
        self.lw_hist.append(LW)
        self.rw_hist.append(RW)

        # Speed (3D, pixels/frame)
        def _speed_3d(h):
            return dist(h[-1], h[-2]) if len(h) >= 2 else 0.0

        lw_speed = _speed_3d(self.lw_hist)
        rw_speed = _speed_3d(self.rw_hist)

        # Normalized extension: wrist-to-shoulder distance / torso height
        l_extend = dist(LW, LS) / torso_h
        r_extend = dist(RW, RS) / torso_h

        # Body rotation: positive value = that shoulder is forward (toward camera)
        # If RS.z > LS.z, right shoulder is further back → left shoulder is forward
        l_shoulder_forward = RS[2] - LS[2]
        r_shoulder_forward = LS[2] - RS[2]

        # Store extension history
        self.l_ext_hist.append(l_extend)
        self.r_ext_hist.append(r_extend)

        # Rolling median baseline — stable, recovers between punches
        l_base  = self._rolling_base(self.l_ext_hist)
        r_base  = self._rolling_base(self.r_ext_hist)
        l_delta = l_extend - l_base
        r_delta = r_extend - r_base

        l_elbow_ang = angle_deg(LS, LE, LW)
        r_elbow_ang = angle_deg(RS, RE, RW)

        wrists_close_ratio = dist(LW, RW) / shoulder_w

        now      = ts_ms / 1000.0
        can_fire = (now - self.last_event_time) >= self.cooldown_s

        # ------------------------------------------------------------------
        # BLOCK — wrists close together AND both hands above hip line
        # ------------------------------------------------------------------
        block = (
            wrists_close_ratio < self.block_wrist_close and
            l_hand_up and r_hand_up
        )

        if block:
            self.state = "BLOCK"
            return {"action": "block", "side": "", "velocity": 1.0, "hand_status": hand_status}

        # ------------------------------------------------------------------
        # HITS
        # ------------------------------------------------------------------
        left_hit = (
            can_fire                                        and
            l_hand_up                                       and
            l_elbow_ang        >= self.hit_elbow_angle     and
            l_extend           >= self.hit_extend_floor    and
            l_delta            >= self.hit_delta           and
            l_shoulder_forward >= self.hit_shoulder_fwd
        )

        right_hit = (
            can_fire                                        and
            r_hand_up                                       and
            r_elbow_ang        >= self.hit_elbow_angle     and
            r_extend           >= self.hit_extend_floor    and
            r_delta            >= self.hit_delta           and
            r_shoulder_forward >= self.hit_shoulder_fwd
        )

        if left_hit or right_hit:
            self.last_event_time = now
            if left_hit and right_hit:
                side = "left" if l_delta >= r_delta else "right"
            else:
                side = "left" if left_hit else "right"

            vel = lw_speed if side == "left" else rw_speed
            return {
                "action":      "hit",
                "side":        side,
                "velocity":    float(vel),
                "hand_status": hand_status,
            }

        self.state = "IDLE"
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