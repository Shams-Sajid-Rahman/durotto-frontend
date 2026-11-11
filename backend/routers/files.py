from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from auth import create_upload_token, get_current_user, verify_upload_token
from database import get_db
from models import File, FileFavorite, Room, RoomParticipant, User
from schemas import (
    ConfirmRequest,
    FileOut,
    Message,
    PresignRequest,
    PresignResponse,
    RenameRequest,
    ReplaceRequest,
    UsageResponse,
)
from services import (
    MAX_UPLOAD_BYTES,
    STORAGE_LIMIT_BYTES,
    can_view_file,
    file_out,
    is_allowed_mime,
    is_member,
    normalize_mime,
    notify,
    sanitize_file_name,
    stored_path,
)

router = APIRouter()

_PENDING = "pending"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _get_file(db: Session, file_id: str, user: User, *, own: bool) -> File:
    f = db.query(File).filter(File.id == file_id).first()
    if f is None or not can_view_file(db, f, user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
    if own and f.uploader_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the uploader can do that.")
    return f


def _used_bytes(db: Session, user: User) -> int:
    total = (
        db.query(func.sum(File.size))
        .filter(File.uploader_id == user.id, File.storage_path != _PENDING)
        .scalar()
    )
    return int(total or 0)


@router.get("", response_model=list[FileOut])
def list_files(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Your uploads (including Trash) plus files shared into your rooms."""
    room_ids = [
        p.room_id
        for p in db.query(RoomParticipant).filter(RoomParticipant.user_id == current_user.id).all()
    ]
    files = (
        db.query(File)
        .filter(
            File.storage_path != _PENDING,
            or_(
                File.uploader_id == current_user.id,
                (File.room_id.in_(room_ids)) & (File.deleted_at.is_(None)),
            ),
        )
        .order_by(File.created_at.desc())
        .all()
    )
    return [file_out(db, f, current_user) for f in files]


@router.get("/usage", response_model=UsageResponse)
def get_usage(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total = _used_bytes(db, current_user)
    return UsageResponse(
        totalBytes=total,
        totalGb=round(total / 1024**3, 4),
        limitGb=STORAGE_LIMIT_BYTES // 1024**3,
        limitBytes=STORAGE_LIMIT_BYTES,
    )


@router.post("/presign", response_model=PresignResponse, status_code=status.HTTP_201_CREATED)
def presign_upload(
    request: Request,
    body: PresignRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    mime = normalize_mime(body.fileType)
    if not is_allowed_mime(mime):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f'File type "{mime}" is not allowed.',
        )
    if body.fileSize > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File is too large.")
    room_id = body.roomId or None
    if room_id and not is_member(db, room_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found.")
    if _used_bytes(db, current_user) + body.fileSize > STORAGE_LIMIT_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Storage quota exceeded.")

    record = File(
        name=sanitize_file_name(body.fileName),
        size=body.fileSize,
        mime_type=mime,
        storage_path=_PENDING,
        uploader_id=current_user.id,
        room_id=room_id,
    )
    db.add(record)
    db.commit()

    token = create_upload_token(record.id, current_user.id)
    base = str(request.base_url).rstrip("/")
    return PresignResponse(
        uploadUrl=f"{base}/files/{record.id}/upload?token={quote(token)}",
        fileId=record.id,
    )


@router.put("/{file_id}/upload", response_model=Message)
async def upload_file_content(
    file_id: str,
    request: Request,
    token: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Receive the bytes. Authorised by the signed single-file token in the URL;
    only while the reservation is pending, so the URL can't overwrite later."""
    grant = verify_upload_token(token, file_id)
    if grant is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Upload link is invalid or has expired.")
    uploader_id, replace_cap = grant
    record = db.query(File).filter(File.id == file_id).first()
    if record is None or record.uploader_id != uploader_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
    if replace_cap is not None:
        if record.storage_path == _PENDING or record.deleted_at is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This file can't be updated.")
    elif record.storage_path != _PENDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This file has already been uploaded.")

    limit = min(MAX_UPLOAD_BYTES, replace_cap if replace_cap is not None else record.size)
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File is larger than declared.")

    path = stored_path(file_id)
    tmp = path.with_name(path.name + ".part")
    received = 0
    with tmp.open("wb") as out:
        async for chunk in request.stream():
            received += len(chunk)
            if received > limit:
                out.close()
                tmp.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="File is larger than declared.",
                )
            out.write(chunk)
    tmp.replace(path)  # atomic: a failed replace never corrupts the old bytes

    record.storage_path = file_id
    record.size = received
    db.commit()
    return Message(message="Upload successful.")


@router.post("/confirm", response_model=FileOut)
def confirm_upload(
    body: ConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = db.query(File).filter(File.id == body.fileId, File.uploader_id == current_user.id).first()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
    if record.storage_path == _PENDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The upload has not completed yet.")

    room_id = body.roomId or None
    if room_id and room_id != record.room_id:
        if not is_member(db, room_id, current_user.id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found.")
        record.room_id = room_id

    if record.room_id:
        room = db.query(Room).filter(Room.id == record.room_id).first()
        members = db.query(RoomParticipant).filter(RoomParticipant.room_id == record.room_id).all()
        for m in members:
            if m.user_id != current_user.id:
                notify(
                    db,
                    m.user_id,
                    "upload",
                    "New file shared",
                    f'{current_user.name} shared {record.name} in "{room.name if room else "a room"}"',
                    {"roomId": record.room_id, "fileId": record.id, "targetUrl": "/files"},
                )
    db.commit()
    db.refresh(record)
    return file_out(db, record, current_user)


@router.post("/{file_id}/replace", response_model=PresignResponse)
def replace_file_content(
    file_id: str,
    request: Request,
    body: ReplaceRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start overwriting a file you own with new contents of the same type
    (keeps its id, name and sharing). Returns a short-lived upload URL."""
    record = _get_file(db, file_id, current_user, own=True)
    if record.storage_path == _PENDING or record.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This file can't be updated.")
    if normalize_mime(body.fileType) != record.mime_type:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="The new contents must be the same file type.",
        )
    if _used_bytes(db, current_user) - record.size + body.fileSize > STORAGE_LIMIT_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Storage quota exceeded.")
    token = create_upload_token(record.id, current_user.id, replace_max_bytes=body.fileSize)
    base = str(request.base_url).rstrip("/")
    return PresignResponse(uploadUrl=f"{base}/files/{record.id}/upload?token={quote(token)}", fileId=record.id)


@router.patch("/{file_id}", response_model=FileOut)
def rename_file(
    file_id: str,
    body: RenameRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = _get_file(db, file_id, current_user, own=True)
    record.name = sanitize_file_name(body.name)
    db.commit()
    db.refresh(record)
    return file_out(db, record, current_user)


@router.post("/{file_id}/favorite", response_model=Message)
def favorite_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_file(db, file_id, current_user, own=False)
    exists = (
        db.query(FileFavorite)
        .filter(FileFavorite.file_id == file_id, FileFavorite.user_id == current_user.id)
        .first()
    )
    if not exists:
        db.add(FileFavorite(file_id=file_id, user_id=current_user.id))
        db.commit()
    return Message(message="Added to favorites.")


@router.delete("/{file_id}/favorite", response_model=Message)
def unfavorite_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_file(db, file_id, current_user, own=False)
    db.query(FileFavorite).filter(
        FileFavorite.file_id == file_id, FileFavorite.user_id == current_user.id
    ).delete(synchronize_session=False)
    db.commit()
    return Message(message="Removed from favorites.")


@router.delete("/{file_id}", response_model=Message)
def soft_delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Move to Trash (restorable)."""
    record = _get_file(db, file_id, current_user, own=True)
    if record.deleted_at is None:
        record.deleted_at = _now()
        db.commit()
    return Message(message="Moved to Trash.")


@router.post("/{file_id}/restore", response_model=Message)
def restore_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = _get_file(db, file_id, current_user, own=True)
    if record.deleted_at is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="File is not in Trash.")
    record.deleted_at = None
    db.commit()
    return Message(message="File restored.")


@router.delete("/{file_id}/delete", response_model=Message)
def hard_delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently delete the file and its bytes."""
    record = _get_file(db, file_id, current_user, own=True)
    stored_path(record.id).unlink(missing_ok=True)
    db.query(FileFavorite).filter(FileFavorite.file_id == record.id).delete(synchronize_session=False)
    db.delete(record)
    db.commit()
    return Message(message="File deleted permanently.")


@router.get("/{file_id}/download")
def download_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = _get_file(db, file_id, current_user, own=False)
    if record.storage_path == _PENDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="File has not been uploaded yet.")
    path = stored_path(record.id)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File content not found on server.")
    # FileResponse(filename=...) sends Content-Disposition: attachment.
    return FileResponse(
        path=str(path),
        filename=record.name,
        media_type=record.mime_type,
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"},
    )
