import math
import time
from collections import deque
from typing import List, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from state import SESSIONS, compute_points

router = APIRouter()

# --- Models ---

class Landmark(BaseModel):
    x: float
    y: float
    z: float
    visibility: Optional[float] = 1.0

# --- Detection Logic ---

class CombatDetector:
    def __init__(self, history_len=15):
        self.cooldown_ms = 600
        self.vis_threshold = 0.45
        
        # History for velocity and gesture tracking
        self.history = {
            "left": deque(maxlen=history_len),
            "right": deque(maxlen=history_len)
        }
        
        self.last_action_ts = {"left": 0.0, "right": 0.0, "block": 0.0}
        self.idle_threshold = 0.05 # Threshold for "not moving much"

    def dist_2d(self, a, b):
        return math.sqrt((a.x - b.x)**2 + (a.y - b.y)**2)

    def get_velocity(self, side):
        traj = self.history[side]
        if len(traj) < 3: return 0.0, 0.0
        
        t2, w2, _ = traj[-1]
        t1, w1, _ = traj[-3]
        dt = (t2 - t1) / 1000.0
        if dt <= 0: return 0.0, 0.0
        
        vx = (w2.x - w1.x) / dt
        vy = (w2.y - w1.y) / dt
        return vx, vy

    def process(self, landmarks: List[Landmark], ts_ms: float) -> Optional[dict]:
        if len(landmarks) < 33:
            return None

        # Landmarks
        NOSE = landmarks[0]
        L_SH, R_SH = landmarks[11], landmarks[12]
        L_WR, R_WR = landmarks[15], landmarks[16]

        if L_SH.visibility < self.vis_threshold or R_SH.visibility < self.vis_threshold:
            return None

        sh_width = self.dist_2d(L_SH, R_SH)

        # 1. Block Detection (Both hands up near nose)
        wrist_dist = self.dist_2d(L_WR, R_WR)
        dist_l_nose = self.dist_2d(L_WR, NOSE)
        dist_r_nose = self.dist_2d(R_WR, NOSE)
        
        # Guard zone: hands are close to face
        is_in_guard = dist_l_nose < sh_width * 0.9 and dist_r_nose < sh_width * 0.9

        if wrist_dist < sh_width * 0.8 and is_in_guard:
            if ts_ms - self.last_action_ts["block"] > self.cooldown_ms:
                self.last_action_ts["block"] = ts_ms
                return {"action": "block", "side": "both", "velocity": 1.0}
            return None

        detected = None

        for side in ["left", "right"]:
            is_l = side == "left"
            wr = L_WR if is_l else R_WR
            sh = L_SH if is_l else R_SH
            
            if wr.visibility < self.vis_threshold: continue

            self.history[side].append((ts_ms, wr, sh))
            vx, vy = self.get_velocity(side)
            speed = math.hypot(vx, vy)
            
            if ts_ms - self.last_action_ts[side] < self.cooldown_ms:
                continue

            # Hit Heuristics:
            # 1. Must be extended (wrist far from shoulder)
            ext = self.dist_2d(wr, sh) / sh_width
            
            # 2. Must not be in the guard zone (avoiding idle jitter)
            dist_to_nose = self.dist_2d(wr, NOSE) / sh_width
            
            # 3. Requires a high speed threshold
            # Increase speed threshold from 1.0 to 1.8 to avoid idle registration
            if speed > 1.8 and ext > 1.2 and dist_to_nose > 0.8:
                detected = {"action": "hit", "side": side, "velocity": speed}
                self.last_action_ts[side] = ts_ms
                break

        # If nothing detected, we are effectively idle
        if not detected:
            return {"action": "idle", "side": "", "velocity": 0.0}

        return detected


# --- WebSocket Route ---

@router.websocket("/ws/detect/{session_id}")
async def websocket_detection(websocket: WebSocket, session_id: str):
    await websocket.accept()
    detector = CombatDetector()
    
    try:
        while True:
            data = await websocket.receive_json()
            landmarks_raw = data.get("landmarks", [])
            landmarks = [Landmark(**lm) for lm in landmarks_raw]
            ts = data.get("timestamp", time.time() * 1000)
            
            result = detector.process(landmarks, ts)
            
            if result:
                points = compute_points(result["action"], result["velocity"])
                if session_id in SESSIONS:
                    SESSIONS[session_id]["points"] += points
                
                await websocket.send_json({
                    "action": result["action"],
                    "side": result["side"],
                    "points": points,
                    "velocity": result["velocity"],
                    "total_points": SESSIONS.get(session_id, {}).get("points", 0)
                })
            else:
                await websocket.send_json({"action": "none"})
                
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except:
            pass
