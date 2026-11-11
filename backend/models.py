import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, Integer, DateTime, ForeignKey, Text, Float
)
from sqlalchemy.orm import relationship
from database import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id = Column(String(32), primary_key=True, default=_uuid)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    bio = Column(Text, nullable=True)
    avatar_url = Column(String(500), nullable=True)
    # JSON-encoded settings blob — defaults to empty object
    settings_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, nullable=False, default=_now)

    # Relationships
    hosted_rooms = relationship("Room", back_populates="host", foreign_keys="Room.host_id")
    participations = relationship("RoomParticipant", back_populates="user")
    files = relationship("File", back_populates="uploader", foreign_keys="File.uploader_id")
    notifications = relationship("Notification", back_populates="user")
    messages = relationship("Message", back_populates="sender")


class Room(Base):
    __tablename__ = "rooms"

    id = Column(String(32), primary_key=True, default=_uuid)
    name = Column(String(100), nullable=False)
    join_code = Column(String(6), unique=True, nullable=False, index=True)
    host_id = Column(String(32), ForeignKey("users.id"), nullable=False)
    is_password_protected = Column(Boolean, nullable=False, default=False)
    hashed_password = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, default=_now)
    deleted_at = Column(DateTime, nullable=True)

    # Relationships
    host = relationship("User", back_populates="hosted_rooms", foreign_keys=[host_id])
    participants = relationship("RoomParticipant", back_populates="room")
    files = relationship("File", back_populates="room")
    messages = relationship("Message", back_populates="room")


class RoomParticipant(Base):
    __tablename__ = "room_participants"

    room_id = Column(String(32), ForeignKey("rooms.id"), primary_key=True)
    user_id = Column(String(32), ForeignKey("users.id"), primary_key=True)
    joined_at = Column(DateTime, nullable=False, default=_now)

    # Relationships
    room = relationship("Room", back_populates="participants")
    user = relationship("User", back_populates="participations")


class File(Base):
    __tablename__ = "files"

    id = Column(String(32), primary_key=True, default=_uuid)
    name = Column(String(255), nullable=False)
    size = Column(Integer, nullable=False, default=0)
    mime_type = Column(String(100), nullable=False)
    storage_path = Column(String(500), nullable=False, default="pending")
    uploader_id = Column(String(32), ForeignKey("users.id"), nullable=False)
    room_id = Column(String(32), ForeignKey("rooms.id"), nullable=True)
    is_favorite = Column(Boolean, nullable=False, default=False)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_now)

    # Relationships
    uploader = relationship("User", back_populates="files", foreign_keys=[uploader_id])
    room = relationship("Room", back_populates="files")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(32), primary_key=True, default=_uuid)
    user_id = Column(String(32), ForeignKey("users.id"), nullable=False)
    type = Column(String(50), nullable=False)  # join/upload/mention/system
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    is_read = Column(Boolean, nullable=False, default=False)
    payload_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_now)

    # Relationships
    user = relationship("User", back_populates="notifications")


class Message(Base):
    __tablename__ = "messages"

    id = Column(String(32), primary_key=True, default=_uuid)
    room_id = Column(String(32), ForeignKey("rooms.id"), nullable=False)
    sender_id = Column(String(32), ForeignKey("users.id"), nullable=False)
    payload_json = Column(Text, nullable=False)
    sent_at = Column(DateTime, nullable=False, default=_now)

    # Relationships
    room = relationship("Room", back_populates="messages")
    sender = relationship("User", back_populates="messages")


class FileFavorite(Base):
    """Favorites are per user, not a global flag on the file."""

    __tablename__ = "file_favorites"

    file_id = Column(String(32), ForeignKey("files.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(String(32), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime, nullable=False, default=_now)


class WhiteboardStroke(Base):
    """Current whiteboard objects for a room (so late joiners see the board)."""

    __tablename__ = "whiteboard_strokes"

    room_id = Column(String(32), ForeignKey("rooms.id"), primary_key=True)
    stroke_id = Column(String(100), primary_key=True)
    object_json = Column(Text, nullable=False)
    user_id = Column(String(32), nullable=False)
    user_name = Column(String(100), nullable=False)
    created_at = Column(DateTime, nullable=False, default=_now)


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id = Column(String(32), primary_key=True, default=_uuid)
    user_id = Column(String(32), nullable=True, index=True)
    email = Column(String(255), nullable=False)
    ip_address = Column(String(45), nullable=False)
    user_agent = Column(String(300), nullable=False, default="")
    success = Column(Boolean, nullable=False, default=False)
    attempted_at = Column(DateTime, nullable=False, default=_now)


class FailedJoinAttempt(Base):
    __tablename__ = "failed_join_attempts"

    id = Column(String(32), primary_key=True, default=_uuid)
    ip_address = Column(String(45), nullable=False)
    join_code = Column(String(6), nullable=False)
    attempted_at = Column(DateTime, nullable=False, default=_now)
