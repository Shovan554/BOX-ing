from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from pymongo import ReturnDocument
from bson import ObjectId

from db import sessions_col, leaderboard_col


app = FastAPI(title="BOX-ing Placeholder API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def serialize_mongo(obj):
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, dict):
        return {k: serialize_mongo(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [serialize_mongo(v) for v in obj]
    return obj


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


def update_leaderboard(session: dict) -> None:
    player = session.get("player_name") or "Player"
    record = {
        "player_name": player,
        "points": session.get("points", 0),
        "mode": session.get("mode"),
        "updated_at": utc_now(),
    }

    current = leaderboard_col.find_one({"player_name": player})
    current_points = (current or {}).get("points", 0)

    if record["points"] >= current_points:
        leaderboard_col.update_one(
            {"player_name": player},
            {"$set": record},
            upsert=True,
        )


@app.get("/")
def root() -> dict:
    return {"service": "BOX-ing Placeholder API", "status": "ok", "time": utc_now()}


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "time": utc_now()}


@app.post("/session/start")
def start_session(payload: SessionStart) -> dict:
    session_id = uuid4().hex
    session = {
        "id": session_id,
        "player_name": (payload.player_name or "Player").strip() or "Player",
        "mode": payload.mode,
        "room_code": payload.room_code,
        "points": 0,
        "created_at": utc_now(),
        "ended_at": None,
        "last_action": None,
    }

    sessions_col.insert_one(session.copy())  # prevent _id mutation in return dict
    return session


@app.get("/session/{session_id}")
def get_session(session_id: str) -> dict:
    session = sessions_col.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return serialize_mongo(session)


@app.post("/session/action")
def record_action(payload: ActionEvent) -> dict:
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
        {"id": payload.session_id},
        {"$inc": {"points": points}, "$set": {"last_action": last_action}},
        return_document=ReturnDocument.AFTER,
    )

    if not updated:
        raise HTTPException(status_code=404, detail="Session not found")

    updated = serialize_mongo(updated)
    update_leaderboard(updated)

    return {
        "session_id": payload.session_id,
        "action_type": action_type,
        "points": points,
        "total_points": updated["points"],
        "time": utc_now(),
    }


@app.post("/session/submit")
def submit_session(payload: SessionSubmit) -> dict:
    updated = sessions_col.find_one_and_update(
        {"id": payload.session_id},
        {"$set": {"ended_at": utc_now()}},
        return_document=ReturnDocument.AFTER,
    )

    if not updated:
        raise HTTPException(status_code=404, detail="Session not found")

    updated = serialize_mongo(updated)
    update_leaderboard(updated)

    return {"session_id": payload.session_id, "final_points": updated["points"]}


@app.get("/leaderboard")
def leaderboard(limit: int = 10) -> dict:
    limit = max(1, min(limit, 50))
    leaders = leaderboard_col.find().sort("points", -1).limit(limit)
    return {"leaders": [serialize_mongo(doc) for doc in leaders]}


@app.post("/webrtc/offer")
def webrtc_offer(payload: WebRTCOffer) -> dict:
    return {
        "detail": "WebRTC signaling not implemented yet",
        "echo": {"type": payload.type, "sdp_length": len(payload.sdp)},
        "time": utc_now(),
    }