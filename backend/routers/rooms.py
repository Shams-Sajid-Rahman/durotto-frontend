import json
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

import hub
from auth import get_current_user, hash_password, verify_password
from database import get_db
from limiter import RATE_LIMIT_JOIN_CODE, limiter
from models import File, Message, Room, RoomParticipant, User, WhiteboardStroke
from schemas import (
    CreateRoomRequest,
    FileOut,
    JoinByCodeRequest,
    JoinByCodeResponse,
    MessagePayload,
    Participant,
    RoomDetail,
    RoomMessageOut,
    RoomOut,
    WhiteboardStrokeOut,
)
from services import file_out, is_member, notify, require_member_room, room_out

router = APIRouter()

# Unambiguous characters: no 0/O/1/I
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _generate_join_code(db: Session) -> str:
    """Unique 6-char join code. Uses `secrets`: codes are access credentials."""
    for _ in range(20):
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(6))
        if not db.query(Room).filter(Room.join_code == code).first():
            return code
    raise RuntimeError("Failed to generate a unique join code")


@router.get("", response_model=list[RoomOut])
def list_rooms(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rooms the caller hosts or has joined (never anyone else's)."""
    rooms = (
        db.query(Room)
        .join(RoomParticipant, RoomParticipant.room_id == Room.id)
        .filter(RoomParticipant.user_id == current_user.id, Room.deleted_at.is_(None))
        .order_by(Room.created_at.desc())
        .all()
    )
    return [room_out(r) for r in rooms]


@router.post("", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
def create_room(
    body: CreateRoomRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = Room(
        name=body.name,
        join_code=_generate_join_code(db),
        host_id=current_user.id,
        is_password_protected=bool(body.password),
        hashed_password=hash_password(body.password) if body.password else None,
    )
    db.add(room)
    db.flush()
    db.add(RoomParticipant(room_id=room.id, user_id=current_user.id))
    db.commit()
    db.refresh(room)
    return room_out(room)


@router.post("/join-by-code", response_model=JoinByCodeResponse)
@limiter.limit(RATE_LIMIT_JOIN_CODE)
def join_by_code(
    request: Request,
    body: JoinByCodeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = db.query(Room).filter(Room.join_code == body.code, Room.deleted_at.is_(None)).first()
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid or expired meeting code.")

    already = is_member(db, room.id, current_user.id)
    if room.is_password_protected and not already:
        if not body.password:
            # Don't reveal anything about the room before the password.
            return JoinByCodeResponse(roomId=None, joinCode=room.join_code, requiresPassword=True)
        if not verify_password(body.password, room.hashed_password or ""):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Incorrect password.")

    if not already:
        db.add(RoomParticipant(room_id=room.id, user_id=current_user.id))
        if room.host_id != current_user.id:
            notify(
                db,
                room.host_id,
                "join",
                f"{current_user.name} joined your room",
                f'{current_user.name} joined "{room.name}"',
                {"roomId": room.id, "targetUrl": f"/room/{room.id}"},
            )
        db.commit()

    return JoinByCodeResponse(roomId=room.id, joinCode=room.join_code)


@router.get("/{room_id}", response_model=RoomDetail)
def get_room(
    room_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_member_room(db, room_id, current_user)
    live = [p for p in hub.connected_peers(room.id) if p["id"] != current_user.id]
    participants = [Participant(id=current_user.id, name=current_user.name)] + [
        Participant(**p) for p in live
    ]
    base = room_out(room)
    return RoomDetail(**base.model_dump(), participants=participants)


@router.get("/{room_id}/messages", response_model=list[RoomMessageOut])
def get_room_messages(
    room_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_member_room(db, room_id, current_user)
    messages = db.query(Message).filter(Message.room_id == room_id).order_by(Message.sent_at).all()
    out = []
    for m in messages:
        try:
            payload = MessagePayload.model_validate(json.loads(m.payload_json))
        except (ValueError, TypeError):
            continue
        out.append(
            RoomMessageOut(
                id=m.id,
                senderId=m.sender_id,
                senderName=m.sender.name if m.sender else "(deleted user)",
                payload=payload,
                sentAt=m.sent_at,
            )
        )
    return out


@router.get("/{room_id}/files", response_model=list[FileOut])
def get_room_files(
    room_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_member_room(db, room_id, current_user)
    files = (
        db.query(File)
        .filter(File.room_id == room_id, File.deleted_at.is_(None), File.storage_path != "pending")
        .order_by(File.created_at.desc())
        .all()
    )
    return [file_out(db, f, current_user) for f in files]


@router.get("/{room_id}/whiteboard", response_model=list[WhiteboardStrokeOut])
def get_room_whiteboard(
    room_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_member_room(db, room_id, current_user)
    strokes = (
        db.query(WhiteboardStroke)
        .filter(WhiteboardStroke.room_id == room_id)
        .order_by(WhiteboardStroke.created_at)
        .all()
    )
    return [
        WhiteboardStrokeOut(
            strokeId=s.stroke_id,
            objectData=json.loads(s.object_json),
            userId=s.user_id,
            userName=s.user_name,
            createdAt=s.created_at,
        )
        for s in strokes
    ]
