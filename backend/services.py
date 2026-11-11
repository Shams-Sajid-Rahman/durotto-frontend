"""Shared helpers used by several routers."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

import hub
from models import File, FileFavorite, Notification, Room, RoomParticipant, User
from schemas import FileOut, RoomOut, UserOut

# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        bio=user.bio,
        avatarUrl=user.avatar_url,
    )


# ---------------------------------------------------------------------------
# Rooms
# ---------------------------------------------------------------------------


def is_member(db: Session, room_id: str, user_id: str) -> bool:
    return (
        db.query(RoomParticipant)
        .filter(RoomParticipant.room_id == room_id, RoomParticipant.user_id == user_id)
        .first()
        is not None
    )


def require_member_room(db: Session, room_id: str, user: User) -> Room:
    """The room if the user belongs to it. Non-members get 404 (no probing)."""
    room = db.query(Room).filter(Room.id == room_id, Room.deleted_at.is_(None)).first()
    if room is None or not is_member(db, room.id, user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found.")
    return room


def room_out(room: Room) -> RoomOut:
    return RoomOut(
        id=room.id,
        name=room.name,
        join_code=room.join_code,
        host_id=room.host_id,
        is_password_protected=room.is_password_protected,
        participant_count=len(hub.connected_peers(room.id)),
        member_count=len(room.participants),
        created_at=room.created_at,
    )


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------

MAX_UPLOAD_BYTES = 100_000_000
STORAGE_LIMIT_BYTES = 10 * 1024**3

_ALLOWED_PREFIXES = ("image/", "video/", "audio/", "text/plain", "text/csv", "text/markdown")
_ALLOWED_EXACT = {
    "application/pdf",
    "application/zip",
    "application/x-zip-compressed",
    "application/json",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/octet-stream",
}

_SAFE_ID = re.compile(r"^[a-f0-9]{32}$")


def normalize_mime(mime: str) -> str:
    return (mime.split(";")[0].strip().lower()) or "application/octet-stream"


def is_allowed_mime(mime: str) -> bool:
    m = normalize_mime(mime)
    if m == "image/svg+xml":  # SVG can carry script
        return False
    return m in _ALLOWED_EXACT or m.startswith(_ALLOWED_PREFIXES)


def sanitize_file_name(name: str) -> str:
    cleaned = re.sub(r"[\\/]", "_", name)
    cleaned = re.sub(r"[\x00-\x1f\x7f\"]", "", cleaned).strip()[:255]
    return cleaned if cleaned and cleaned not in {".", ".."} else "file"


def uploads_dir() -> Path:
    path = Path(os.getenv("UPLOADS_DIR", "./uploads"))
    path.mkdir(parents=True, exist_ok=True)
    return path


def stored_path(file_id: str) -> Path:
    """Bytes are stored under the server-generated id only — never a client name."""
    if not _SAFE_ID.match(file_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file id.")
    return uploads_dir() / file_id


def can_view_file(db: Session, f: File, user: User) -> bool:
    if f.uploader_id == user.id:
        return True
    if not f.room_id or f.deleted_at is not None:
        return False
    return is_member(db, f.room_id, user.id)


def file_out(db: Session, f: File, viewer: User) -> FileOut:
    favorite = (
        db.query(FileFavorite)
        .filter(FileFavorite.file_id == f.id, FileFavorite.user_id == viewer.id)
        .first()
        is not None
    )
    return FileOut(
        id=f.id,
        name=f.name,
        size=f.size,
        mimeType=f.mime_type,
        uploaderId=f.uploader_id,
        uploaderName=f.uploader.name if f.uploader else "(deleted user)",
        uploadedAt=f.created_at,
        roomId=f.room_id,
        roomName=f.room.name if f.room else None,
        roomOwnerId=f.room.host_id if f.room else None,
        isFavorite=favorite,
        deletedAt=f.deleted_at,
    )


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


def notify(
    db: Session,
    user_id: str,
    type_: str,
    title: str,
    body: str,
    payload: dict | None = None,
) -> None:
    """Queue a notification (caller commits)."""
    db.add(
        Notification(
            user_id=user_id,
            type=type_,
            title=title,
            body=body,
            payload_json=json.dumps(payload) if payload else None,
        )
    )
