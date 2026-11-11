import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import Notification, User
from schemas import Message, NotificationOut

router = APIRouter()


def _notif_to_out(n: Notification) -> NotificationOut:
    payload = None
    if n.payload_json:
        try:
            payload = json.loads(n.payload_json)
        except (json.JSONDecodeError, TypeError):
            payload = None
    return NotificationOut(
        id=n.id,
        type=n.type,
        title=n.title,
        body=n.body,
        isRead=n.is_read,
        createdAt=n.created_at,
        payload=payload,
    )


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notifications = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return [_notif_to_out(n) for n in notifications]


@router.post("/mark-all-read", response_model=Message)
def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read.is_(False),
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return Message(message="All notifications marked as read.")


@router.patch("/{notification_id}/read", response_model=NotificationOut)
def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Someone else's notification behaves exactly like a missing one.
    notif = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == current_user.id)
        .first()
    )
    if notif is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return _notif_to_out(notif)
