import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

import hub
from auth import get_current_user, verify_password
from database import get_db
from limiter import RATE_LIMIT_LOGIN, limiter
from models import (
    File,
    FileFavorite,
    LoginAttempt,
    Message,
    Notification,
    Room,
    RoomParticipant,
    User,
    WhiteboardStroke,
)
from schemas import (
    DeleteAccountRequest,
    Message as MessageOut,
    NotificationPrefs,
    OnlineUser,
    SignInEntry,
    UpdateSettingsRequest,
    UpdateUserRequest,
    UserOut,
    UserSettings,
    UserStats,
)
from services import stored_path, user_out

router = APIRouter()


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return user_out(current_user)


@router.patch("/me", response_model=UserOut)
def update_me(
    body: UpdateUserRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.name is not None:
        current_user.name = body.name.strip() or current_user.name
    if body.bio is not None:
        current_user.bio = body.bio
    if body.avatarUrl is not None:
        current_user.avatar_url = body.avatarUrl or None
    db.commit()
    db.refresh(current_user)
    return user_out(current_user)


@router.delete("/me", response_model=MessageOut)
@limiter.limit(RATE_LIMIT_LOGIN)
def delete_me(
    request: Request,
    body: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete your account, the rooms you host and your files. Needs your password."""
    if not verify_password(body.password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password is incorrect.")

    uid = current_user.id
    hosted = [r.id for r in db.query(Room).filter(Room.host_id == uid).all()]
    doomed = db.query(File).filter((File.uploader_id == uid) | (File.room_id.in_(hosted))).all()
    for f in doomed:
        path = stored_path(f.id)
        path.unlink(missing_ok=True)
    doomed_ids = [f.id for f in doomed]

    db.query(FileFavorite).filter(
        (FileFavorite.user_id == uid) | (FileFavorite.file_id.in_(doomed_ids))
    ).delete(synchronize_session=False)
    db.query(File).filter(File.id.in_(doomed_ids)).delete(synchronize_session=False)
    db.query(Message).filter(
        (Message.room_id.in_(hosted)) | (Message.sender_id == uid)
    ).delete(synchronize_session=False)
    db.query(WhiteboardStroke).filter(WhiteboardStroke.room_id.in_(hosted)).delete(
        synchronize_session=False
    )
    db.query(RoomParticipant).filter(
        (RoomParticipant.user_id == uid) | (RoomParticipant.room_id.in_(hosted))
    ).delete(synchronize_session=False)
    db.query(Room).filter(Room.id.in_(hosted)).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.user_id == uid).delete(synchronize_session=False)
    db.delete(current_user)
    db.commit()
    return MessageOut(message="Your account has been deleted.")


@router.get("/me/stats", response_model=UserStats)
def get_my_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return UserStats(
        meetingsAttended=db.query(RoomParticipant)
        .filter(RoomParticipant.user_id == current_user.id)
        .count(),
        hoursOnline=0,  # call durations are not tracked by this backend
        filesShared=db.query(File)
        .filter(
            File.uploader_id == current_user.id,
            File.deleted_at.is_(None),
            File.storage_path != "pending",
        )
        .count(),
        roomsCreated=db.query(Room)
        .filter(Room.host_id == current_user.id, Room.deleted_at.is_(None))
        .count(),
    )


def _load_settings(user: User) -> UserSettings:
    try:
        raw = json.loads(user.settings_json or "{}")
    except (json.JSONDecodeError, TypeError):
        raw = {}
    try:
        return UserSettings.model_validate(raw)
    except ValueError:
        return UserSettings()


@router.get("/me/settings", response_model=UserSettings)
def get_my_settings(current_user: User = Depends(get_current_user)):
    return _load_settings(current_user)


@router.patch("/me/settings", response_model=UserSettings)
def update_my_settings(
    body: UpdateSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current = _load_settings(current_user)
    if body.status is not None:
        current.status = body.status
    if body.theme is not None:
        current.theme = body.theme
    if body.notifications is not None:
        merged = current.notifications.model_dump()
        merged.update(body.notifications.model_dump(exclude_none=True))
        current.notifications = NotificationPrefs(**merged)
    current_user.settings_json = current.model_dump_json()
    db.commit()
    return current


@router.get("/me/sessions", response_model=list[SignInEntry])
def my_sign_ins(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(LoginAttempt)
        .filter(LoginAttempt.user_id == current_user.id)
        .order_by(LoginAttempt.attempted_at.desc())
        .limit(20)
        .all()
    )
    return [
        SignInEntry(id=r.id, userAgent=r.user_agent, ip=r.ip_address, success=r.success, at=r.attempted_at)
        for r in rows
    ]


@router.get("/me/export")
def export_my_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    memberships = db.query(RoomParticipant).filter(RoomParticipant.user_id == current_user.id).all()
    room_ids = [m.room_id for m in memberships]
    rooms = db.query(Room).filter(Room.id.in_(room_ids)).all()
    files = db.query(File).filter(File.uploader_id == current_user.id).all()
    data = {
        "profile": user_out(current_user).model_dump(),
        "settings": _load_settings(current_user).model_dump(mode="json"),
        "rooms": [
            {"id": r.id, "name": r.name, "isHost": r.host_id == current_user.id, "createdAt": r.created_at.isoformat()}
            for r in rooms
        ],
        "files": [
            {"id": f.id, "name": f.name, "size": f.size, "mimeType": f.mime_type, "roomId": f.room_id}
            for f in files
        ],
        "notifications": [
            {"title": n.title, "body": n.body, "createdAt": n.created_at.isoformat()}
            for n in db.query(Notification).filter(Notification.user_id == current_user.id).all()
        ],
    }
    return JSONResponse(
        data,
        headers={
            "Content-Disposition": 'attachment; filename="durotto-export.json"',
            "Cache-Control": "private, no-store",
        },
    )


@router.get("/online", response_model=list[OnlineUser])
def online_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """People currently connected to a call in any room the caller belongs to."""
    my_rooms = {
        m.room_id
        for m in db.query(RoomParticipant).filter(RoomParticipant.user_id == current_user.id).all()
    }
    seen: dict[str, OnlineUser] = {}
    for room_id in hub.active_room_ids():
        if room_id not in my_rooms:
            continue
        room = db.query(Room).filter(Room.id == room_id).first()
        for peer in hub.connected_peers(room_id):
            if peer["id"] == current_user.id or peer["id"] in seen:
                continue
            seen[peer["id"]] = OnlineUser(
                id=peer["id"], name=peer["name"], roomId=room_id, roomName=room.name if room else ""
            )
    return list(seen.values())
