# BOX-ing

BOX-ing is a real-time, webcam-controlled boxing game where body gestures drive 3D fighter actions in multiplayer matches.

## Live Deployment

- **Frontend (Game UI):** [https://box-ing-1d6g.onrender.com/](https://box-ing-1d6g.onrender.com/)
- **Backend (API + WebSocket):** [https://box-ing.onrender.com/](https://box-ing.onrender.com/)

## Backend Wake-Up (Render Sleep)

The backend service may sleep after about 15 minutes of inactivity on Render free tier.
Before a demo or multiplayer match, wake it up once:

```bash
curl https://box-ing.onrender.com/
```

Then open the frontend URL.

## Core Features

- Real-time gesture detection (`left_hit`, `right_hit`, `block`) using MediaPipe Pose.
- Multiplayer matchmaking and private-room play with low-latency WebSocket sync.
- 3D arena rendering with React Three Fiber/Drei and animated fighter models.
- Leaderboard integration for authenticated users.
- Camera test mode for pose debugging and threshold calibration.

## Tech Stack

### Frontend

- React + Vite
- React Router
- Three.js via `@react-three/fiber` and `@react-three/drei`
- MediaPipe Tasks Vision (`@mediapipe/tasks-vision`)
- Framer Motion

### Backend

- Python + FastAPI
- Uvicorn
- WebSockets (Starlette/FastAPI)
- MongoDB Atlas
- JWT auth + Argon2 password hashing

## Local Setup

### Prerequisites

- Node.js 18+
- Python 3.11+
- Webcam access

### 1) Run backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Windows activate command:

```bash
.venv\Scripts\activate
```

### 2) Run frontend

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

### Frontend (`frontend/.env`)

- `VITE_API_URL` - backend HTTP origin
- `VITE_WS_URL` - backend WS origin (optional; can be derived)

### Backend (`backend/.env`)

- `MONGODB_URI`
- `DB_NAME`
- `SECRET_KEY`
- `ALGORITHM`
- `ACCESS_TOKEN_EXPIRE_MINUTES`

## Project Docs

- Project overview: `PROJECT_OVERVIEW.md`
- Presentation architecture: `PRESENTATION_ARCHITECTURE.md`
- Technical docs index: `docs/technical/README.md`
- Backend-specific notes: `backend/README.md`

## Project Structure

- `frontend/` - game client, pose hooks, arena UI, multiplayer pages
- `backend/` - FastAPI routes, matchmaking, sessions, WebSocket relays
- `docs/technical/` - architecture, database schema, API and auth docs
