# Database schema (MongoDB)

Database name: from env `DB_NAME` (default **`userdata`**). Collections are created implicitly on first write.

## `users`

| Field | Type | Notes |
|-------|------|--------|
| `_id` | ObjectId | Primary key; exposed to API as string `id` |
| `email` | string | Lowercased, unique |
| `hashed_password` | string | Argon2 hash |
| `display_name` | string | Shown in UI and leaderboard |

Access: `database/db_users.py` (Motor async) via `users_col` from `database/datab.py`.

---

## `sessions`

One document per **gameplay session** (solo or multiplayer).

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | UUID hex (`session_id` in API) |
| `user_id` | string \| null | Owner’s user id if logged in |
| `player_name` | string | Display name for this session |
| `mode` | string | e.g. `solo`, `multiplayer` |
| `room_code` | string \| null | 6-digit style room when applicable |
| `is_matchmaking` | bool | |
| `is_matched` | bool | Set when matchmaking pairs players |
| `opponent_name` | string \| null | After match |
| `points` | number | Accumulated score |
| `created_at`, `ended_at` | ISO string | |
| `last_action` | object \| null | Last recorded action metadata |

Ownership checks on updates use `{ id, user_id }` when `user_id` is present.

---

## `rooms`

| Field | Type | Notes |
|-------|------|--------|
| `room_code` | string | Key used in URLs and WebSocket |
| `users` | array | Entries like `{ user_id, session_id, player_name }` |
| `created_at` | ISO string | |

Updated when players join via `/session/start` and when matchmaking creates a match.

---

## `leaderboard`

Best scores and multiplayer stats per user.

| Field | Type | Notes |
|-------|------|--------|
| `user_id` | string | Logical key |
| `display_name` | string | |
| `points` | number | Best score (solo-style tracking) |
| `multiplayer_wins` | number | Incremented via `/multiplayer/record-win` |
| `mode` | string \| null | From last qualifying session |
| `updated_at` | ISO string | |

Sort order for listing: `multiplayer_wins` desc, then `points` desc (see `GET /leaderboard`).

---

## `matchmaking`

Queue for players searching for a match.

| Field | Type | Notes |
|-------|------|--------|
| `session_id` | string | Waiting session |
| `created_at` | ISO string | |

When two players are paired, documents are removed and `sessions` / `rooms` are updated.

---

## `events`

Collection exists in `db.py` (`events_col`). Usage is reserved for future or legacy event logging; not all flows write here. Treat as **optional / future**.

---

## Indexes

The application relies on MongoDB default `_id` indexes. For production, add explicit indexes on `sessions.id`, `sessions.user_id`, `rooms.room_code`, `leaderboard.user_id`, `matchmaking.session_id`, and `users.email` if not already created.
