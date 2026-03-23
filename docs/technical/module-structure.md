# Module and file structure

Repository root layout (high level):

```
BOX-ing/
├── backend/          # FastAPI application
├── frontend/         # Vite + React SPA
└── docs/technical/   # This documentation set
```

---

## Backend (`backend/`)

| Path | Role |
|------|------|
| `main.py` | FastAPI app, CORS, REST routes (sessions, rooms, matchmaking, leaderboard, WebRTC stub), room WebSocket |
| `db.py` | Sync **PyMongo** client and collections (`sessions`, `rooms`, `leaderboard`, `matchmaking`, `events`, `users`) |
| `state.py` | In-memory `SESSIONS` dict for detection WebSocket scoring |
| `auth_routes.py` | `/auth/*`, JWT dependencies, re-exports user deps |
| `auth/auth.py` | JWT encode/decode, Argon2 password hashing |
| `routes/detection.py` | `BoxingDetector`, WebSocket `/ws/detect/{session_id}` |
| `database/datab.py` | **Motor** async Mongo client, `check_db_connection` |
| `database/db_users.py` | Async user CRUD by email/id |
| `database/models.py` | Pydantic models for auth payloads |

---

## Frontend (`frontend/src/`)

| Path | Role |
|------|------|
| `main.jsx` | React root |
| `App.jsx` | Routes, intro, auth redirect, global UI chrome |
| `config/api.js` | `API_BASE_URL`, `WS_BASE_URL` from Vite env |
| `pages/` | Screen-level components: `LandingPage`, `MainMenu`, `AuthPage`, `CameraTest`, `Multiplayer`, `MultiplayerArena`, `CreateRoom`, `Leaderboard`, `Settings`, `Results` |
| `components/` | UI pieces: `NinjaModel`, `HealthBar`, `MatchEndOverlay`, `Intro`, `GameHUD`, etc. |
| `hooks/` | `usePoseDetection`, `useHandDetection`, `useGameState`, `useDetectionEvents`, etc. |
| `utils/boxingLocalDetect.js` | Shared pose analysis: `analyzeLocalPose`, `detectLocalMotion`, `DEFAULT_BOXING_THRESHOLDS` |

Static assets and build output live under `frontend/public` and `frontend/dist` (build).

---

## Conventions

- **Gesture naming**: `idle`, `left_hit`, `right_hit`, `block` (aligned with `NinjaModel` actions).
- **Environment**: `VITE_*` variables are compile-time for Vite; rebuild after changing them.
