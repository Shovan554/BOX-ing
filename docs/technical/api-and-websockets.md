# API and WebSocket communication

Base URL: from `VITE_API_URL` or `http://<host>:8000` in development. WebSocket base: `VITE_WS_URL` or derived from the API URL (`http` → `ws`, `https` → `wss`).

---

## REST (selected)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Health: `{ service, status }` |
| POST | `/auth/signup`, `/auth/login` | Register and login (see [authentication.md](./authentication.md)) |
| GET | `/me` | Current user (Bearer required) |
| POST | `/session/start` | Create session; body optional `SessionStart` (player_name, mode, room_code, is_matchmaking) |
| GET | `/session/{session_id}` | Get own session (optional auth; ownership enforced) |
| POST | `/session/action` | Record jab/block-style action; increments points |
| POST | `/session/submit` | End session |
| GET | `/leaderboard` | Query param `limit` (default 10, max 50) |
| POST | `/matchmaking/join` | Query `session_id`; pair or enqueue |
| POST | `/matchmaking/leave` | Query `session_id` |
| GET | `/matchmaking/status/{session_id}` | `searching` \| `matched` \| `not_in_queue` |
| GET | `/room/{room_code}` | Room document (serialized) |
| GET | `/room/{room_code}/status` | Waiting vs ready when 2 players |
| POST | `/multiplayer/record-win` | Increment `multiplayer_wins` (Bearer) |
| POST | `/webrtc/offer` | Placeholder echo |

Exact request/response bodies are defined by Pydantic models in `backend/main.py` and `backend/database/models.py` where applicable.

---

## WebSocket: room relay

**URL:** `WS /ws/{room_code}/{session_id}`

- **Server** accepts JSON, injects `session_id` (sender’s id), then **broadcasts** to every other WebSocket in the same `room_code`.
- **No** server-side game logic; messages are forwarded as-is.

**Typical client messages (multiplayer):**

| Type | Purpose |
|------|---------|
| `{ type: "gesture", motion, ts?, perf?, seq? }` | Local pose outcome (e.g. `left_hit`, `right_hit`, `block`) |
| `{ type: "health", hp }` | Sync HP after taking damage |
| `{ type: "hit_absorbed", absorbed: "block", ... }` | Punch blocked on defender |

**Other clients receive** the same JSON with `session_id` set to the sender.

---

## WebSocket: server-side detection

**URL:** `WS /ws/detect/{session_id}`

- Client sends frames with `landmarks` (pose), optional `hand_data`, `timestamp`.
- Server runs **`BoxingDetector`** in `routes/detection.py` and responds with JSON like:

```json
{
  "action": "hit" | "block" | "idle" | "none",
  "side": "left" | "right" | "",
  "points": 0,
  "velocity": 0.0,
  "hand_status": { ... },
  "total_points": 0
}
```

- Points may be accumulated in in-memory `SESSIONS[session_id]` for that session.

**Note:** Multiplayer arena in the browser uses **local** `detectLocalMotion` and the **room** WebSocket, not this endpoint, unless you wire a page to both.

---

## Rate and ordering

Room relay does not guarantee ordering across clients; latency varies. Multiplayer hit/block resolution uses **client-side** timestamps and local pose history (see `MultiplayerArena.jsx`).
