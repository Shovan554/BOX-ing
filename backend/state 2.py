from typing import Dict
from datetime import datetime, timezone

SESSIONS: Dict[str, dict] = {}
LEADERBOARD: Dict[str, dict] = {}

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()

def compute_points(action: str, velocity: float) -> int:
    if action == "hit":
        base = 10
    elif action == "block":
        base = 5
    else:
        base = 0
    
    # Velocity is usually small (around 1.0-5.0), so scale bonus appropriately
    bonus = int(max(0.0, min(velocity or 0.0, 50.0)) * 2)
    return base + bonus
