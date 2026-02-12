'''This module defines the authentication routes for the FastAPI application. 
It includes endpoints for user signup and login, as well as a dependency to get the current authenticated user based on the provided JWT token.
The module uses OAuth2 password flow for authentication and relies on utility functions for password hashing and token management.'''


from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from database.models import SignupIn, LoginIn, TokenOut
from auth.auth import hash_password, verify_password, create_access_token, decode_token
from database.db_users import ( db_get_user_by_email,db_create_user,db_get_user_by_id,)

router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
# The signup endpoint allows new users to create an account by providing their email, password, and display name.
@router.post("/signup", response_model=TokenOut)
def signup(payload: SignupIn):
    if db_get_user_by_email(payload.email):
        raise HTTPException(status_code=409, detail="Email already registered")

    user = db_create_user(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        display_name=payload.display_name,
    )

    token = create_access_token(subject=user["id"])
    return {"access_token": token, "token_type": "bearer"}

# The login endpoint allows existing users to authenticate by providing their email and password.
@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn):
    user = db_get_user_by_email(payload.email)
    if not user or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(subject=user["id"])
    return {"access_token": token, "token_type": "bearer"}

# The get_current_user function is a dependency that retrieves the current authenticated user based on the provided JWT token.
def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        user_id = decode_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db_get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user