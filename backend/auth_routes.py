"""
This module defines the authentication routes for the FastAPI application.
It includes endpoints for user signup and login, as well as a dependency to get
the current authenticated user based on the provided JWT token.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from pydantic import BaseModel, Field

from database.models import SignupIn, LoginIn, TokenOut
from auth.auth import hash_password, verify_password, create_access_token, decode_token
from database.datab import leaderboard_col
from database.db_users import (
    db_get_user_by_email,
    db_create_user,
    db_get_user_by_id,
    db_update_display_name,
    db_update_password,
)

from typing import Optional
router = APIRouter(prefix="/auth", tags=["auth"])


class ProfileUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=40)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


@router.post("/signup", response_model=TokenOut)
async def signup(payload: SignupIn):
    existing = await db_get_user_by_email(payload.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = await db_create_user(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        display_name=payload.display_name,
    )

    token = create_access_token(subject=user["id"])
    return {"access_token": token, "token_type": "bearer"}


@router.post("/login", response_model=TokenOut)
async def login(payload: LoginIn):
    user = await db_get_user_by_email(payload.email)
    if not user or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(subject=user["id"])
    return {"access_token": token, "token_type": "bearer"}


async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        user_id = decode_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await db_get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


async def get_current_user_optional(token: Optional[str] = Depends(oauth2_scheme_optional)):
    if not token:
        return None
    try:
        user_id = decode_token(token)
        user = await db_get_user_by_id(user_id)
        return user
    except Exception:
        return None


@router.get("/me/profile")
async def get_profile(current_user=Depends(get_current_user)):
    user_id = current_user["id"]
    leaderboard_doc = await leaderboard_col.find_one({"user_id": user_id})
    return {
        "id": user_id,
        "email": current_user.get("email"),
        "display_name": current_user.get("display_name"),
        "stats": {
            "multiplayer_wins": int((leaderboard_doc or {}).get("multiplayer_wins", 0)),
            "best_points": int((leaderboard_doc or {}).get("points", 0)),
        },
    }


@router.patch("/me/profile")
async def update_profile(payload: ProfileUpdate, current_user=Depends(get_current_user)):
    new_name = payload.display_name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Display name cannot be empty")

    updated = await db_update_display_name(current_user["id"], new_name)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update profile")

    # Mirror the new display name on the leaderboard so it shows up correctly
    await leaderboard_col.update_one(
        {"user_id": current_user["id"]},
        {"$set": {"display_name": new_name}},
    )

    return {
        "id": updated["id"],
        "email": updated.get("email"),
        "display_name": updated.get("display_name"),
    }


@router.post("/me/password")
async def change_password(payload: PasswordChange, current_user=Depends(get_current_user)):
    if not verify_password(payload.current_password, current_user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="New password must differ from the current one")

    new_hash = hash_password(payload.new_password)
    ok = await db_update_password(current_user["id"], new_hash)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to update password")

    return {"ok": True}
