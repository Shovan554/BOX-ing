# auth.py
'''This module provides utility functions for handling authentication in the FastAPI application.
It includes functions for hashing and verifying passwords using the Argon2 algorithm, as well as
functions for creating and decoding JWT tokens for user authentication. The module defines constants 
for the secret key, algorithm, and token expiration time.
'''
import os
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from dotenv import load_dotenv
load_dotenv()

# The pwd_context is an instance of CryptContext configured to use the Argon2 hashing algorithm for password hashing and verification.
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# The SECRET_KEY is read from the environment variable and is used to sign and verify JWT tokens. If it is not set, a RuntimeError is raised.
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY is not set in environment")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

# The hash_password function takes a plain text password as 
# input and returns a hashed version of the password using the configured CryptContext.
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(subject: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> str:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    sub = payload.get("sub")
    if not sub:
        raise JWTError("Missing subject")
    return sub