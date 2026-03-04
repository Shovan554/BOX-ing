"""
This module defines the authentication routes for the FastAPI application.
It includes endpoints for user signup and login, as well as a dependency to get
the current authenticated user based on the provided JWT token.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError

from database.models import SignupIn, LoginIn, TokenOut
from auth.auth import hash_password, verify_password, create_access_token, decode_token
from database.db_users import (
    db_get_user_by_email,
    db_create_user,
    db_get_user_by_id,
)

from typing import Optional
router = APIRouter(prefix="/auth", tags=["auth"])

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
