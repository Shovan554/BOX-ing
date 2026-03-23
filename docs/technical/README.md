# BOX-ing — Technical Documentation

This folder contains technical documentation for the BOX-ing project: stack, architecture, persistence, auth, APIs, and code layout.

| Document | Contents |
|----------|----------|
| [architecture.md](./architecture.md) | System architecture, major components, data flow |
| [database-schema.md](./database-schema.md) | MongoDB collections and document shapes |
| [authentication.md](./authentication.md) | JWT, signup/login, protected routes |
| [api-and-websockets.md](./api-and-websockets.md) | REST endpoints and WebSocket protocols |
| [module-structure.md](./module-structure.md) | Repository layout (backend and frontend) |

## Tech stack (summary)

| Layer | Technologies |
|-------|----------------|
| **Frontend** | React 19, Vite, React Router, Tailwind CSS, Three.js (`@react-three/fiber`, `@react-three/drei`), MediaPipe (`@mediapipe/tasks-vision`) |
| **Backend** | Python 3, FastAPI, Uvicorn, Pydantic |
| **Database** | MongoDB Atlas (PyMongo + Motor) |
| **Auth** | JWT (`python-jose`), Argon2 passwords (`passlib`), Bearer tokens in `Authorization` header |
| **Realtime** | Starlette/FastAPI WebSockets (room relay + optional server-side pose detection) |

Gesture detection for **multiplayer** runs in the **browser** (`boxingLocalDetect.js` + MediaPipe). The **server** can optionally run pose classification on landmarks via `/ws/detect/{session_id}` (see `routes/detection.py`).

## Environment variables (reference)

**Backend** (typical `.env`):

- `MONGODB_URI`, `DB_NAME` — MongoDB connection
- `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES` — JWT
- `MONGODB_URI` (required in `db.py`)

**Frontend** (`Vite`):

- `VITE_API_URL` — HTTP API origin (e.g. `https://api.example.com`)
- `VITE_WS_URL` — WebSocket origin (optional; derived from `VITE_API_URL` if unset)
