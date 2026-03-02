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

    def __init__(self, history_len: int = 30) -> None:
        # Visibility thresholds
        self.shoulder_vis_threshold = 0.45
        self.wrist_vis_threshold = 0.20
        self.elbow_vis_threshold = 0.25

        # Timing windows
        self.hit_cooldown_ms = 380
        self.block_cooldown_ms = 500
        self.post_block_suppress_ms = 420
        self.post_block_settle_ms = 110
        self.fist_memory_ms = 250
        self.launch_timeout_ms = 500

        # Block thresholds
        # Block target: elbows joined/near at upper torso guard zone.
        self.block_elbow_close_ratio = 0.58
        self.block_elbow_strong_ratio = 0.44
        self.block_elbow_lateral_y_ratio = 0.22
        self.block_center_ratio = 0.70
        self.block_guard_top_ratio = -0.08
        self.block_guard_bottom_ratio = 0.72
        self.block_wrist_guard_ext = 1.45
        self.block_hold_frames_required = 2
        self.block_release_frames_required = 2

        # Punch thresholds
        self.ext_idle = 1.02
        self.ext_launch = 1.10
        self.ext_confirm = 1.18
        self.ext_max = 1.95
        self.min_forward_vz = 0.20
        self.min_total_speed = 0.72
        self.min_radial_speed = 0.12
        self.min_z_travel = 0.016
        self.hit_side_speed_margin = 0.12
        self.hit_side_vz_margin = 0.035
        self.dual_hit_score_margin = 0.12

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

    def _extract_fists(
        self,
        hand_data: Optional[HandData],
        l_pose_wr: Landmark,
        r_pose_wr: Landmark,
        sh_width: float,
    ) -> Dict[str, Optional[bool]]:
        """
        Returns fist states by pose body side.
        Mapping uses nearest pose wrist to avoid left/right confusion from mirrored cameras.
        A side can be None when that hand was not detected this frame.
        """
        fists: Dict[str, Optional[bool]] = {"left": None, "right": None}
        best_cost = {"left": float("inf"), "right": float("inf")}

        if not hand_data:
            return fists

        max_assign_dist = max(sh_width * 1.8, 0.08)

        for idx, hand_lms in enumerate(hand_data.landmarks):
            if len(hand_lms) < 1:
                continue
            handedness_entry = hand_data.handedness[idx] if idx < len(hand_data.handedness) else []

            hand_wr = hand_lms[0]
            d_left = self._dist2d(hand_wr, l_pose_wr)
            d_right = self._dist2d(hand_wr, r_pose_wr)
            if min(d_left, d_right) > max_assign_dist:
                continue

            side = "left" if d_left <= d_right else "right"
            score = self._hand_score(handedness_entry)
            side_dist = d_left if side == "left" else d_right
            cost = side_dist - (0.08 * sh_width * min(max(score, 0.0), 1.0))

            if cost <= best_cost[side]:
                best_cost[side] = cost
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
        l_el: Landmark,
        r_el: Landmark,
        l_wr: Landmark,
        r_wr: Landmark,
        l_sh: Landmark,
        r_sh: Landmark,
        mid_hip_xy: Optional[Tuple[float, float]],
        sh_width: float,
    ) -> bool:
        if sh_width < 1e-6:
            return False

        elbow_dist_ratio = self._dist2d(l_el, r_el) / sh_width
        elbows_close = elbow_dist_ratio <= self.block_elbow_close_ratio
        elbows_strong = elbow_dist_ratio <= self.block_elbow_strong_ratio

        mid_sh_x = (l_sh.x + r_sh.x) * 0.5
        mid_sh_y = (l_sh.y + r_sh.y) * 0.5
        if mid_hip_xy is not None:
            torso_h = math.hypot(mid_hip_xy[0] - mid_sh_x, mid_hip_xy[1] - mid_sh_y)
            torso_h = max(torso_h, sh_width * 0.8)
        else:
            torso_h = sh_width * 1.2

        guard_top = mid_sh_y + (torso_h * self.block_guard_top_ratio)
        guard_bottom = mid_sh_y + (torso_h * self.block_guard_bottom_ratio)
        in_guard = (
            guard_top <= l_el.y <= guard_bottom
            and guard_top <= r_el.y <= guard_bottom
        )

        lateral_joined = abs(l_el.y - r_el.y) <= (sh_width * self.block_elbow_lateral_y_ratio)

        mid_el_x = (l_el.x + r_el.x) * 0.5
        centered = abs(mid_el_x - mid_sh_x) <= (sh_width * self.block_center_ratio)

        wrists_in_guard = (
            (self._dist2d(l_wr, l_sh) / sh_width) <= self.block_wrist_guard_ext
            and (self._dist2d(r_wr, r_sh) / sh_width) <= self.block_wrist_guard_ext
        )

        if elbows_strong and lateral_joined and in_guard:
            return True
        if elbows_close and lateral_joined and centered and in_guard and wrists_in_guard:
            return True
        if elbows_close and in_guard and wrists_in_guard and centered:
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
        l_el = pose_landmarks[13]
        r_el = pose_landmarks[14]
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

        raw_fists = self._extract_fists(
            hand_data=hand_data,
            l_pose_wr=l_wr,
            r_pose_wr=r_wr,
            sh_width=sh_width,
        )
        fists = self._resolve_fists(raw_fists, ts_ms)

        hip_visible = self._visibility(l_hip) > 0.20 and self._visibility(r_hip) > 0.20
        mid_hip_xy = ((l_hip.x + r_hip.x) * 0.5, (l_hip.y + r_hip.y) * 0.5) if hip_visible else None

        elbows_visible = (
            self._visibility(l_el) >= self.elbow_vis_threshold
            and self._visibility(r_el) >= self.elbow_vis_threshold
        )
        block_candidate = False
        if elbows_visible:
            block_candidate = self._is_block_candidate(
                l_el=l_el,
                r_el=r_el,
                l_wr=l_wr,
                r_wr=r_wr,
                l_sh=l_sh,
                r_sh=r_sh,
                mid_hip_xy=mid_hip_xy,
                sh_width=sh_width,
            )

        hand_status = {side: {"detected": v is not None, "fist": bool(v)} for side, v in raw_fists.items()}

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
            return {"action": "idle", "side": "", "velocity": 0.0, "hand_status": hand_status}

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
            return {"action": "block", "side": "", "velocity": 1.0, "hand_status": hand_status}

        if block_candidate:
            return {"action": "idle", "side": "", "velocity": 0.0, "hand_status": hand_status}

        if ts_ms < self.suppress_hits_until:
            return {"action": "idle", "side": "", "velocity": 0.0, "hand_status": hand_status}

        detected = None
        per_idle = {"left": False, "right": False}
        per_speed = {"left": 0.0, "right": 0.0}
        frame_motion = {
            "left": {"speed": 0.0, "forward_vz": 0.0},
            "right": {"speed": 0.0, "forward_vz": 0.0},
        }
        hit_candidates: List[Dict[str, float]] = []

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
            frame_motion[side]["speed"] = speed
            frame_motion[side]["forward_vz"] = max(0.0, forward_vz)
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
                launch_signal = forward_vz > self.min_forward_vz and speed > (self.min_total_speed * 0.55) and (
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
                    score = (
                        (speed * 1.7)
                        + (max(0.0, forward_vz) * 1.15)
                        + (max(0.0, self.peak_ext[side] - self.ext_launch) * 0.8)
                        + (max(0.0, radial) * 0.45)
                    )
                    hit_candidates.append(
                        {
                            "side": side,
                            "velocity": float(speed),
                            "score": float(score),
                            "forward_vz": float(max(0.0, forward_vz)),
                        }
                    )

                timed_out = (ts_ms - self.launch_ts[side]) > self.launch_timeout_ms
                if timed_out or (ext < self.ext_idle and speed < 0.45):
                    self.state[side] = "ready"
                    self.peak_ext[side] = 0.0
                    self.launch_z[side] = 0.0
                    self.launch_ts[side] = 0.0

            elif st == "recover":
                if ext < self.ext_idle and speed < (self.idle_speed * 1.2):
                    self.state[side] = "ready"

        if hit_candidates:
            hit_candidates.sort(key=lambda x: x["score"], reverse=True)
            chosen = hit_candidates[0]

            if len(hit_candidates) > 1:
                second = hit_candidates[1]
                if (chosen["score"] - second["score"]) < self.dual_hit_score_margin:
                    chosen = None

            if chosen is not None:
                side = str(chosen["side"])
                other = "right" if side == "left" else "left"
                other_motion = frame_motion[other]
                side_motion = frame_motion[side]

                dominates_speed = side_motion["speed"] >= (
                    other_motion["speed"] + self.hit_side_speed_margin
                )
                dominates_vz = side_motion["forward_vz"] >= (
                    other_motion["forward_vz"] + self.hit_side_vz_margin
                )

                if dominates_speed or dominates_vz:
                    detected = {
                        "action": "hit",
                        "side": side,
                        "velocity": float(chosen["velocity"]),
                        "hand_status": hand_status,
                    }
                    self.last_action_ts[side] = ts_ms
                    self.state[side] = "recover"
                    self.peak_ext[side] = 0.0
                    self.launch_z[side] = 0.0
                    self.launch_ts[side] = 0.0

        if detected:
            return detected

        if per_idle["left"] and per_idle["right"]:
            return {
                "action": "idle",
                "side": "",
                "velocity": float(max(per_speed["left"], per_speed["right"])),
                "hand_status": hand_status
            }

        return {"action": "none", "side": "", "velocity": 0.0, "hand_status": hand_status}


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
