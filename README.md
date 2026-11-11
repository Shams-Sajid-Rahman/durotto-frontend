# Durotto

Durotto is a real-time communication app. It has video meeting rooms, live chat, a shared whiteboard, file sharing, notifications and an admin console.

It is built with **Next.js 16 / React 19** and works out of the box with its built-in API: no database server, message broker or Python needed. An optional **FastAPI** backend in [`backend/`](backend/) implements the same API for teams that want a separate Python service.

---

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Scripts](#scripts)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Real-time signaling protocol](#real-time-signaling-protocol)
- [API reference](#api-reference)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Using the FastAPI backend](#using-the-fastapi-backend)
- [Deployment](#deployment)
- [Security](#security)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

---

## Features

| Area | What you get |
|------|--------------|
| **Landing page** (`/`) | Responsive public front page with an interactive WebGL hero built with three.js and React Three Fiber, 3D tilt cards and scroll animations. It adapts to signed-in users, respects reduced-motion settings, falls back to a static design without WebGL, and loads the 3D code only on this page. |
| **Meetings** | Create rooms (optionally password-protected) and join with a 6-character code. Calls are peer-to-peer WebRTC video/audio with screen sharing, mic/camera toggles and live participant presence. |
| **In-call chat** | Text and file messages for everyone in the room. History is saved, so late joiners see earlier messages. |
| **Whiteboard** | A shared canvas with pen, shapes, text, sticky notes and an eraser. Edits, moves, undo/redo and live cursors sync to everyone, and the board persists for late joiners. `/whiteboard` is a personal board. **Save** stores a PNG in Files with the editable board embedded, so **Open in Whiteboard** brings it back fully editable; Save then updates that file and **Save copy** creates a new one. Any other image can be opened to draw on. |
| **Files** | Upload, download, rename, favourite (per user), move to Trash, restore and permanently delete files. Files shared into a room are visible to that room's members. Each user has a 10 GB quota. |
| **Notifications** | Notifications for "X joined your room", "file shared in your room" and a welcome message, with live unread badges. |
| **Dashboard** | Your rooms, people in calls right now, and recent activity. |
| **Account** | Edit your profile and avatar, change your password, choose dark/light/system theme, set notification preferences, view recent sign-ins, export your data as JSON, and delete your account. |
| **Admin console** (`/admin`) | Usage stats, user management (create, edit, suspend, delete), login history, call history (start, duration, participants) and a database browser. |

---

## Quick start

**Requirements:** Node.js **20.9+** and npm.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. In development the database seeds itself on first use with two accounts:

| Account | Email | Password |
|---------|-------|----------|
| Admin (use the **Admin** tab on the login page, or `/admin/login`) | `admin@gmail.com` | `admin123` |
| Regular user | `demo@durotto.app` | `demo1234` |

These well-known accounts are **never** created in production (see [Configuration](#configuration)).

To try a call, sign in as two different users (for example, one in a private window) and create a room with one of them. The room header shows the join code; the other user enters it under **Join Meeting**. Camera and microphone need `localhost` or HTTPS.

Data lives in `.data/` (`db.json` plus an `uploads/` folder). Delete that folder to start fresh. It is gitignored because it contains password hashes and user files.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build (includes type checking) |
| `npm start` | Serve the production build (requires `AUTH_SECRET`) |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run the test suite once (Vitest) |
| `npm run test:watch` | Tests in watch mode |

---

## Configuration

Copy [`.env.example`](.env.example) to `.env.local`. Every variable is optional in development.

| Variable | Default | Purpose |
|----------|---------|---------|
| `AUTH_SECRET` | dev-only fallback | HMAC secret for auth tokens. **Required in production.** The server refuses to issue tokens without it. |
| `AUTH_TOKEN_TTL_SECONDS` | `604800` (7 days) | Access-token lifetime |
| `DUROTTO_ADMIN_EMAIL` / `DUROTTO_ADMIN_PASSWORD` | dev: `admin@gmail.com` / `admin123` | Admin account created when the database is first seeded. In production no admin is created unless both are set. |
| `DUROTTO_SEED_DEMO` | `1` | Set to `0` to skip the demo user in development |
| `DUROTTO_DB_PATH` | `.data/db.json` | Location of the JSON database |
| `DUROTTO_UPLOADS_DIR` | `.data/uploads` | Where uploaded file bytes are stored |
| `DUROTTO_MAX_UPLOAD_BYTES` | `104857600` (100 MB) | Per-file upload limit |
| `TRUST_PROXY` | unset | Set to `1` behind a reverse proxy so `X-Forwarded-For` is used for client IPs (rate limits, login history) |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | CORS origin for the API (only matters for cross-origin callers) |
| `NEXT_PUBLIC_API_URL` | `/api` | Where the browser sends API calls. Set to `http://localhost:8000` to use the FastAPI backend. |
| `NEXT_PUBLIC_SIGNALING` | inferred | `http` (SSE + POST, built-in API) or `websocket` (FastAPI). Inferred from `NEXT_PUBLIC_API_URL`. |
| `NEXT_PUBLIC_ICE_SERVERS_ENDPOINT` | unset | URL returning `{"iceServers": [...]}` (for example, TURN credentials). Without it, public Google STUN servers are used. |

`NEXT_PUBLIC_*` values are compiled into the client bundle and the CSP, so rebuild after changing them.

---

## Architecture

```text
 Browser (Next.js client components)
  ├─ lib/api.ts ─────────── REST (fetch, Bearer token) ──┐
  ├─ lib/webrtc/signaling.ts ─ SSE stream + POST ────────┤
  └─ WebRTC media ◄──────── peer-to-peer (STUN/TURN) ────┼──► other browsers
                                                         ▼
 Next.js route handlers  app/api/**/route.ts
  ├─ lib/server/auth.ts            auth, admin guard, rate limiting
  ├─ lib/server/access.ts          room membership & file permission checks
  ├─ lib/server/signaling-hub.ts   in-memory relay, chat/whiteboard persistence, call records
  ├─ lib/server/db.ts              JSON file database (atomic writes)
  └─ lib/server/storage.ts         uploaded file bytes on disk
```

- **Auth.** Tokens are HMAC-SHA256 signed, typed (`access` vs `upload`) and expiring. They're stored in `localStorage` ("Remember me") or `sessionStorage`. Every request re-checks that the account still exists and is active, so suspensions take effect immediately.
- **Access control.** A room's members are its host plus everyone who joined with the code. Rooms, chat, whiteboard, files and signaling all require membership; non-members get `404`, so room ids can't be probed.
- **Media** travels directly between browsers (mesh WebRTC). The server only relays signaling messages, never audio or video.
- **Storage** is a single JSON file. That is ideal for development and small single-instance deployments; see [Known limitations](#known-limitations).

---

## Real-time signaling protocol

Each participant opens one long-lived stream per room and sends messages with POST.

| Direction | Request |
|-----------|---------|
| server → client | `GET /api/rooms/{roomId}/signal` (Server-Sent Events; `Authorization: Bearer …`) |
| client → server | `POST /api/rooms/{roomId}/signal` with JSON `{ type, payload?, targetUserId? }` |

The client reads the stream with `fetch()` rather than `EventSource`, so the token stays in a header and never appears in a URL. POSTs are serialized so the relay preserves order, and a watchdog reconnects silent streams. The server sends a `: ping` heartbeat every 15 s.

**Server events**

| `type` | When |
|--------|------|
| `welcome` | First event on connect; `payload.peers` lists who is already in the call |
| `peer-joined` / `peer-rejoined` | Someone connected (or reconnected) |
| `peer-left` | Someone's stream closed |
| `session-replaced` | You opened the same room elsewhere; this stream stops |

**Client message types:** `offer`, `answer`, `ice-candidate`, `chat-message`, `draw`, `cursor`. Anything else is rejected with `422`, and messages are limited to 512 KB. The server always overwrites `senderId`/`senderName`, so clients cannot impersonate each other. With `targetUserId` a message goes to one peer; without it, it goes to everyone else. Broadcast `chat-message` and `draw` events are also persisted.

**Call setup** uses WebRTC *perfect negotiation*. Peers already in the room open a connection to each newcomer when they see `peer-joined`. Offer collisions are resolved by a polite/impolite role, and ICE candidates that arrive early are queued. If a camera becomes available after connecting, the connection is renegotiated.

The FastAPI backend speaks the same protocol over a WebSocket (`/ws/{roomId}?ticket=…`).

---

## API reference

All endpoints are under `/api`, take and return JSON, and require `Authorization: Bearer <token>` unless marked public. Errors look like `{ "detail": "message" }`.

<details>
<summary><strong>Auth</strong></summary>

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/register` | Public. `{name, email, password}` → `{access_token, user}`. Rate-limited. |
| POST | `/auth/login` | Public. `{email, password}`. Rate-limited per IP and per account; `403` if suspended. |
| POST | `/auth/forgot-password` | Public. Always returns the same message (no email is sent; see limitations). |
| POST | `/auth/change-password` | `{currentPassword, newPassword}` |
| POST | `/admin/login` | Public. Admin accounts only. |

</details>

<details>
<summary><strong>Users</strong></summary>

| Method | Path | Notes |
|--------|------|-------|
| GET / PATCH | `/users/me` | Profile. `avatarUrl` must be a PNG/JPEG/GIF/WebP data URL (≤ 1 MB) or an http(s) URL. |
| DELETE | `/users/me` | `{password}`. Deletes the account, hosted rooms and your files. |
| GET / PATCH | `/users/me/settings` | `{status, theme, notifications:{meetingReminders, chatMessages, fileUploads, sounds}}`; unknown keys are ignored |
| GET | `/users/me/stats` | Meetings, hours in calls, files shared, rooms created |
| GET | `/users/me/sessions` | Your recent sign-in attempts |
| GET | `/users/me/export` | JSON download of your data |
| GET | `/users/online` | People currently in a call in your rooms |

</details>

<details>
<summary><strong>Rooms</strong></summary>

| Method | Path | Notes |
|--------|------|-------|
| GET | `/rooms` | Rooms you host or have joined |
| POST | `/rooms` | `{name, password?}` (password 4–64 chars) |
| POST | `/rooms/join-by-code` | `{code, password?}`. Returns `{requiresPassword: true, roomId: null}` if a password is needed. Rate-limited. |
| GET | `/rooms/{id}` | Details plus live participants (members only) |
| GET | `/rooms/{id}/messages` | Chat history |
| GET | `/rooms/{id}/files` | Files shared in the room |
| GET | `/rooms/{id}/whiteboard` | Current whiteboard objects |
| GET / POST | `/rooms/{id}/signal` | Signaling (see above) |

</details>

<details>
<summary><strong>Files</strong></summary>

Uploads take three steps: **presign → PUT the bytes → confirm**.

| Method | Path | Notes |
|--------|------|-------|
| POST | `/files/presign` | `{fileName, fileType, fileSize, roomId?}` → `{fileId, uploadUrl}`. Checks type, size, quota and room membership. |
| PUT | `/files/{id}/upload?token=…` | Raw bytes. The URL carries a 15-minute token scoped to this one file and works once. |
| POST | `/files/confirm` | `{fileId, roomId?}`. Shares into the room and notifies its members. |
| GET | `/files` | Your files (including Trash) plus files shared in your rooms |
| GET | `/files/usage` | `{totalBytes, limitBytes, …}` |
| PATCH | `/files/{id}` | Rename (uploader only) |
| POST | `/files/{id}/replace` | `{fileSize, fileType}` → `{uploadUrl}`. Overwrite your own file with new contents of the same type, keeping its id, name and sharing (used to re-save a whiteboard). |
| POST / DELETE | `/files/{id}/favorite` | Per-user favourite |
| DELETE | `/files/{id}` | Move to Trash (uploader only) |
| POST | `/files/{id}/restore` | Restore from Trash |
| DELETE | `/files/{id}/delete` | Permanently delete the record and bytes |
| GET | `/files/{id}/download` | Always served as an attachment with `nosniff` |

Allowed types are images (except SVG), audio, video, PDF, plain text/CSV/Markdown, JSON, ZIP, Office documents and `application/octet-stream`.

</details>

<details>
<summary><strong>Notifications &amp; admin</strong></summary>

| Method | Path | Notes |
|--------|------|-------|
| GET | `/notifications` | Your latest 50 |
| PATCH | `/notifications/{id}/read` | |
| POST | `/notifications/mark-all-read` | |
| GET | `/admin/stats`, `/admin/users`, `/admin/login-history`, `/admin/calls`, `/admin/database` | Admin only: `401` if signed out, `403` if not an admin |
| POST | `/admin/users` | Create a user |
| PATCH / DELETE | `/admin/users/{id}` | Edit, suspend or delete a user (admins cannot demote, suspend or delete themselves) |

</details>

---

## Testing

```bash
npm test                     # 59 tests (Vitest), about 10 s
cd backend && pytest         # 21 tests for the FastAPI backend (see backend/README.md)
```

The frontend suite ([`tests/`](tests/)) calls the real route handlers with `NextRequest`s against a fresh temporary database and uploads folder for each test. It covers:

- **Auth:** tokens, expiry, tampering, suspension and rate limits
- **Room privacy:** listing, join-by-code with passwords, notifications
- **File uploads:** upload tokens, size and type limits, access control, per-user favourites, the Trash lifecycle
- **Signaling stream:** presence, targeted relay, identity stamping, persistence, call records
- **Settings and account:** settings whitelisting, account export and deletion
- **Admin guards**

CI should run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`. All four pass with zero warnings.

---

## Project structure

```text
app/
  page.tsx           public landing page (components/landing/)
  (auth)/            login, signup, forgot-password
  admin/             admin console + admin login
  api/               route handlers (the built-in backend)
  dashboard/ meetings/ room/[roomId]/ files/ whiteboard/ chat/ notifications/ profile/ settings/ legal/
components/          UI by feature (meeting, chat, whiteboard, files, layout, shared, …)
lib/
  api.ts             typed API client (+ uploadFile helper)
  admin-api.ts       admin API client and session
  auth-context.tsx   auth store (useSyncExternalStore over browser storage)
  theme-context.tsx  theme store
  use-unread-notifications.ts, use-hydrated.ts
  webrtc/            signaling transports and usePeerConnections (perfect negotiation)
  server/            server-only: db, crypto, auth, access, storage, users, signaling-hub
tests/               Vitest suites
backend/             optional FastAPI implementation (own README and tests)
```

---

## Using the FastAPI backend

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env                                 # set SECRET_KEY
uvicorn main:app --reload --port 8000
```

Then set `NEXT_PUBLIC_API_URL=http://localhost:8000` in `.env.local` and restart `npm run dev`. Signaling switches to the backend's WebSocket hub automatically. See [`backend/README.md`](backend/README.md) for details, including which features exist only in the built-in API.

---

## Deployment

1. Set `AUTH_SECRET` (32+ random bytes) and, if you want an admin, `DUROTTO_ADMIN_EMAIL` / `DUROTTO_ADMIN_PASSWORD` **before the first start**.
2. Run `npm run build`, then `npm start` (or any Node host that runs `next start`).
3. Serve over **HTTPS**. Browsers only allow camera and microphone on secure origins, and the app sends HSTS in production.
4. Behind a reverse proxy, set `TRUST_PROXY=1`. Don't buffer `text/event-stream` responses (nginx: `proxy_buffering off;`; the app also sends `X-Accel-Buffering: no`). Allow long-lived connections, ideally with read timeouts over 60 s.
5. Persist the `.data/` directory (or set `DUROTTO_DB_PATH` / `DUROTTO_UPLOADS_DIR` to a volume).
6. Run **one** instance. The signaling hub, rate limits and JSON database are per-process (see limitations).
7. For users on restrictive networks, provide a TURN server through `NEXT_PUBLIC_ICE_SERVERS_ENDPOINT`.

---

## Security

Responses carry a Content-Security-Policy plus `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and a `Permissions-Policy` that only allows camera, microphone and screen capture. Passwords are hashed with scrypt (bcrypt in FastAPI). Login, registration, join codes and other sensitive endpoints are rate-limited. Logins for unknown emails take as long as real ones, so accounts can't be discovered by timing.

[`SECURITY_AUDIT.md`](SECURITY_AUDIT.md) lists every finding and its status, along with the remaining accepted risks.

---

## Known limitations

- **Single instance.** The JSON database, signaling hub and rate-limit counters live in one Node process. To scale out, move to a real database (Postgres) and a shared pub/sub and rate-limit store (Redis).
- **Mesh calls.** Each participant sends media to every other participant, which works well up to about 4–6 people. Larger meetings need an SFU (for example LiveKit or mediasoup).
- **Direct messages (`/chat`)** are a UI preview with sample conversations; the page says so. Room chat is fully functional.
- **No email delivery.** "Forgot password" shows a confirmation but sends nothing. An admin can reset a password from the admin console.
- **Not implemented:** two-factor authentication, revoking sessions on other devices (tokens are stateless and expire after `AUTH_TOKEN_TTL_SECONDS`), localisation (English only) and scheduled meetings.
- The FastAPI backend doesn't implement the `/admin/*` endpoints or call-duration tracking.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Camera and microphone permission denied" | Allow access in the browser's site settings, and use `localhost` or HTTPS. |
| Two people in a room can't see each other | Usually NAT/firewall. Configure a TURN server via `NEXT_PUBLIC_ICE_SERVERS_ENDPOINT`. |
| Connection status stuck on "Connecting…" behind a proxy | The proxy is buffering the SSE stream; disable buffering for `/api/rooms/*/signal`. |
| "Room not found, or you haven't joined it yet" | Join with the room's code first; room links only work for members. |
| `npm start` errors with `AUTH_SECRET must be set in production` | Set `AUTH_SECRET` in the environment. |
| Want a clean slate | Stop the server and delete `.data/`. |
