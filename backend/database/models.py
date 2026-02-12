'''This file defines the Pydantic models for the database entities and API schemas.
The models include UserCreate and UserOut for user-related operations, SessionCreate,
SessionEnd, and SessionOut for session management, and SignupIn, LoginIn, and TokenOut for authentication.'''

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Dict, Any, List
from datetime import datetime

# Pydantic models for request validation and response serialization
class UserCreate(BaseModel):
    email: EmailStr
    displayName: str = Field(min_length=1, max_length=50)
# The UserCreate model defines the structure for creating a new user, requiring an email and a display
# name with specific length constraints.
class UserOut(BaseModel):
    id: str
    email: EmailStr
    displayName: str
    createdAt: datetime
# The UserOut model defines the structure for user data that will be returned in API responses, including the user's ID,
# email, display name, and creation timestamp.
class SessionCreate(BaseModel):
    userId: str
    mode: str = "freestyle"
    startedAt: datetime = Field(default_factory=datetime.utcnow)

class SessionEnd(BaseModel):
    endedAt: datetime = Field(default_factory=datetime.utcnow)
    summary: Optional[Dict[str, Any]] = None  # e.g. punchCount, rounds, etc.
# The SessionCreate model defines the structure for starting a new session,
# requiring a user ID, mode (with a default value), and a start timestamp.
class SessionOut(BaseModel):
    id: str
    userId: str
    mode: str
    startedAt: datetime
    endedAt: Optional[datetime] = None
    summary: Optional[Dict[str, Any]] = None

# The SessionOut model defines the structure for session data that will be returned in API responses, including the session ID,
class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: str = Field(min_length=1, max_length=40)
# The SignupIn model defines the structure for user signup requests, requiring an email, a password with a minimum length,

class LoginIn(BaseModel):
    email: EmailStr
    password: str
# The LoginIn model defines the structure for user login requests, requiring an email and a password.
class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"