# auth/signup.py
'''This module defines the signup endpoint for the FastAPI application.
It allows new users to create an account by providing their email, password, and display name.
The endpoint checks if the email is already registered and returns a conflict error if it is.'''
from fastapi import APIRouter, HTTPException

from database.models import SignupIn, TokenOut
from auth.auth import hash_password, create_access_token
from database.db_users import db_get_user_by_email, db_create_user

router = APIRouter(prefix="/auth", tags=["auth"])
# The signup endpoint allows new users to create an account by providing their email, password, and display name.
@router.post("/signup", response_model=TokenOut)
def signup(payload: SignupIn):
    existing = db_get_user_by_email(payload.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = db_create_user(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        display_name=payload.display_name,
    )

    token = create_access_token(subject=user["id"])  # store id in JWT sub
    return {"access_token": token, "token_type": "bearer"}