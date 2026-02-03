from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Dict, Any, List
from datetime import datetime

class UserCreate(BaseModel):
    email: EmailStr
    displayName: str = Field(min_length=1, max_length=50)

class UserOut(BaseModel):
    id: str
    email: EmailStr
    displayName: str
    createdAt: datetime

class SessionCreate(BaseModel):
    userId: str
    mode: str = "freestyle"
    startedAt: datetime = Field(default_factory=datetime.utcnow)

class SessionEnd(BaseModel):
    endedAt: datetime = Field(default_factory=datetime.utcnow)
    summary: Optional[Dict[str, Any]] = None  # e.g. punchCount, rounds, etc.

class SessionOut(BaseModel):
    id: str
    userId: str
    mode: str
    startedAt: datetime
    endedAt: Optional[datetime] = None
    summary: Optional[Dict[str, Any]] = None
