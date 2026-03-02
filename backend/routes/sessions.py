from uuid import uuid4
from fastapi import APIRouter
from state import SESSIONS, utc_now
from database.datab import leaderboard_col
router = APIRouter()

@router.post("/session/start")
def start_session():
    sid = uuid4().hex
    SESSIONS[sid] = {"points": 0, "player": "Player", "created_at": utc_now()}
    return {"session_id": sid}

@router.get("/leaderboard")
async def get_leaderboard():
    try:
        # Fetch top 10 from MongoDB
        cursor = leaderboard_col.find().sort("points", -1).limit(10)
        leaders = []
        async for doc in cursor:
            # Convert ObjectId and other non-serializable fields if needed
            leaders.append({
                "user_id": doc.get("user_id"),
                "display_name": doc.get("display_name", "Unknown"),
                "mode": doc.get("mode", "solo"),
                "points": doc.get("points", 0),
                "updated_at": doc.get("updated_at")
            })
        return {"leaders": leaders}
    except Exception as e:
        print(f"Error fetching leaderboard: {e}")
        return {"leaders": [], "error": str(e)}
