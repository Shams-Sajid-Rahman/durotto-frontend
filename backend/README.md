# Durotto Backend (FastAPI)

An optional Python implementation of the Durotto API. The Next.js app ships with its own built-in API (`app/api`), so this backend is only needed if you want a separate Python service. Responses use the same shapes as the built-in API, so the frontend works unchanged with either.

## Stack

- **Python 3.11+** (tested on 3.13)
- **FastAPI 0.115** with Uvicorn
- **SQLAlchemy 2** + SQLite in development. Set `DATABASE_URL` to Postgres for production.
- **PyJWT** for access tokens, upload tokens and single-use WebSocket tickets
- **bcrypt** for password hashing
- **slowapi** for rate limiting, through one shared limiter (`limiter.py`)

## Setup

### 1. Create and activate a virtual environment

**Windows**
```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
```

**macOS / Linux**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt        # runtime
pip install -r requirements-dev.txt    # runtime + pytest/httpx for tests
```

### 3. Configure the environment

```bash
cp .env.example .env
```

Set `SECRET_KEY` to a random value (generate one with `openssl rand -hex 32`). With `ENV=production`, the server refuses to start without it.

| Variable | Default | Purpose |
|----------|---------|---------|
| `SECRET_KEY` | dev fallback | JWT signing key (required when `ENV=production`) |
| `ENV` | `development` | `production` makes a missing `SECRET_KEY` fatal |
| `DATABASE_URL` | `sqlite:///./durotto.db` | SQLAlchemy URL |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated CORS origins (`*` is ignored) |
| `UPLOADS_DIR` | `./uploads` | Where uploaded bytes are stored |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Access-token lifetime |
| `RATE_LIMIT_LOGIN` / `RATE_LIMIT_JOIN_CODE` | `5/minute` / `10/minute` | slowapi limit strings |
| `RATE_LIMIT_ENABLED` | `1` | Set to `0` to disable rate limiting |

### 4. Run the server

```bash
uvicorn main:app --reload --port 8000
```

The API is at <http://localhost:8000>, with interactive docs at <http://localhost:8000/docs>.

### 5. Point the frontend at it

In the Next.js project root, add this to `.env.local` and restart `npm run dev`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Real-time signaling then switches automatically from the built-in SSE relay to this backend's WebSocket hub.

## Tests

```bash
pytest
```

21 tests run against a throwaway SQLite database. They cover:

- **Auth:** registration and login, forged or wrong-type tokens, password change, rate limiting
- **Rooms:** member-only access and join-by-code with passwords
- **File uploads:** the upload flow, path-traversal protection, single-use upload URLs, type checks, per-user favourites, the Trash lifecycle
- **WebSocket hub:** tickets, presence, relay, sender stamping, persistence of chat and whiteboard events

## Directory layout

```
backend/
  main.py              FastAPI app, CORS, router mounts
  database.py          SQLAlchemy engine, SessionLocal, Base, get_db
  models.py            ORM models (User, Room, File, FileFavorite, Message, WhiteboardStroke, …)
  schemas.py           Pydantic models; field names match the frontend's TypeScript types
  auth.py              bcrypt, JWT helpers, WebSocket tickets, get_current_user
  limiter.py           the shared slowapi Limiter
  hub.py               in-memory registry of live WebSocket connections
  services.py          shared helpers (membership checks, file storage, notifications)
  routers/
    auth.py            /auth/{login,register,forgot-password,change-password}
    users.py           /users/me (+ settings, stats, sessions, export), /users/online
    rooms.py           CRUD, join-by-code, messages, files, whiteboard
    files.py           presign → upload → confirm, rename, favourites, trash, download
    notifications.py   list, mark read
    websocket.py       POST /ws/ticket and the /ws/{room_id} signaling hub
  tests/               pytest suite
```

## WebSocket protocol

1. `POST /ws/ticket` with `{"roomId": "..."}` and the bearer token returns `{"ticket": "..."}`. The ticket is single-use, valid for 30 seconds and bound to that room, so the long-lived JWT never appears in a URL or access log.
2. Connect to `ws://localhost:8000/ws/{room_id}?ticket=<ticket>`.

Send JSON frames of type `offer`, `answer`, `ice-candidate`, `chat-message`, `draw` or `cursor`:

```json
{ "type": "offer", "payload": { "type": "offer", "sdp": "..." }, "targetUserId": "abc123" }
{ "type": "chat-message", "payload": { "text": "hello" } }
```

Leave out `targetUserId` to broadcast to the room. The server stamps every relayed frame with `senderId` and `senderName`, so clients cannot spoof their identity. Unknown types and frames over 512 KB are dropped. Broadcast `chat-message` and `draw` frames are persisted for late joiners.

Server events:

- `{"type": "welcome", "payload": {"peers": [{"id", "name"}]}}` on connect
- `{"type": "peer-joined" | "peer-rejoined" | "peer-left", "senderId", "senderName"}`
- `{"type": "session-replaced"}` when the same user connects from somewhere else

Close codes: `4001` invalid or expired ticket, `4003` not a room member, `4004` room not found.

## Differences from the built-in API

- No `/admin/*` endpoints. The admin console needs the built-in Next.js API.
- `hoursOnline` in `/users/me/stats` is always `0`, because call durations aren't tracked.

## Production notes

- Replace `DATABASE_URL` with a Postgres URL and install `psycopg2-binary`. Use Alembic migrations instead of `create_all`.
- Replace the local `uploads/` store with S3-compatible object storage and real presigned URLs.
- The WebSocket hub and ticket store are in-memory. Run a single worker, or move them to Redis to scale out.
- Run behind a reverse proxy (nginx or Caddy) that terminates TLS and supports WebSocket upgrades.
- Use a process manager (gunicorn with uvicorn workers, or a container) instead of `--reload`.
