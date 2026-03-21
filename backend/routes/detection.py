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
    v1 = [a[i] - b[i] for i in range(3)]
    v2 = [c[i] - b[i] for i in range(3)]
    dot = sum(v1[i] * v2[i] for i in range(3))
    n1  = math.sqrt(sum(x * x for x in v1)) + 1e-9
    n2  = math.sqrt(sum(x * x for x in v2)) + 1e-9
    return math.degrees(math.acos(clamp(dot / (n1 * n2), -1.0, 1.0)))


class BoxingDetector:
    REF_W = 640
    REF_H = 480

    def __init__(self):
        self.last_event_time      = 0.0
        self.cooldown_s           = 0.5
        self.lw_hist              = deque(maxlen=6)
        self.rw_hist              = deque(maxlen=6)
        self.l_ext_hist           = deque(maxlen=30)
        self.r_ext_hist           = deque(maxlen=30)
        self.block_frames         = 0
        self.BLOCK_CONFIRM_FRAMES = 3

        # Hit thresholds — validated in real-world testing, do not change
        self.hit_elbow_angle  = 150   # arm must be nearly straight
        self.hit_extend_floor = 1.10  # wrist >= 1.1x torso-height from shoulder
        self.hit_delta        = 0.30  # wrist moved outward >= 0.30 from baseline
        self.hit_min_speed    = 8.0   # wrist speed >= 8 px/frame
        self.hit_shoulder_fwd = -10   # shoulder rotation tolerance

        # Block: bring both fists to face. Guard reads 0.08-0.13 normalised
        # units from nose, idle reads 0.35+, punching reads 0.50+.
        # Second gate: wrists must be above shoulder height.
        self.block_wrist_to_nose = 0.15

    def _rolling_median(self, hist):
        if len(hist) < 4:
            return hist[-1] if hist else 0.0
        recent = sorted(list(hist)[-10:])
        mid = len(recent) // 2
        return (recent[mid-1] + recent[mid]) / 2 if len(recent) % 2 == 0 else recent[mid]

    def is_fist(self, hand_lms):
        if len(hand_lms) < 21:
            return False
        wrist     = hand_lms[0]
        palm_size = (self._d3(hand_lms[0], hand_lms[9]) +
                     self._d3(hand_lms[5], hand_lms[17])) * 0.5
        if palm_size < 1e-5:
            return False
        curled = 0
        for tip, pip, mcp in ((8,6,5),(12,10,9),(16,14,13),(20,18,17)):
            if (self._d3(hand_lms[tip], wrist) < self._d3(hand_lms[pip], wrist) * 1.12 and
                    self._d3(hand_lms[tip], hand_lms[mcp]) < palm_size * 1.05):
                curled += 1
        return curled >= 3

    def _d3(self, a, b):
        return math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2)

    def process(self, landmarks, ts_ms, hand_data=None):
        hand_status = {
            "left":  {"detected": False, "fist": False},
            "right": {"detected": False, "fist": False},
        }

        if len(landmarks) < 33:
            return {"action": "none", "side": "", "velocity": 0.0,
                    "hand_status": hand_status}

        def pt(idx):
            p = landmarks[idx]
            return (p.x * self.REF_W, p.y * self.REF_H, p.z * self.REF_W)

        def pt_raw(idx):
            p = landmarks[idx]
            return (p.x, p.y)

        # ---------------------------------------------------------------
        # LANDMARK INDEX SWAP — critical, do not remove
        #
        # The frontend mirrors the video with CSS (scale-x-[-1]) but sends
        # RAW unmirrored MediaPipe coordinates over the WebSocket.
        # MediaPipe labels joints from the SUBJECT's perspective:
        #   Landmark 11 = subject's LEFT shoulder
        #                 → appears on RIGHT side of mirrored screen
        #                 → is the user's RIGHT shoulder
        # Swapping fixes left/right so detections match what the user sees.
        # ---------------------------------------------------------------
        RS = pt(11);  LS = pt(12)   # RIGHT / LEFT shoulder
        RE = pt(13);  LE = pt(14)   # RIGHT / LEFT elbow
        RW = pt(15);  LW = pt(16)   # RIGHT / LEFT wrist
        RH = pt(23);  LH = pt(24)   # RIGHT / LEFT hip

        NOSE_n = pt_raw(0)
        RW_n   = pt_raw(15)
        LW_n   = pt_raw(16)

        torso_h   = dist(LS, LH) + 1e-6
        mid_hip_y = (LH[1] + RH[1]) / 2.0
        l_hand_up = LW[1] < mid_hip_y
        r_hand_up = RW[1] < mid_hip_y

        # Hand status — swap handedness label to match mirror
        if hand_data:
            for i, hand_lms in enumerate(hand_data.landmarks):
                if not hand_lms: continue
                h     = hand_data.handedness[i][0] if hand_data.handedness[i] else {}
                cat   = h.get("categoryName") or h.get("category_name") or h.get("label","")
                side  = "right" if "left" in str(cat).lower() else "left"
                hand_status[side]["detected"] = True
                hand_status[side]["fist"]     = self.is_fist(hand_lms)

        # Wrist speed
        self.lw_hist.append(LW); self.rw_hist.append(RW)
        lw_spd = dist(self.lw_hist[-1], self.lw_hist[-2]) if len(self.lw_hist)>=2 else 0.0
        rw_spd = dist(self.rw_hist[-1], self.rw_hist[-2]) if len(self.rw_hist)>=2 else 0.0

        # Extension and rolling baseline
        l_ext = dist(LW, LS) / torso_h
        r_ext = dist(RW, RS) / torso_h
        self.l_ext_hist.append(l_ext); self.r_ext_hist.append(r_ext)
        l_base = self._rolling_median(self.l_ext_hist)
        r_base = self._rolling_median(self.r_ext_hist)
        l_dlt  = l_ext - l_base
        r_dlt  = r_ext - r_base

        l_elb = angle_deg(LS, LE, LW)
        r_elb = angle_deg(RS, RE, RW)
        l_sfwd = RS[2] - LS[2]
        r_sfwd = LS[2] - RS[2]

        now      = ts_ms / 1000.0
        can_fire = (now - self.last_event_time) >= self.cooldown_s

        # BLOCK — fists near face + wrists above shoulders
        l_nose = dist(LW_n, NOSE_n)
        r_nose = dist(RW_n, NOSE_n)
        l_above = landmarks[16].y < landmarks[12].y
        r_above = landmarks[15].y < landmarks[11].y

        near_face = (l_nose < self.block_wrist_to_nose and
                     r_nose < self.block_wrist_to_nose and
                     l_above and r_above)
        self.block_frames = self.block_frames + 1 if near_face else 0

        if self.block_frames >= self.BLOCK_CONFIRM_FRAMES:
            return {"action": "block", "side": "", "velocity": 1.0,
                    "hand_status": hand_status}

        # HITS
        l_hit = (can_fire and l_hand_up and
                 l_elb  >= self.hit_elbow_angle  and
                 l_ext  >= self.hit_extend_floor and
                 l_dlt  >= self.hit_delta        and
                 lw_spd >= self.hit_min_speed    and
                 l_sfwd >= self.hit_shoulder_fwd)

        r_hit = (can_fire and r_hand_up and
                 r_elb  >= self.hit_elbow_angle  and
                 r_ext  >= self.hit_extend_floor and
                 r_dlt  >= self.hit_delta        and
                 rw_spd >= self.hit_min_speed    and
                 r_sfwd >= self.hit_shoulder_fwd)

        if l_hit or r_hit:
            self.last_event_time = now
            side = "left" if (l_hit and (not r_hit or l_dlt >= r_dlt)) else "right"
            vel  = lw_spd if side == "left" else rw_spd
            return {"action": "hit", "side": side, "velocity": float(vel),
                    "hand_status": hand_status}

        return {"action": "idle", "side": "", "velocity": 0.0,
                "hand_status": hand_status}



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
            hand_data = None
            if hand_data_raw:
                try:
                    # MediaPipe hand landmarks have x,y,z but not visibility
                    # Landmark model has visibility: Optional[float] = 1.0
                    hand_data = HandData(**hand_data_raw)
                except Exception as e:
                    pass # Silently fail for now to keep connection open

            result = detector.process(pose_landmarks, ts, hand_data)
            
            # Debug sample (every ~100 frames)
            if ts % 100 < 30:
                h_stat = result.get('hand_status', {})
                print(f"[{session_id[:5]}] Action: {result.get('action')} | L:{h_stat.get('left',{}).get('detected')} R:{h_stat.get('right',{}).get('detected')}")

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
                    if "points" not in SESSIONS[session_id]:
                        SESSIONS[session_id]["points"] = 0
                    SESSIONS[session_id]["points"] += points
                else:
                    # If session is missing (e.g. server restart), create it
                    SESSIONS[session_id] = {"points": points, "created_at": time.time()}

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
