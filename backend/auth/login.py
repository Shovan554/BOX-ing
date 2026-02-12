# auth/login.py

'''This module defines the login endpoint for the FastAPI application.
It allows existing users to authenticate by providing their email and password.
The endpoint checks if the provided credentials are valid and returns a JWT token if they are.'''

from fastapi import APIRouter, HTTPException

from database.models import LoginIn, TokenOut
from auth.auth import verify_password, create_access_token
from database.db_users import db_get_user_by_email

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn):
    user = db_get_user_by_email(payload.email)
    if not user or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(subject=user["id"])
    return {"access_token": token, "token_type": "bearer"}