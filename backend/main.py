from __future__ import annotations

import sys
import os

# Add the current directory to sys.path so we can import local modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.detection import router as detection_router
from routes.sessions import router as sessions_router
from database.db import check_db_connection

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

# Include Routers
app.include_router(sessions_router, tags=["Sessions"])
app.include_router(detection_router, tags=["Detection"])

@app.get("/")
def root():
    return {"status": "ok", "message": "BOX-ing Modular Backend API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
