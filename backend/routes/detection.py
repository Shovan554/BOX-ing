import math
import time
from collections import deque
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from state import SESSIONS, compute_points

router = APIRouter()


# -------------------------
# Models
# -------------------------

class Landmark(BaseModel):
    x: float
    y: float
    z: float
    visibility: Optional[float] = 1.0


class HandData(BaseModel):
    # hand_landmarks: list of hands, each is list[Landmark] (21 points)
    landmarks: List[List[Landmark]]
    # handedness: list aligned with landmarks; each entry is a list of dicts
    handedness: List[List[dict]]
    timestamp: float


# -------------------------
# Detection Logic
# -------------------------

class CombatDetector:
    """
    Better boxing-like detection:
    - Block: both fists near face and wrists close together.
    - Hit: requires punch-like direction (radial away from shoulder) + extension sequence (state machine).
    - Idle: when BOTH hands are not extended and moving slowly.
    """

    def __init__(self, history_len: int = 18):
        # Visibility / cooldown
        self.vis_threshold = 0.45
        self.cooldown_ms = 550

        # Post-block suppression (prevents "drop hands" => hit)
        self.post_block_suppress_ms = 450
        self.suppress_hits_until = 0.0
        self.release_settle_ms = 120
        self.release_settle_until = 0.0

        # Punch thresholds (all normalized by shoulder width)
        self.ext_ready = 0.95          # around guard / ready zone
        self.ext_hit = 1.18            # must exceed to be considered punch extension
        self.ext_max = 1.70            # ignore huge spikes (tracking jumps)

        # Motion gates
        # NOTE: these are in "normalized units per second" because we divide by shoulder width
        self.min_speed = 1.20          # minimum total speed
        self.min_radial = 0.55         # minimum radial speed away from shoulder (punch-like)
        self.min_forward = 0.00        # set to ~0.12–0.20 if your z is stable to require forward motion

        # Idle definition
        self.idle_speed = 0.55         # slow hands
        self.idle_ext = 1.05           # not extended much

        # History: (ts_ms, wrist, shoulder, nose)
        self.history = {
            "left": deque(maxlen=history_len),
            "right": deque(maxlen=history_len),
        }

        # Per-hand state machine
        # "ready" -> "extending" -> "recover"
        self.state = {"left": "ready", "right": "ready"}
        self.peak_ext = {"left": 0.0, "right": 0.0}

        # last action times
        self.last_action_ts = {"left": 0.0, "right": 0.0, "block": 0.0}

    # ---------- utils ----------

    @staticmethod
    def _dist_2d(a: Landmark, b: Landmark) -> float:
        return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)

    @staticmethod
    def _dist_3d(a: Landmark, b: Landmark) -> float:
        return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)

    @staticmethod
    def _safe_norm(vx: float, vy: float) -> float:
        return math.hypot(vx, vy)

    def _append_hist(self, side: str, ts_ms: float, wrist: Landmark, shoulder: Landmark, nose: Landmark) -> None:
        self.history[side].append((ts_ms, wrist, shoulder, nose))

    def _get_velocity(self, side: str) -> Dict[str, float]:
        """
        Returns:
          vx, vy        = wrist xy velocity (normalized per second)
          vz            = wrist z velocity (normalized per second)
          speed         = xy speed magnitude (normalized per second)
          radial_speed  = component of velocity along (wrist - shoulder) direction (positive = away from shoulder)
        """
        traj = self.history[side]
        if len(traj) < 4:
            return {"vx": 0.0, "vy": 0.0, "vz": 0.0, "speed": 0.0, "radial": 0.0}

        # use a small window to reduce jitter
        t2, w2, sh2, _ = traj[-1]
        t1, w1, sh1, _ = traj[-4]

        dt = (t2 - t1) / 1000.0
        if dt <= 1e-6:
            return {"vx": 0.0, "vy": 0.0, "vz": 0.0, "speed": 0.0, "radial": 0.0}

        vx = (w2.x - w1.x) / dt
        vy = (w2.y - w1.y) / dt
        vz = (w2.z - w1.z) / dt

        speed = self._safe_norm(vx, vy)

        # radial direction from shoulder -> wrist (use latest positions)
        rx = (w2.x - sh2.x)
        ry = (w2.y - sh2.y)
        rnorm = math.hypot(rx, ry)
        if rnorm < 1e-6:
            radial = 0.0
        else:
            ux = rx / rnorm
            uy = ry / rnorm
            radial = vx * ux + vy * uy  # projection

        return {"vx": vx, "vy": vy, "vz": vz, "speed": speed, "radial": radial}

    # ---------- fist detection ----------

    def is_fist(self, hand_landmarks: List[Landmark]) -> bool:
        """
        Simple geometric fist heuristic (your original idea, slightly tuned).
        """
        if len(hand_landmarks) < 21:
            return False

        thumb_tip = hand_landmarks[4]
        thumb_ip = hand_landmarks[3]
        thumb_mcp = hand_landmarks[2]
        thumb_cmc = hand_landmarks[1]

        # thumb folded-ish
        if not (
            self._dist_3d(thumb_tip, thumb_ip) < 0.15
            and self._dist_3d(thumb_ip, thumb_mcp) < 0.15
            and self._dist_3d(thumb_mcp, thumb_cmc) < 0.15
        ):
            return False

        # fingers folded-ish
        for finger_tip_id in [8, 12, 16, 20]:
            tip = hand_landmarks[finger_tip_id]
            pip = hand_landmarks[finger_tip_id - 2]
            mcp = hand_landmarks[finger_tip_id - 3]

            # if finger segments are too long (extended), not a fist
            if self._dist_3d(tip, pip) > 0.25 or self._dist_3d(pip, mcp) > 0.25:
                return False

        return True

    @staticmethod
    def _normalize_hand_label(label: Optional[str]) -> Optional[str]:
        if not label:
            return None
        # handle possible values: "Left", "Right", "left", "RIGHT"
        return label.strip().title()

    def _extract_fists(self, hand_data: Optional[HandData]) -> Dict[str, bool]:
        fists = {"Left": False, "Right": False}
        if not hand_data:
            return fists

        for idx, hand_lms in enumerate(hand_data.landmarks):
            label = None
            if idx < len(hand_data.handedness) and len(hand_data.handedness[idx]) > 0:
                cat = hand_data.handedness[idx][0]
                label = (
                    cat.get("category_name")
                    or cat.get("label")
                    or cat.get("categoryName")
                    or cat.get("handedness")
                )
            label = self._normalize_hand_label(label)
            if label in ("Left", "Right"):
                fists[label] = self.is_fist(hand_lms)

        return fists

    # ---------- core process ----------

    def process(
        self,
        pose_landmarks: List[Landmark],
        ts_ms: float,
        hand_data: Optional[HandData] = None,
    ) -> Optional[Dict[str, Any]]:
        if len(pose_landmarks) < 33:
            return None

        NOSE = pose_landmarks[0]
        L_SH, R_SH = pose_landmarks[11], pose_landmarks[12]
        L_WR, R_WR = pose_landmarks[15], pose_landmarks[16]

        if L_SH.visibility < self.vis_threshold or R_SH.visibility < self.vis_threshold:
            return None

        sh_width = self._dist_2d(L_SH, R_SH)
        if sh_width < 1e-6:
            return None

        # fists
        fists = self._extract_fists(hand_data)

        # -----------------
        # BLOCK detection
        # -----------------
        wrist_dist = self._dist_2d(L_WR, R_WR)
        dist_l_nose = self._dist_2d(L_WR, NOSE)
        dist_r_nose = self._dist_2d(R_WR, NOSE)

        # guard zone near face
        is_in_guard = (dist_l_nose < sh_width * 0.90) and (dist_r_nose < sh_width * 0.90)

        # both wrists close together + both in guard + both fists
        if wrist_dist < sh_width * 0.80 and is_in_guard and fists["Left"] and fists["Right"]:
            if ts_ms - self.last_action_ts["block"] > self.cooldown_ms:
                self.last_action_ts["block"] = ts_ms

                # suppress hit right after block + wipe history to kill "drop" velocities
                self.suppress_hits_until = ts_ms + self.post_block_suppress_ms
                self.release_settle_until = ts_ms + self.release_settle_ms
                self.history["left"].clear()
                self.history["right"].clear()

                # also reset hand states
                self.state["left"] = "ready"
                self.state["right"] = "ready"
                self.peak_ext["left"] = 0.0
                self.peak_ext["right"] = 0.0

                # set per-hand cooldowns at block time
                self.last_action_ts["left"] = ts_ms
                self.last_action_ts["right"] = ts_ms

                return {"action": "block", "side": "both", "velocity": 1.0}

            # if block is still cooling down, don't emit anything special
            return None

        # while suppressed, we don't allow hits
        if ts_ms < self.suppress_hits_until:
            return {"action": "idle", "side": "", "velocity": 0.0}

        # -----------------
        # HIT detection (state machine + direction)
        # -----------------
        detected = None

        per_hand_idle = {"left": False, "right": False}
        per_hand_speed = {"left": 0.0, "right": 0.0}

        for side in ("left", "right"):
            is_left = (side == "left")
            wr = L_WR if is_left else R_WR
            sh = L_SH if is_left else R_SH

            if wr.visibility < self.vis_threshold:
                # if we can't see the wrist, mark as idle-ish (prevents spamming hits)
                per_hand_idle[side] = True
                continue

            # append history (we always track)
            self._append_hist(side, ts_ms, wr, sh, NOSE)

            # normalized metrics
            ext = self._dist_2d(wr, sh) / sh_width
            dist_to_nose = self._dist_2d(wr, NOSE) / sh_width

            # clamp / ignore spikes
            if ext > self.ext_max:
                # treat as tracking glitch; reset that side
                self.state[side] = "ready"
                self.peak_ext[side] = 0.0
                continue

            # velocity normalized by shoulder width (so values are more stable across camera distance)
            v = self._get_velocity(side)
            vx = v["vx"] / sh_width
            vy = v["vy"] / sh_width
            vz = v["vz"] / sh_width
            speed = math.hypot(vx, vy)
            radial = v["radial"] / sh_width
            per_hand_speed[side] = speed

            # per-hand idle: not extended + low movement
            if ext < self.idle_ext and speed < self.idle_speed:
                per_hand_idle[side] = True
            else:
                per_hand_idle[side] = False

            # cooldown
            if ts_ms - self.last_action_ts[side] < self.cooldown_ms:
                continue
            if ts_ms < self.release_settle_until:
                continue

            # fist requirement
            hand_label = "Left" if is_left else "Right"
            is_fist = fists.get(hand_label, False)

            # require not in guard zone for hits (reduces "block jitter" hits)
            # (still allow if very extended - but keep it simple)
            not_guard = dist_to_nose > 0.75

            # ---- state transitions ----
            st = self.state[side]

            if st == "ready":
                # enter "extending" when you start pushing out from a ready-ish position
                if ext > self.ext_ready and speed > 0.70:
                    self.state[side] = "extending"
                    self.peak_ext[side] = ext

            elif st == "extending":
                # update peak
                if ext > self.peak_ext[side]:
                    self.peak_ext[side] = ext

                # punch-like: moving away from shoulder (radial) and fast enough
                punch_motion = (speed > self.min_speed) and (radial > self.min_radial) and (vz > self.min_forward)

                # Confirm hit when:
                # - extended enough, fist, not guard
                # - AND punch_motion
                # - AND either (a) we reached a peak and started retracting OR (b) ext is solidly beyond threshold
                started_retracting = (self.peak_ext[side] - ext) > 0.05

                if is_fist and not_guard and ext >= self.ext_hit and punch_motion and (started_retracting or ext >= (self.ext_hit + 0.05)):
                    detected = {"action": "hit", "side": side, "velocity": float(speed)}
                    self.last_action_ts[side] = ts_ms
                    self.state[side] = "recover"
                    self.peak_ext[side] = 0.0
                    break

                # if they stopped extending (never reached punch extension), reset to ready
                if ext < self.ext_ready and speed < 0.60:
                    self.state[side] = "ready"
                    self.peak_ext[side] = 0.0

            elif st == "recover":
                # wait until arm returns closer to body / guard
                if ext < self.ext_ready:
                    self.state[side] = "ready"

        # If hit detected
        if detected:
            return detected

        # -----------------
        # IDLE detection (when BOTH hands are idle-ish)
        # -----------------
        if per_hand_idle["left"] and per_hand_idle["right"]:
            # velocity = max speed just for debugging / scoring if needed
            return {"action": "idle", "side": "", "velocity": float(max(per_hand_speed["left"], per_hand_speed["right"]))}

        # otherwise: nothing special (don’t spam idle when only one hand is moving)
        return {"action": "none", "side": "", "velocity": 0.0}


# -------------------------
# WebSocket Route
# -------------------------

@router.websocket("/ws/detect/{session_id}")
async def websocket_detection(websocket: WebSocket, session_id: str):
    await websocket.accept()
    detector = CombatDetector()

    try:
        while True:
            data = await websocket.receive_json()

            landmarks_raw = data.get("landmarks", [])
            pose_landmarks = [Landmark(**lm) for lm in landmarks_raw]

            ts = data.get("timestamp", time.time() * 1000)

            hand_data_raw = data.get("hand_data")
            hand_data = HandData(**hand_data_raw) if hand_data_raw else None

            result = detector.process(pose_landmarks, ts, hand_data)

            # Keep output consistent
            if not result:
                await websocket.send_json({"action": "none"})
                continue

            action = result.get("action", "none")
            side = result.get("side", "")
            vel = float(result.get("velocity", 0.0))

            # If you don't want to award points for idle/none:
            points = 0
            if action in ("hit", "block"):
                points = compute_points(action, vel)
                if session_id in SESSIONS:
                    SESSIONS[session_id]["points"] += points

            await websocket.send_json({
                "action": action,
                "side": side,
                "points": points,
                "velocity": vel,
                "total_points": SESSIONS.get(session_id, {}).get("points", 0)
            })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except Exception:
            pass