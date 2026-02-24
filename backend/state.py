from typing import Dict
from datetime import datetime, timezone

SESSIONS: Dict[str, dict] = {}
LEADERBOARD: Dict[str, dict] = {}

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()

def compute_points(action: str, velocity: float) -> int:
    base = 10 if action == "jab" else 5
    bonus = int(max(0.0, min(velocity or 0.0, 2000.0)) * 0.1)
    return base + bonus
