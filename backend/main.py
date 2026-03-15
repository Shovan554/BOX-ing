from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4
from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from routes.detection import router as detection_router
from routes.sessions import router as sessions_router
from database.datab import check_db_connection
from auth_routes import router as auth_router, get_current_user, get_current_user_optional
from pymongo import ReturnDocument
from bson import ObjectId
from db import sessions_col, leaderboard_col
from state import SESSIONS
from typing import List, Dict

# Matchmaking queue: list of user_id or session_id
# For simplicity, we'll store session_id here.
MATCHMAKING_QUEUE: List[str] = []
# Map session_id to match data (room_code, player_name, opponent_name)
MATCHED_SESSIONS: Dict[str, dict] = {}

#setting up server and CORS
app = FastAPI(title="BOX-ing API", version="0.3.0")

@app.on_event("startup")
async def startup_db_client():
    connected = await check_db_connection()
    if connected:
        print("Successfully connected to MongoDB Atlas (userdata database)")
    else:
        print("CRITICAL: Failed to connect to MongoDB Atlas")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for request validation
class SessionStart(BaseModel):
    player_name: str = Field(default="Player", min_length=1, max_length=40)
    mode: str = Field(default="solo", max_length=16)
    room_code: Optional[str] = Field(default=None, max_length=16)


class ActionEvent(BaseModel):
    session_id: str
    action_type: str = Field(description="jab | block")
    velocity: Optional[float] = Field(default=0.0, ge=0.0)


class SessionSubmit(BaseModel):
    session_id: str


class WebRTCOffer(BaseModel):
    sdp: str
    type: str
    
# Helper functions
def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()

# MongoDB returns ObjectId objects which are not JSON serializable. 
# This helper function converts them to strings recursively in any nested structure.
def serialize_mongo(obj):
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, dict):
        return {k: serialize_mongo(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [serialize_mongo(v) for v in obj]
    return obj

# The compute_points function calculates points based on the action type and velocity.
def compute_points(action_type: str, velocity: float) -> int:
    if action_type == "jab":
        base = 10
    elif action_type == "block":
        base = 5
    else:
        raise ValueError("Unknown action_type")

    velocity = max(0.0, min(float(velocity or 0.0), 2000.0))
    bonus = int(velocity * 0.1)
    return base + bonus

# The update_leaderboard function updates the leaderboard with the user's best score.
# It checks if the current session's points are greater than or equal to the existing points for that user and updates accordingly.
# This ensures that users see their best scores reflected on the leaderboard.
def update_leaderboard(session: dict, current_user: dict) -> None:
    user_id = session.get("user_id")
    if not user_id:
        return

    record = {
        "user_id": user_id,
        "display_name": current_user.get("display_name") or session.get("player_name") or "Player",
        "points": session.get("points", 0),
        "mode": session.get("mode"),
        "updated_at": utc_now(),
    }

    current = leaderboard_col.find_one({"user_id": user_id})
    current_points = (current or {}).get("points", 0)

    if record["points"] >= current_points:
        leaderboard_col.update_one(
            {"user_id": user_id},
            {"$set": record},
            upsert=True,
        )

# API endpoints

@app.post("/matchmaking/join")
def join_matchmaking(session_id: str, current_user=Depends(get_current_user_optional)) -> dict:
    if session_id in MATCHMAKING_QUEUE:
        return {"status": "searching", "session_id": session_id}
    
    # If there's someone in the queue, match them
    if MATCHMAKING_QUEUE:
        opponent_sid = MATCHMAKING_QUEUE.pop(0)
        room_code = f"room_{uuid4().hex[:8]}"
        
        player_name = SESSIONS.get(session_id, {}).get("player_name", "Player")
        opponent_name = SESSIONS.get(opponent_sid, {}).get("player_name", "Player")
        
        # Update both sessions in MongoDB and memory
        for sid in [session_id, opponent_sid]:
            # Each player sees themselves as 'player' and other as 'opponent'
            # But for simplicity, we'll store specific names
            MATCHED_SESSIONS[sid] = {
                "room_code": room_code,
                "player_name": player_name if sid == session_id else opponent_name,
                "opponent_name": opponent_name if sid == session_id else player_name
            }
            sessions_col.update_one({"id": sid}, {"$set": {"room_code": room_code}})
            if sid in SESSIONS:
                SESSIONS[sid]["room_code"] = room_code
                
        return {"status": "matched", **MATCHED_SESSIONS[session_id]}
    
    # Otherwise, add to queue
    MATCHMAKING_QUEUE.append(session_id)
    return {"status": "searching", "session_id": session_id}

@app.get("/matchmaking/status/{session_id}")
def matchmaking_status(session_id: str) -> dict:
    if session_id in MATCHED_SESSIONS:
        return {"status": "matched", **MATCHED_SESSIONS[session_id]}
    if session_id in MATCHMAKING_QUEUE:
        return {"status": "searching"}
    return {"status": "not_in_queue"}

class ConnectionManager:
    def __init__(self):
        # room_code -> list of websockets
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_code: str):
        await websocket.accept()
        if room_code not in self.active_connections:
            self.active_connections[room_code] = []
        self.active_connections[room_code].append(websocket)

    def disconnect(self, websocket: WebSocket, room_code: str):
        if room_code in self.active_connections:
            self.active_connections[room_code].remove(websocket)
            if not self.active_connections[room_code]:
                del self.active_connections[room_code]

    async def broadcast(self, message: dict, room_code: str, exclude_websocket: Optional[WebSocket] = None):
        if room_code in self.active_connections:
            for connection in self.active_connections[room_code]:
                if connection != exclude_websocket:
                    await connection.send_json(message)

manager = ConnectionManager()

@app.websocket("/ws/{room_code}")
async def websocket_endpoint(websocket: WebSocket, room_code: str):
    await manager.connect(websocket, room_code)
    try:
        while True:
            # Expected data: {"session_id": "...", "action": "Left_Hit" | "Right_Hit" | "Block" | "Idle"}
            data = await websocket.receive_json()
            # Broadcast to everyone else in the room
            await manager.broadcast(data, room_code, exclude_websocket=websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_code)
        # Notify others that this player disconnected
        await manager.broadcast({"type": "disconnect"}, room_code)

# Root endpoint for quick status check
@app.get("/")
def root() -> dict:
    return {"service": "BOX-ing Placeholder API", "status": "ok", "time": utc_now()}

app.include_router(auth_router)
app.include_router(detection_router)

# Protected endpoint to get current user info
@app.get("/me")
def me(current_user=Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "display_name": current_user.get("display_name"),
    }

# Session management endpoints
# This ensures that users can only modify their own sessions and not interfere with others.
# that users see their best scores reflected on the leaderboard.

# All session-related endpoints require authentication and enforce ownership checks
# When starting a session, we create a new session document with the current user's ID as the owner.

@app.post("/session/start")
def start_session(payload: Optional[SessionStart] = None, current_user=Depends(get_current_user_optional)) -> dict:
    if payload is None:
        payload = SessionStart()
    session_id = uuid4().hex
    user_id = current_user["id"] if current_user else None
    
    # Priority: DB display_name > Payload player_name > "Guest"
    display_name = "Guest"
    if current_user and current_user.get("display_name"):
        display_name = current_user["display_name"]
    elif payload and payload.player_name and payload.player_name != "Player":
        display_name = payload.player_name
    elif payload and payload.player_name == "Player" and not current_user:
        display_name = "Player"

    session = {
        "id": session_id,
        "user_id": user_id,  # ✅ session ownership
        "player_name": display_name.strip(),
        "mode": payload.mode if payload else "solo",
        "room_code": payload.room_code,
        "points": 0,
        "created_at": utc_now(),
        "ended_at": None,
        "last_action": None,
    }

    sessions_col.insert_one(session.copy())
    
    # Also store in memory for WebSocket detection
    SESSIONS[session_id] = session.copy()
    
    return session



@app.get("/session/{session_id}")
def get_session(session_id: str, current_user=Depends(get_current_user_optional)) -> dict:
    user_id = current_user["id"] if current_user else None
    session = sessions_col.find_one({"id": session_id, "user_id": user_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found (or not yours)")
    return serialize_mongo(session)

# When recording an action or submitting a session, we check that the session belongs to the current user before allowing updates.

@app.post("/session/action")
def record_action(payload: ActionEvent, current_user=Depends(get_current_user_optional)) -> dict:
    user_id = current_user["id"] if current_user else None
    action_type = payload.action_type.lower().strip()
    if action_type not in {"jab", "block"}:
        raise HTTPException(status_code=400, detail="action_type must be jab or block")

    points = compute_points(action_type, payload.velocity or 0.0)
    last_action = {
        "action_type": action_type,
        "velocity": float(payload.velocity or 0.0),
        "points": points,
        "time": utc_now(),
    }

    updated = sessions_col.find_one_and_update(
        {"id": payload.session_id, "user_id": user_id},  # ✅ ownership check
        {"$inc": {"points": points}, "$set": {"last_action": last_action}},
        return_document=ReturnDocument.AFTER,
    )

    if not updated:
        raise HTTPException(status_code=404, detail="Session not found (or not yours)")

    updated = serialize_mongo(updated)
    update_leaderboard(updated, current_user=current_user)  # updated function below

    return {
        "session_id": payload.session_id,
        "action_type": action_type,
        "points": points,
        "total_points": updated["points"],
        "time": utc_now(),
    }
#` When a session is submitted, we mark it as ended and update the leaderboard with the final points. 
# This ensures that users see their best scores reflected on the leaderboard.

@app.post("/session/submit")
def submit_session(payload: SessionSubmit, current_user=Depends(get_current_user_optional)) -> dict:
    user_id = current_user["id"] if current_user else None
    updated = sessions_col.find_one_and_update(
        {"id": payload.session_id, "user_id": user_id},  # ✅ ownership check
        {"$set": {"ended_at": utc_now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Session not found (or not yours)")
    updated = serialize_mongo(updated)
    update_leaderboard(updated, current_user=current_user)
    return {"session_id": payload.session_id, "final_points": updated["points"]}

# The leaderboard is updated whenever a session's points are updated or when a session is submitted, ensuring 

@app.get("/leaderboard")
def leaderboard(limit: int = 10) -> dict:
    limit = max(1, min(limit, 50))
    leaders = leaderboard_col.find().sort("points", -1).limit(limit)
    return {"leaders": [serialize_mongo(doc) for doc in leaders]}


# The WebRTC signaling endpoint is a placeholder for future implementation. It currently just echoes back the received offer details.
@app.post("/webrtc/offer")
def webrtc_offer(payload: WebRTCOffer) -> dict:
    return {
        "detail": "WebRTC signaling not implemented yet",
        "echo": {"type": payload.type, "sdp_length": len(payload.sdp)},
        "time": utc_now(),
    }
    