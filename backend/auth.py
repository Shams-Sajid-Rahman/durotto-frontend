"""Password hashing, JWT helpers and FastAPI auth dependencies."""

import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from database import get_db
from models import User

load_dotenv()

_DEV_SECRET = "insecure-dev-secret-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
UPLOAD_TOKEN_EXPIRE_MINUTES = 15

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def _secret_key() -> str:
    """Signing key. A missing key is fatal in production (ENV=production)."""
    key = os.getenv("SECRET_KEY")
    if key:
        return key
    if os.getenv("ENV", "development").lower() == "production":
        raise RuntimeError("SECRET_KEY must be set when ENV=production.")
    return _DEV_SECRET


# ---------------------------------------------------------------------------
# Passwords (bcrypt directly — passlib is unmaintained and breaks on bcrypt>=4.1)
# ---------------------------------------------------------------------------


def _prepare(plain: str) -> bytes:
    # bcrypt only uses the first 72 bytes; refuse to silently truncate.
    data = plain.encode("utf-8")
    if len(data) > 72:
        raise ValueError("Password is too long.")
    return data


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_prepare(plain), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_prepare(plain), hashed.encode("utf-8"))
    except ValueError:
        return False


_DUMMY_HASH: str | None = None


def burn_password_check(plain: str) -> None:
    """Spend the same time as a real check (avoids user enumeration by timing)."""
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = hash_password(secrets.token_hex(8))
    verify_password(plain[:72], _DUMMY_HASH)


# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------


def _encode(claims: dict, minutes: int) -> str:
    payload = dict(claims)
    payload["exp"] = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    return jwt.encode(payload, _secret_key(), algorithm=ALGORITHM)


def _decode(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        return jwt.decode(token, _secret_key(), algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None


def create_access_token(user_id: str) -> str:
    return _encode({"sub": user_id, "typ": "access"}, ACCESS_TOKEN_EXPIRE_MINUTES)


def decode_access_token(token: str | None) -> dict | None:
    payload = _decode(token)
    if not payload or payload.get("typ") != "access" or not payload.get("sub"):
        return None
    return payload


def create_upload_token(file_id: str, user_id: str) -> str:
    return _encode({"sub": user_id, "fid": file_id, "typ": "upload"}, UPLOAD_TOKEN_EXPIRE_MINUTES)


def verify_upload_token(token: str | None, file_id: str) -> str | None:
    """Return the uploader's user id if the token grants uploading this file."""
    payload = _decode(token)
    if not payload or payload.get("typ") != "upload" or payload.get("fid") != file_id:
        return None
    return payload.get("sub")


# ---------------------------------------------------------------------------
# WebSocket tickets — single-use, 30 s, so the long-lived JWT never appears in
# a URL (and therefore never in proxy/server access logs).
# ---------------------------------------------------------------------------

_TICKET_TTL_SECONDS = 30
_tickets: dict[str, tuple[str, str, float]] = {}  # ticket -> (user_id, room_id, expires_at)


def issue_ws_ticket(user_id: str, room_id: str) -> str:
    now = time.monotonic()
    for key, (_, _, expires) in list(_tickets.items()):
        if expires < now:
            _tickets.pop(key, None)
    ticket = secrets.token_urlsafe(24)
    _tickets[ticket] = (user_id, room_id, now + _TICKET_TTL_SECONDS)
    return ticket


def redeem_ws_ticket(ticket: str | None, room_id: str) -> str | None:
    if not ticket:
        return None
    entry = _tickets.pop(ticket, None)  # single use
    if entry is None:
        return None
    user_id, ticket_room, expires = entry
    if ticket_room != room_id or expires < time.monotonic():
        return None
    return user_id


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------


def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if user is None:
        raise credentials_exception
    return user
