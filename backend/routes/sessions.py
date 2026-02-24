from uuid import uuid4
from fastapi import APIRouter
from state import SESSIONS, LEADERBOARD, utc_now

router = APIRouter()

@router.post("/session/start")
def start_session():
    sid = uuid4().hex
    SESSIONS[sid] = {"points": 0, "player": "Player", "created_at": utc_now()}
    return {"session_id": sid}

@router.get("/leaderboard")
def get_leaderboard():
    leaders = sorted(LEADERBOARD.values(), key=lambda x: x["points"], reverse=True)
    return {"leaders": leaders}
