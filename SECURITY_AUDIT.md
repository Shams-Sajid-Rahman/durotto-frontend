# Durotto Security Audit

| | |
|---|---|
| **Original audit** | 2026-07-02 — frontend only |
| **Revised** | 2026-11-11 — full codebase: Next.js client, built-in API (`app/api`, `lib/server`), FastAPI backend (`backend/`) |

The 2026-07-02 audit assumed `app/api` held development-only mock routes and that the FastAPI backend didn't exist yet. Both assumptions were out of date. The `app/api` routes are a real, persistent backend that is served in production, and `backend/` is a working FastAPI service. This revision audits both and corrects earlier statements that were no longer true (see [Corrections](#corrections-to-the-2026-07-02-audit)).

Every **Fixed** item below has an automated test in `tests/` (Vitest) or `backend/tests/` (pytest).

---

## Findings fixed in this revision

### Built-in API (Next.js route handlers)

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| N-01 | **Critical** | `GET /api/rooms` returned **every** room, with its join code, to any signed-in user. Combined with `GET /api/rooms/{id}` having no membership check, this bypassed room passwords. | Rooms now have members (host plus everyone who joined with the code). Listing is scoped to the caller. Room, chat, whiteboard, files and signaling endpoints require membership, and non-members get `404`. |
| N-02 | High | Auth tokens never expired. | Tokens carry `exp` (default 7 days, `AUTH_TOKEN_TTL_SECONDS`) and a type (`access` / `upload`), so one kind can't stand in for the other. |
| N-03 | High | Suspended or deleted users kept full API access until their token was discarded. | Every request re-checks that the account exists and `status === "active"`. |
| N-04 | High | Production fell back to a public default `AUTH_SECRET`, which made tokens forgeable. | Signing throws in production without `AUTH_SECRET`. |
| N-05 | High | Seeding always created `admin@gmail.com` / `admin123`, including in production. | The admin comes from `DUROTTO_ADMIN_EMAIL` / `DUROTTO_ADMIN_PASSWORD`. Well-known dev accounts are only seeded outside production. |
| N-06 | High (was D-02) | No rate limiting anywhere. | Fixed-window limits on login (per IP and per account), admin login, registration, forgot-password, change-password, account deletion, join-by-code, room creation, presign and signaling. |
| N-07 | Medium | Login timing revealed whether an email was registered (scrypt only ran for known users). | A dummy scrypt check runs for unknown emails. |
| N-08 | Medium | `clientIp()` trusted `X-Forwarded-For` unconditionally, so anyone could spoof it to dodge rate limits or falsify login history. | Forwarding headers are only trusted with `TRUST_PROXY=1`. Per-account limits apply regardless. |
| N-09 | Medium | `PATCH /api/users/me/settings` merged arbitrary client keys into stored settings. | Only known keys with valid values are accepted. |
| N-10 | Medium | `avatarUrl` accepted any string of any size (for example `javascript:` URLs, or multi-MB data). | Only PNG/JPEG/GIF/WebP data URLs up to about 1 MB, or http(s) URLs, are accepted. |
| N-11 | Medium | Notification routes were unauthenticated mocks that returned the same data to everyone (and 404'd in production). | Real per-user notifications. Marking another user's notification as read returns `404`. |
| N-12 | Medium | No file storage existed, and the client called endpoints that weren't there. | Implemented with: type allowlist (no SVG or HTML), 100 MB file limit, 10 GB quota, a 15-minute single-file upload token, single-use upload URLs, a declared-size ceiling, ids generated server-side as the only filesystem names, and downloads forced to `attachment` with `nosniff`. |
| N-13 | Medium | An admin could demote or suspend their own account, possibly leaving no admin. | Blocked, as self-deletion already was. |
| N-14 | Low | Deleting a user left orphaned memberships, files, notifications and whiteboards. | A cascade delete also removes stored file bytes. |
| N-15 | Low | A corrupt `db.json` was silently replaced by a fresh seed, wiping all data. | The corrupt file is backed up as `db.json.corrupt-<ts>`, and writes are atomic (temp file plus rename). |
| N-16 | Low | Join codes came from `Math.random()`. | `crypto.randomInt` is used (the FastAPI backend uses `secrets`). |
| N-17 | Low | Admin endpoints returned `403` for expired sessions, so the console couldn't tell "signed out" from "not an admin". | `401` for no or invalid session, `403` for non-admins; the console redirects to sign-in on `401`. |

### Signaling (was D-03)

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| S-01 | Medium | The JWT was passed in the WebSocket URL, where it lands in server and proxy logs and browser history. | **Built-in API:** signaling is SSE read with `fetch()`, so the token stays in the `Authorization` header. **FastAPI:** the client swaps its JWT for a single-use, 30-second, room-bound ticket (`POST /ws/ticket`) and only the ticket goes in the URL. |
| S-02 | Medium | Relayed messages trusted client-supplied fields. | The server always stamps `senderId`/`senderName`, allowlists message types and caps message size at 512 KB. |

### FastAPI backend

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| B-01 | **Critical** | **Path traversal on upload.** Bytes were written to `uploads/{id}/{client file name}`, so a name like `../../main.py` overwrote server code. | Bytes are stored as `uploads/{server-generated id}`. Names are sanitized and used only as display metadata. |
| B-02 | High | `PUT /files/{id}/upload` required no authentication, could be repeated to overwrite a file, and ignored the declared size. | A signed single-file upload token is required. Upload works only while the file is pending, and the body is streamed with a declared-size ceiling. |
| B-03 | High | Presign and confirm accepted any `room_id`, so users could push files into rooms they weren't in. | Membership is required. |
| B-04 | High | Each router created its own unregistered `Limiter`, so the documented limits were never shared or configurable. | One shared limiter (`limiter.py`), with limits taken from the environment. |
| B-05 | High | The default `SECRET_KEY` was silently accepted in production. | Missing `SECRET_KEY` is fatal with `ENV=production`. |
| B-06 | High | Dependency defects: `passlib` 1.7.4 breaks with current `bcrypt`; `python-jose` 3.3.0 has known CVEs (CVE-2024-33663/33664); `python-multipart` 0.0.12 has CVE-2024-53981; `email-validator` was missing, so `EmailStr` failed at import. | Switched to `bcrypt` and `PyJWT` directly, upgraded `python-multipart`, added `email-validator`, and pinned everything. |
| B-07 | Medium | Join-by-code returned the room id before the password was supplied. | Returns `roomId: null` until the password is verified. |
| B-08 | Medium | Notifications for other users returned `403`, which confirmed the id existed. | `404`. |
| B-09 | Low | Favourites were a global flag: any room member could toggle the uploader's star. | Per-user `file_favorites` table. |
| B-10 | Low | CORS allowed `*` if configured, together with credentials. | `*` is ignored; methods and headers are explicit. |

### HTTP headers (was D-05)

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| H-01 | Medium | No Content-Security-Policy. | CSP on every route: `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri`/`form-action 'self'`, and `connect-src` limited to self plus the configured API, WebSocket and ICE origins. `'unsafe-eval'` is only allowed in development. |
| H-02 | Low | `X-XSS-Protection: 1; mode=block` turns on the legacy auditor, which is itself exploitable. | Set to `0`, per current guidance. |
| H-03 | Low | No HSTS. | `Strict-Transport-Security` in production. |

### Client

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| C-1 | Medium | An expired token left the UI looking signed in, with every request failing. | Any `401` on an authenticated request clears the session. |
| C-2 | Low | "Remember me" off still wrote the user profile to `localStorage`. | Profile updates go to whichever storage holds the token. |
| C-3 | Low | Owner-only file actions were shown to everyone, and Share copied a link to a page that doesn't exist. | Owner-only actions are gated on the uploader; the broken Share action was removed. |
| C-4 | Low | `.data/` (password hashes, uploads), the SQLite DB and the uploads folder were not gitignored. | Ignored. The `.env.example` templates are now trackable. |

---

## Earlier findings (2026-07-02)

| ID | Finding | Status |
|----|---------|--------|
| F-01 | Missing route guard on `/files` | Fixed (unchanged) |
| F-02 | Device sign-out without confirmation | Superseded: the fake device list was replaced by a read-only "recent sign-ins" list from real login history |
| F-03 | Soft delete without confirmation | Fixed (unchanged) |
| F-04 | No HTTP security headers | Fixed; extended by H-01 to H-03 |
| F-05 | Unrestricted CORS on API routes | Fixed (unchanged). Note that static headers can name only one origin. |
| F-06 | Dead code / unused imports | Fixed. The project now lints with zero errors and zero warnings. |
| D-01 | Token in `localStorage` | **Accepted risk**, see below |
| D-02 | No rate limiting | Fixed (N-06, B-04) |
| D-03 | WebSocket token in URL | Fixed (S-01) |
| D-04 | FastAPI authorization guards | Fixed (B-01 to B-10); covered by `backend/tests` |
| D-05 | No CSP | Fixed (H-01) |
| D-06 | No account deletion | Fixed: `DELETE /users/me` with password confirmation, in both backends |
| D-07 | Light mode | Done (it was already implemented; the stale note was removed) |
| D-08 | 2FA | **Not implemented.** The non-functional toggle was removed from Settings. |

### Corrections to the 2026-07-02 audit

- **C-05 ("mock routes blocked in production")** was false. Only the three notification routes returned 404 in production. Every other `app/api` route is a real, persistent backend that is served in production. They are now all authenticated and audited (see above).
- **C-01 / C-07** rated room access as safe but missed N-01 (room listing leaked every join code).

---

## Accepted risks / remaining work

| Item | Notes |
|------|-------|
| Tokens in web storage (D-01) | Readable by any script on the origin. Mitigated by the CSP, React's output escaping, and token expiry. The full fix is `httpOnly; Secure; SameSite=Strict` cookies plus CSRF protection, a coordinated change across both backends. |
| No server-side session revocation | Tokens are stateless; "sign out" clears the local copy only. Suspension and deletion are enforced immediately (N-03), and password changes don't invalidate existing tokens. Add a session table if per-device revocation is needed. |
| CSP allows `'unsafe-inline'` scripts | Required by Next.js inline bootstrap scripts without per-request nonces. Moving to nonces needs a `proxy.ts` plus dynamic rendering. |
| In-memory rate limits | Per process, reset on restart. Use a shared store (Redis) when running multiple instances. |
| No 2FA, no password-reset email | See README "Known limitations". |
| FastAPI admin endpoints | Not implemented; the admin console requires the built-in API. |
