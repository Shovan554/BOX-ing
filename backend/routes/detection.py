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
    landmarks: List[List[Landmark]]
    handedness: List[List[dict]]
    timestamp: float


# -------------------------
# Detection Logic
# -------------------------

class CombatDetector:
    """
    Boxing detection for a player FACING the camera.

    Key design decisions:
    ─────────────────────
    BLOCK
      • Both wrists joined/touching anywhere in front of the body.
      • Uses raw wrist-to-wrist distance normalized by shoulder width.
      • No face-proximity requirement — just wrists together + both fists.

    HIT (left / right)
      • Straight jab toward camera → primary signal is DECREASING Z on the wrist.
      • Secondary: outward radial extension from shoulder.
      • State machine: ready → launching → recover
        "launching" is entered when wrist starts moving forward (z drops).
        Hit is confirmed when z-velocity exceeds threshold AND extension is enough.
      • Fist required (hand landmarks).
      • MIRROR CORRECTION: MediaPipe Hands labels are mirrored for camera-facing
        players. "Left" from the model = player's RIGHT hand. Corrected below.

    IDLE
      • Both wrists slow and not extended.
    """

    # ── Mirror correction ──────────────────────────────────────────────────────
    # When the player faces the camera MediaPipe Hands reports:
    #   "Left"  label → player's RIGHT hand
    #   "Right" label → player's LEFT hand
    # Set to False only if your pipeline already corrects this.
    CAMERA_FACING_MIRROR = True

    def __init__(self, history_len: int = 25):

        # Visibility gate
        self.vis_threshold = 0.40

        # ── Cooldowns (ms) ────────────────────────────────────────────────────
        self.hit_cooldown_ms          = 450
        self.block_cooldown_ms        = 600
        self.post_block_suppress_ms   = 500   # suppress hits right after block release
        self.post_block_settle_ms     = 120

        self.suppress_hits_until  = 0.0
        self.settle_until         = 0.0

        # ── Block thresholds ──────────────────────────────────────────────────
        # Wrist-to-wrist distance as fraction of shoulder width.
        # "touching / joined" — give some slack for camera noise.
        self.block_wrist_touch_ratio  = 0.45

        # ── Extension thresholds (wrist–shoulder / shoulder_width) ────────────
        self.ext_idle     = 1.00   # arm at rest / guard
        self.ext_launch   = 1.05   # arm starts pushing out → enter "launching"
        self.ext_confirm  = 1.15   # minimum extension for a valid hit
        self.ext_max      = 1.80   # ignore tracking glitches above this

        # ── Velocity gates ────────────────────────────────────────────────────
        # Z velocity: in MediaPipe, z decreases as wrist moves toward camera.
        # Threshold is in raw landmark units/second (not shoulder-normalized,
        # because sh_width is an XY measure and z scale differs).
        self.min_z_velocity   = 0.25   # tune up if false positives, down if misses
        self.min_total_speed  = 0.80   # normalized XY speed (/ sh_width)
        self.min_radial_speed = 0.20   # normalized radial outward component

        # ── Idle definition ───────────────────────────────────────────────────
        self.idle_ext   = 1.05
        self.idle_speed = 0.40   # normalized XY speed

        # ── History: deque of (ts_ms, wrist_lm, shoulder_lm, nose_lm) ────────
        self.history: Dict[str, deque] = {
            "left":  deque(maxlen=history_len),
            "right": deque(maxlen=history_len),
        }

        # ── State machine per hand ────────────────────────────────────────────
        # States: "ready" → "launching" → "recover"
        self.state:    Dict[str, str]   = {"left": "ready", "right": "ready"}
        self.peak_ext: Dict[str, float] = {"left": 0.0,     "right": 0.0}
        self.launch_z: Dict[str, float] = {"left": 0.0,     "right": 0.0}

        # ── Last action timestamps ────────────────────────────────────────────
        self.last_action_ts: Dict[str, float] = {
            "left": 0.0, "right": 0.0, "block": 0.0
        }

    # ══════════════════════════════════════════════════════════════════════════
    # Geometry helpers
    # ══════════════════════════════════════════════════════════════════════════

    @staticmethod
    def _dist2d(a: Landmark, b: Landmark) -> float:
        return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)

    @staticmethod
    def _dist3d(a: Landmark, b: Landmark) -> float:
        return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)

    # ══════════════════════════════════════════════════════════════════════════
    # Fist detection (hand landmarks)
    # ══════════════════════════════════════════════════════════════════════════

    def is_fist(self, hand_lms: List[Landmark]) -> bool:
        if len(hand_lms) < 21:
            return False

        # Thumb: all three consecutive segment lengths must be short (folded)
        thumb_joints = [hand_lms[1], hand_lms[2], hand_lms[3], hand_lms[4]]
        for i in range(len(thumb_joints) - 1):
            if self._dist3d(thumb_joints[i], thumb_joints[i + 1]) > 0.12:
                return False

        # Four fingers: tip close to PIP and PIP close to MCP (curled)
        for tip_id in [8, 12, 16, 20]:
            tip = hand_lms[tip_id]
            pip = hand_lms[tip_id - 2]
            mcp = hand_lms[tip_id - 3]
            if self._dist3d(tip, pip) > 0.20:
                return False
            if self._dist3d(pip, mcp) > 0.20:
                return False

        return True

    # ══════════════════════════════════════════════════════════════════════════
    # Handedness → body side (with mirror correction)
    # ══════════════════════════════════════════════════════════════════════════

    @staticmethod
    def _raw_label(handedness_entry: List[dict]) -> Optional[str]:
        if not handedness_entry:
            return None
        cat = handedness_entry[0]
        label = (
            cat.get("category_name") or
            cat.get("label")         or
            cat.get("categoryName") or
            cat.get("handedness")
        )
        return label.strip().title() if label else None

    def _extract_fists(self, hand_data: Optional[HandData]) -> Dict[str, bool]:
        """Returns {body_side: is_fist} with camera-mirror correction applied."""
        fists = {"left": False, "right": False}
        if not hand_data:
            return fists

        for idx, hand_lms in enumerate(hand_data.landmarks):
            raw = self._raw_label(
                hand_data.handedness[idx] if idx < len(hand_data.handedness) else []
            )
            if raw not in ("Left", "Right"):
                continue

            # Mirror correction for camera-facing player
            if self.CAMERA_FACING_MIRROR:
                body_side = "right" if raw == "Left" else "left"
            else:
                body_side = raw.lower()

            fists[body_side] = self.is_fist(hand_lms)

        return fists

    # ══════════════════════════════════════════════════════════════════════════
    # Velocity computation
    # ══════════════════════════════════════════════════════════════════════════

    def _get_velocity(self, side: str, sh_width: float) -> Dict[str, float]:
        """
        Returns:
          speed   – XY wrist speed normalized by sh_width (scale-invariant)
          radial  – outward component (shoulder→wrist direction), normalized
          vz_raw  – raw Z velocity in landmark units/sec (negative = toward cam)
        """
        traj = self.history[side]
        window = min(5, len(traj))
        if window < 2:
            return {"speed": 0.0, "radial": 0.0, "vz_raw": 0.0}

        t2, w2, sh2, _ = traj[-1]
        t1, w1, sh1, _ = traj[-window]

        dt = (t2 - t1) / 1000.0
        if dt < 1e-6:
            return {"speed": 0.0, "radial": 0.0, "vz_raw": 0.0}

        vx_raw = (w2.x - w1.x) / dt
        vy_raw = (w2.y - w1.y) / dt
        vz_raw = (w2.z - w1.z) / dt  # negative = moving toward camera

        if sh_width < 1e-6:
            return {"speed": 0.0, "radial": 0.0, "vz_raw": vz_raw}

        vx = vx_raw / sh_width
        vy = vy_raw / sh_width
        speed = math.hypot(vx, vy)

        # Radial: project velocity onto (shoulder → wrist) unit vector
        rx = w2.x - sh2.x
        ry = w2.y - sh2.y
        rnorm = math.hypot(rx, ry)
        if rnorm < 1e-6:
            radial = 0.0
        else:
            radial = (vx_raw * rx + vy_raw * ry) / (rnorm * sh_width)

        return {"speed": speed, "radial": radial, "vz_raw": vz_raw}

    # ══════════════════════════════════════════════════════════════════════════
    # State reset helpers
    # ══════════════════════════════════════════════════════════════════════════

    def _reset_side(self, side: str) -> None:
        self.state[side]    = "ready"
        self.peak_ext[side] = 0.0
        self.launch_z[side] = 0.0
        self.history[side].clear()

    def _reset_all(self, ts_ms: float) -> None:
        for side in ("left", "right"):
            self._reset_side(side)
            self.last_action_ts[side] = ts_ms

    # ══════════════════════════════════════════════════════════════════════════
    # Main process
    # ══════════════════════════════════════════════════════════════════════════

    def process(
        self,
        pose_landmarks: List[Landmark],
        ts_ms: float,
        hand_data: Optional[HandData] = None,
    ) -> Optional[Dict[str, Any]]:

        if len(pose_landmarks) < 33:
            return None

        NOSE  = pose_landmarks[0]
        L_SH  = pose_landmarks[11]
        R_SH  = pose_landmarks[12]
        L_WR  = pose_landmarks[15]
        R_WR  = pose_landmarks[16]

        if (L_SH.visibility < self.vis_threshold or
                R_SH.visibility < self.vis_threshold):
            return None

        sh_width = self._dist2d(L_SH, R_SH)
        if sh_width < 1e-6:
            return None

        fists = self._extract_fists(hand_data)

        # ══════════════════════════════════════════════════════════════════════
        # BLOCK — wrists joined/touching anywhere in front of body
        # ══════════════════════════════════════════════════════════════════════
        wrist_dist      = self._dist2d(L_WR, R_WR)
        wrists_touching = wrist_dist < sh_width * self.block_wrist_touch_ratio

        if wrists_touching and fists["left"] and fists["right"]:
            if ts_ms - self.last_action_ts["block"] > self.block_cooldown_ms:
                self.last_action_ts["block"] = ts_ms
                self.suppress_hits_until     = ts_ms + self.post_block_suppress_ms
                self.settle_until            = ts_ms + self.post_block_settle_ms
                self._reset_all(ts_ms)
                return {"action": "block", "side": "both", "velocity": 1.0}

            # Block held / cooling — avoid idle spam
            return None

        # ══════════════════════════════════════════════════════════════════════
        # Block-release suppression window
        # ══════════════════════════════════════════════════════════════════════
        if ts_ms < self.suppress_hits_until:
            return {"action": "idle", "side": "", "velocity": 0.0}

        # ══════════════════════════════════════════════════════════════════════
        # HIT detection — state machine per hand
        # ══════════════════════════════════════════════════════════════════════
        detected  = None
        per_idle  = {"left": False, "right": False}
        per_speed = {"left": 0.0,   "right": 0.0}

        WRIST    = {"left": L_WR, "right": R_WR}
        SHOULDER = {"left": L_SH, "right": R_SH}

        for side in ("left", "right"):
            wr = WRIST[side]
            sh = SHOULDER[side]

            if wr.visibility < self.vis_threshold:
                per_idle[side] = True
                continue

            # Always record history
            self.history[side].append((ts_ms, wr, sh, NOSE))

            ext = self._dist2d(wr, sh) / sh_width

            # Clamp tracking glitches
            if ext > self.ext_max:
                self._reset_side(side)
                continue

            v      = self._get_velocity(side, sh_width)
            speed  = v["speed"]
            radial = v["radial"]
            vz_raw = v["vz_raw"]   # negative = toward camera

            per_speed[side] = speed

            # Idle: arm near body, barely moving
            per_idle[side] = (ext < self.idle_ext and speed < self.idle_speed)

            # Per-hand cooldown
            if ts_ms - self.last_action_ts[side] < self.hit_cooldown_ms:
                continue
            if ts_ms < self.settle_until:
                continue

            is_fist = fists.get(side, False)

            # ── State machine ─────────────────────────────────────────────────
            st = self.state[side]

            if st == "ready":
                # Enter "launching" when wrist moves forward (z drops) and extends
                moving_forward = vz_raw < -self.min_z_velocity
                extending      = ext > self.ext_launch

                if moving_forward and extending:
                    self.state[side]    = "launching"
                    self.peak_ext[side] = ext
                    self.launch_z[side] = wr.z

            elif st == "launching":
                # Track peak extension
                if ext > self.peak_ext[side]:
                    self.peak_ext[side] = ext

                moving_forward = vz_raw < -self.min_z_velocity
                z_traveled     = self.launch_z[side] - wr.z   # positive = toward cam
                enough_z       = z_traveled > 0.02
                enough_ext     = ext >= self.ext_confirm
                enough_speed   = speed >= self.min_total_speed
                retracting     = (self.peak_ext[side] - ext) > 0.05

                # Confirm hit: fist + forward z motion + extension + speed
                if (is_fist and
                        enough_ext and
                        enough_speed and
                        enough_z and
                        (moving_forward or retracting)):

                    detected = {
                        "action":   "hit",
                        "side":     side,
                        "velocity": float(speed),
                    }
                    self.last_action_ts[side] = ts_ms
                    self.state[side]           = "recover"
                    self.peak_ext[side]        = 0.0
                    break

                # Arm pulled back without completing punch → reset
                if ext < self.ext_idle and speed < 0.50:
                    self.state[side]    = "ready"
                    self.peak_ext[side] = 0.0
                    self.launch_z[side] = 0.0

            elif st == "recover":
                # Wait for arm to return before next punch
                if ext < self.ext_idle:
                    self.state[side] = "ready"

        # ══════════════════════════════════════════════════════════════════════
        # Return
        # ══════════════════════════════════════════════════════════════════════
        if detected:
            return detected

        if per_idle["left"] and per_idle["right"]:
            return {
                "action":   "idle",
                "side":     "",
                "velocity": float(max(per_speed["left"], per_speed["right"])),
            }

        return {"action": "none", "side": "", "velocity": 0.0}


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket Route
# ─────────────────────────────────────────────────────────────────────────────

@router.websocket("/ws/detect/{session_id}")
async def websocket_detection(websocket: WebSocket, session_id: str):
    await websocket.accept()
    detector = CombatDetector()

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
                await websocket.send_json({"action": "none"})
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