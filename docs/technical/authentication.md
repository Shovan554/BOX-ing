# Authentication flow

## Mechanism

- **Passwords**: hashed with **Argon2** (`passlib` via `auth/auth.py`).
- **Sessions**: **JWT** access tokens (`python-jose`), signed with `SECRET_KEY`, algorithm `HS256` by default.
- **Claims**: `sub` = user id (MongoDB `users._id` as string), `iat`, `exp` (`ACCESS_TOKEN_EXPIRE_MINUTES`, default 1440).

**Transport**: `Authorization: Bearer <access_token>` on HTTP requests. CORS does not use cookies; tokens are stored client-side (e.g. `localStorage` in the SPA).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/signup` | Body: email, password, display_name → returns `{ access_token, token_type: "bearer" }` |
| POST | `/auth/login` | Body: email, password → same token response |

## FastAPI dependencies

- **`get_current_user`** (`OAuth2PasswordBearer`, `tokenUrl=/auth/login`): requires valid JWT; loads user from MongoDB; returns 401 if invalid.
- **`get_current_user_optional`**: same token scheme but `auto_error=False`; returns `None` if missing or invalid.

## Protected vs optional routes

Examples:

- **`GET /me`** — requires `get_current_user`.
- **`POST /session/start`** — optional user; guest sessions get `user_id: null` and a generated display name when no token.
- **`POST /session/action`**, **`POST /session/submit`**, **`GET /session/{id}`** — ownership enforced when `user_id` is set on the session document.
- **`POST /multiplayer/record-win`** — requires authenticated user.

## Frontend behavior

`App.jsx` treats presence of `localStorage.access_token` as “authenticated” and redirects unauthenticated users to `/auth` after the intro, unless the route is already `/auth`.

## Security notes

- Keep `SECRET_KEY` long and random in production; rotate if leaked.
- Tokens in `localStorage` are vulnerable to XSS; mitigate with strict CSP and dependency hygiene.
- HTTPS is required in production for token confidentiality in transit.
