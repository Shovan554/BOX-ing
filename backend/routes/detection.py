import math
import time
from collections import deque
from typing import Any, Dict, List, Optional, Tuple

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


class CombatDetector:
    """Detect hit, block, and idle events from pose and hand landmarks."""

    # When a player faces the camera, MediaPipe Hands labels are mirrored.
    CAMERA_FACING_MIRROR = True

    def __init__(self, history_len: int = 30) -> None:
        # Visibility thresholds
        self.shoulder_vis_threshold = 0.45
        self.wrist_vis_threshold = 0.20

        # Timing windows
        self.hit_cooldown_ms = 380
        self.block_cooldown_ms = 500
        self.post_block_suppress_ms = 420
        self.post_block_settle_ms = 110
        self.fist_memory_ms = 250
        self.launch_timeout_ms = 500

        # Block thresholds
        self.block_touch_ratio = 0.68
        self.block_strong_touch_ratio = 0.52
        self.block_face_ratio = 1.25
        self.block_center_ratio = 0.78
        self.block_forward_z_margin = 0.12
        self.block_hold_frames_required = 2
        self.block_release_frames_required = 2

        # Punch thresholds
        self.ext_idle = 1.02
        self.ext_launch = 1.08
        self.ext_confirm = 1.16
        self.ext_max = 1.95
        self.min_forward_vz = 0.18
        self.min_total_speed = 0.65
        self.min_radial_speed = 0.10
        self.min_z_travel = 0.014

        # Idle thresholds
        self.idle_ext = 1.08
        self.idle_speed = 0.35

        self.suppress_hits_until = 0.0
        self.settle_until = 0.0

        self.history: Dict[str, deque] = {
            "left": deque(maxlen=history_len),
            "right": deque(maxlen=history_len),
        }

        self.state: Dict[str, str] = {"left": "ready", "right": "ready"}
        self.peak_ext: Dict[str, float] = {"left": 0.0, "right": 0.0}
        self.launch_z: Dict[str, float] = {"left": 0.0, "right": 0.0}
        self.launch_ts: Dict[str, float] = {"left": 0.0, "right": 0.0}

        self.last_action_ts: Dict[str, float] = {
            "left": 0.0,
            "right": 0.0,
            "block": 0.0,
        }

        self.fist_state: Dict[str, bool] = {"left": False, "right": False}
        self.fist_state_ts: Dict[str, float] = {"left": 0.0, "right": 0.0}

        self.block_active = False
        self.block_hold_count = 0
        self.block_release_count = 0

    @staticmethod
    def _visibility(lm: Landmark) -> float:
        return 1.0 if lm.visibility is None else lm.visibility

    @staticmethod
    def _dist2d(a: Landmark, b: Landmark) -> float:
        return math.hypot(a.x - b.x, a.y - b.y)

    @staticmethod
    def _dist3d(a: Landmark, b: Landmark) -> float:
        return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)

    @staticmethod
    def _raw_label(handedness_entry: List[dict]) -> Optional[str]:
        if not handedness_entry:
            return None
        cat = handedness_entry[0]
        label = (
            cat.get("category_name")
            or cat.get("label")
            or cat.get("categoryName")
            or cat.get("handedness")
        )
        return label.strip().title() if label else None

    @staticmethod
    def _hand_score(handedness_entry: List[dict]) -> float:
        if not handedness_entry:
            return 0.0
        cat = handedness_entry[0]
        score = cat.get("score") or cat.get("confidence") or cat.get("probability") or 0.0
        try:
            return float(score)
        except (TypeError, ValueError):
            return 0.0

    def is_fist(self, hand_lms: List[Landmark]) -> bool:
        """Scale-aware fist check that survives hand-size and depth variation."""
        if len(hand_lms) < 21:
            return False

        wrist = hand_lms[0]
        palm_size = (
            self._dist3d(hand_lms[0], hand_lms[9]) + self._dist3d(hand_lms[5], hand_lms[17])
        ) * 0.5

        if palm_size < 1e-5:
            return False

        curled_count = 0
        for tip, pip, mcp in ((8, 6, 5), (12, 10, 9), (16, 14, 13), (20, 18, 17)):
            tip_to_wrist = self._dist3d(hand_lms[tip], wrist)
            pip_to_wrist = self._dist3d(hand_lms[pip], wrist)
            tip_to_mcp = self._dist3d(hand_lms[tip], hand_lms[mcp])

            finger_curled = tip_to_wrist < (pip_to_wrist * 1.12) and tip_to_mcp < (palm_size * 1.05)
            if finger_curled:
                curled_count += 1

        thumb_tip = hand_lms[4]
        thumb_ip = hand_lms[3]
        index_mcp = hand_lms[5]
        thumb_folded = (
            self._dist3d(thumb_tip, index_mcp) < (palm_size * 1.15)
            and self._dist3d(thumb_tip, wrist) < (self._dist3d(thumb_ip, wrist) * 1.25)
        )

        return curled_count >= 3 and thumb_folded

    def _extract_fists(self, hand_data: Optional[HandData]) -> Dict[str, Optional[bool]]:
        """
        Returns fist states by body side, with mirror correction.
        A side can be None when that hand was not detected this frame.
        """
        fists: Dict[str, Optional[bool]] = {"left": None, "right": None}
        best_score = {"left": -1.0, "right": -1.0}

        if not hand_data:
            return fists

        for idx, hand_lms in enumerate(hand_data.landmarks):
            handedness_entry = hand_data.handedness[idx] if idx < len(hand_data.handedness) else []
            raw_label = self._raw_label(handedness_entry)
            if raw_label not in ("Left", "Right"):
                continue

            if self.CAMERA_FACING_MIRROR:
                side = "right" if raw_label == "Left" else "left"
            else:
                side = raw_label.lower()

            score = self._hand_score(handedness_entry)
            if score >= best_score[side]:
                best_score[side] = score
                fists[side] = self.is_fist(hand_lms)

        return fists

    def _resolve_fists(self, raw_fists: Dict[str, Optional[bool]], ts_ms: float) -> Dict[str, bool]:
        resolved = {"left": False, "right": False}

        for side in ("left", "right"):
            raw_value = raw_fists.get(side)
            if raw_value is not None:
                self.fist_state[side] = bool(raw_value)
                self.fist_state_ts[side] = ts_ms

            is_recent = (ts_ms - self.fist_state_ts[side]) <= self.fist_memory_ms
            resolved[side] = self.fist_state[side] if is_recent else False

        return resolved

    def _get_velocity(self, side: str, sh_width: float) -> Dict[str, float]:
        """
        Returns:
          speed: XY wrist speed normalized by shoulder width
          radial: outward speed component from shoulder to wrist
          vz_raw: raw Z velocity (negative means toward camera)
        """
        traj = self.history[side]
        window = min(6, len(traj))
        if window < 2:
            return {"speed": 0.0, "radial": 0.0, "vz_raw": 0.0}

        t2, w2, sh2, _ = traj[-1]
        t1, w1, _, _ = traj[-window]

        dt = (t2 - t1) / 1000.0
        if dt < 1e-6:
            return {"speed": 0.0, "radial": 0.0, "vz_raw": 0.0}

        vx_raw = (w2.x - w1.x) / dt
        vy_raw = (w2.y - w1.y) / dt
        vz_raw = (w2.z - w1.z) / dt

        if sh_width < 1e-6:
            return {"speed": 0.0, "radial": 0.0, "vz_raw": vz_raw}

        speed = math.hypot(vx_raw, vy_raw) / sh_width

        rx = w2.x - sh2.x
        ry = w2.y - sh2.y
        rnorm = math.hypot(rx, ry)
        if rnorm < 1e-6:
            radial = 0.0
        else:
            radial = (vx_raw * rx + vy_raw * ry) / (rnorm * sh_width)

        return {"speed": speed, "radial": radial, "vz_raw": vz_raw}

    def _reset_side(self, side: str) -> None:
        self.state[side] = "ready"
        self.peak_ext[side] = 0.0
        self.launch_z[side] = 0.0
        self.launch_ts[side] = 0.0
        self.history[side].clear()

    def _reset_all(self, ts_ms: float) -> None:
        for side in ("left", "right"):
            self._reset_side(side)
            self.last_action_ts[side] = ts_ms

    def _is_block_candidate(
        self,
        l_wr: Landmark,
        r_wr: Landmark,
        l_sh: Landmark,
        r_sh: Landmark,
        nose: Landmark,
        mid_hip_xy: Optional[Tuple[float, float]],
        sh_width: float,
        fists: Dict[str, bool],
    ) -> bool:
        if sh_width < 1e-6:
            return False

        wrist_dist_ratio = self._dist2d(l_wr, r_wr) / sh_width
        tight_touch = wrist_dist_ratio <= self.block_touch_ratio
        strong_touch = wrist_dist_ratio <= self.block_strong_touch_ratio

        mid_sh_x = (l_sh.x + r_sh.x) * 0.5
        mid_sh_y = (l_sh.y + r_sh.y) * 0.5
        if mid_hip_xy is not None:
            torso_h = math.hypot(mid_hip_xy[0] - mid_sh_x, mid_hip_xy[1] - mid_sh_y)
            torso_h = max(torso_h, sh_width * 0.8)
        else:
            torso_h = sh_width * 1.2

        guard_y = mid_sh_y + (torso_h * 0.34)
        wrists_high = l_wr.y < guard_y and r_wr.y < guard_y

        near_face = (
            self._dist2d(l_wr, nose) / sh_width <= self.block_face_ratio
            and self._dist2d(r_wr, nose) / sh_width <= self.block_face_ratio
        )
        center_limit = sh_width * self.block_center_ratio
        near_center = abs(l_wr.x - mid_sh_x) <= center_limit and abs(r_wr.x - mid_sh_x) <= center_limit

        wrists_forward = (
            l_wr.z <= (l_sh.z + self.block_forward_z_margin)
            and r_wr.z <= (r_sh.z + self.block_forward_z_margin)
        )

        double_fist = fists["left"] and fists["right"]

        if strong_touch and wrists_high and wrists_forward:
            return True
        if tight_touch and wrists_high and wrists_forward and (near_face or near_center):
            return double_fist or near_face
        if tight_touch and double_fist and (near_face or wrists_high):
            return True

        return False

    def process(
        self,
        pose_landmarks: List[Landmark],
        ts_ms: float,
        hand_data: Optional[HandData] = None,
    ) -> Optional[Dict[str, Any]]:
        if len(pose_landmarks) < 33:
            return None

        nose = pose_landmarks[0]
        l_sh = pose_landmarks[11]
        r_sh = pose_landmarks[12]
        l_wr = pose_landmarks[15]
        r_wr = pose_landmarks[16]
        l_hip = pose_landmarks[23]
        r_hip = pose_landmarks[24]

        if (
            self._visibility(l_sh) < self.shoulder_vis_threshold
            or self._visibility(r_sh) < self.shoulder_vis_threshold
        ):
            return None

        sh_width = self._dist2d(l_sh, r_sh)
        if sh_width < 1e-6:
            return None

        raw_fists = self._extract_fists(hand_data)
        fists = self._resolve_fists(raw_fists, ts_ms)

        hip_visible = self._visibility(l_hip) > 0.20 and self._visibility(r_hip) > 0.20
        mid_hip_xy = ((l_hip.x + r_hip.x) * 0.5, (l_hip.y + r_hip.y) * 0.5) if hip_visible else None

        block_candidate = self._is_block_candidate(
            l_wr=l_wr,
            r_wr=r_wr,
            l_sh=l_sh,
            r_sh=r_sh,
            nose=nose,
            mid_hip_xy=mid_hip_xy,
            sh_width=sh_width,
            fists=fists,
        )

        if block_candidate:
            self.block_hold_count += 1
            self.block_release_count = 0
        else:
            self.block_hold_count = 0
            self.block_release_count += 1

        if self.block_active:
            if not block_candidate and self.block_release_count >= self.block_release_frames_required:
                self.block_active = False
                self.block_release_count = 0
                self.suppress_hits_until = max(
                    self.suppress_hits_until, ts_ms + (self.post_block_suppress_ms * 0.5)
                )
                self.settle_until = max(self.settle_until, ts_ms + self.post_block_settle_ms)
            return {"action": "idle", "side": "", "velocity": 0.0}

        if (
            block_candidate
            and self.block_hold_count >= self.block_hold_frames_required
            and (ts_ms - self.last_action_ts["block"]) >= self.block_cooldown_ms
        ):
            self.block_active = True
            self.last_action_ts["block"] = ts_ms
            self.suppress_hits_until = ts_ms + self.post_block_suppress_ms
            self.settle_until = ts_ms + self.post_block_settle_ms
            self._reset_all(ts_ms)
            return {"action": "block", "side": "both", "velocity": 1.0}

        if block_candidate:
            return {"action": "idle", "side": "", "velocity": 0.0}

        if ts_ms < self.suppress_hits_until:
            return {"action": "idle", "side": "", "velocity": 0.0}

        detected = None
        per_idle = {"left": False, "right": False}
        per_speed = {"left": 0.0, "right": 0.0}

        wrists = {"left": l_wr, "right": r_wr}
        shoulders = {"left": l_sh, "right": r_sh}

        for side in ("left", "right"):
            wr = wrists[side]
            sh = shoulders[side]

            if self._visibility(wr) < self.wrist_vis_threshold:
                per_idle[side] = True
                if self.state[side] != "ready":
                    self._reset_side(side)
                continue

            self.history[side].append((ts_ms, wr, sh, nose))

            ext = self._dist2d(wr, sh) / sh_width
            if ext > self.ext_max:
                self._reset_side(side)
                continue

            vel = self._get_velocity(side, sh_width)
            speed = vel["speed"]
            radial = vel["radial"]
            vz_raw = vel["vz_raw"]
            forward_vz = -vz_raw

            per_speed[side] = speed
            per_idle[side] = (
                ext < self.idle_ext and speed < self.idle_speed and self.state[side] == "ready"
            )

            if ts_ms - self.last_action_ts[side] < self.hit_cooldown_ms:
                continue
            if ts_ms < self.settle_until:
                continue

            is_fist = fists.get(side, False)
            st = self.state[side]

            if st == "ready":
                launch_signal = forward_vz > self.min_forward_vz and (
                    ext >= self.ext_launch or radial >= self.min_radial_speed
                )
                strong_forward = (
                    forward_vz > (self.min_forward_vz * 1.8)
                    and speed >= (self.min_total_speed * 1.1)
                )

                if launch_signal and (is_fist or strong_forward):
                    self.state[side] = "launching"
                    self.peak_ext[side] = ext
                    self.launch_z[side] = wr.z
                    self.launch_ts[side] = ts_ms

            elif st == "launching":
                if ext > self.peak_ext[side]:
                    self.peak_ext[side] = ext

                z_travel = self.launch_z[side] - wr.z
                retracting = (self.peak_ext[side] - ext) > 0.05

                enough_ext = self.peak_ext[side] >= self.ext_confirm
                enough_speed = speed >= self.min_total_speed
                enough_forward = z_travel >= self.min_z_travel or forward_vz > self.min_forward_vz
                enough_radial = radial >= self.min_radial_speed or retracting

                if is_fist and enough_ext and enough_speed and enough_forward and enough_radial:
                    detected = {"action": "hit", "side": side, "velocity": float(speed)}
                    self.last_action_ts[side] = ts_ms
                    self.state[side] = "recover"
                    self.peak_ext[side] = 0.0
                    break

                timed_out = (ts_ms - self.launch_ts[side]) > self.launch_timeout_ms
                if timed_out or (ext < self.ext_idle and speed < 0.45):
                    self.state[side] = "ready"
                    self.peak_ext[side] = 0.0
                    self.launch_z[side] = 0.0
                    self.launch_ts[side] = 0.0

            elif st == "recover":
                if ext < self.ext_idle and speed < (self.idle_speed * 1.2):
                    self.state[side] = "ready"

        if detected:
            return detected

        if per_idle["left"] and per_idle["right"]:
            return {
                "action": "idle",
                "side": "",
                "velocity": float(max(per_speed["left"], per_speed["right"])),
            }

        return {"action": "none", "side": "", "velocity": 0.0}


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

            if not result:
                await websocket.send_json({"action": "none"})
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
