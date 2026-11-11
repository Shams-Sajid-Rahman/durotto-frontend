"""Request/response models.

Field names mirror the TypeScript types in the Next.js client (lib/api.ts) so
the frontend works unchanged whether it talks to this backend or to the
built-in Next.js API routes.
"""

from __future__ import annotations

import re
from datetime import datetime
from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    # bcrypt only uses 72 bytes
    password: str = Field(min_length=8, max_length=72)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be blank")
        return v


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ChangePasswordRequest(BaseModel):
    currentPassword: str = Field(min_length=1, max_length=128)
    newPassword: str = Field(min_length=8, max_length=72)


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    bio: Optional[str] = None
    avatarUrl: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


_AVATAR_RE = re.compile(r"^(data:image/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+|https?://[^\s\"'<>]+)$")


class UpdateUserRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    bio: Optional[str] = Field(default=None, max_length=500)
    avatarUrl: Optional[str] = Field(default=None, max_length=1_500_000)

    @field_validator("avatarUrl")
    @classmethod
    def avatar_must_be_image(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return v
        if not _AVATAR_RE.match(v) or (v.startswith("http") and len(v) > 500):
            raise ValueError("avatar must be a PNG/JPEG/GIF/WebP data URL or an http(s) URL")
        return v


class UserStats(BaseModel):
    meetingsAttended: int
    hoursOnline: int
    filesShared: int
    roomsCreated: int


class StatusEnum(str, Enum):
    online = "online"
    away = "away"
    dnd = "dnd"
    offline = "offline"


class ThemeEnum(str, Enum):
    dark = "dark"
    light = "light"
    system = "system"


class NotificationPrefs(BaseModel):
    meetingReminders: bool = True
    chatMessages: bool = True
    fileUploads: bool = True
    sounds: bool = False


class NotificationPrefsPatch(BaseModel):
    meetingReminders: Optional[bool] = None
    chatMessages: Optional[bool] = None
    fileUploads: Optional[bool] = None
    sounds: Optional[bool] = None


class UserSettings(BaseModel):
    status: StatusEnum = StatusEnum.online
    notifications: NotificationPrefs = Field(default_factory=NotificationPrefs)
    theme: ThemeEnum = ThemeEnum.dark


class UpdateSettingsRequest(BaseModel):
    status: Optional[StatusEnum] = None
    notifications: Optional[NotificationPrefsPatch] = None
    theme: Optional[ThemeEnum] = None


class SignInEntry(BaseModel):
    id: str
    userAgent: str
    ip: str
    success: bool
    at: datetime


class OnlineUser(BaseModel):
    id: str
    name: str
    roomId: str
    roomName: str


# ---------------------------------------------------------------------------
# Rooms
# ---------------------------------------------------------------------------


class Participant(BaseModel):
    id: str
    name: str


class RoomOut(BaseModel):
    id: str
    name: str
    join_code: str
    host_id: str
    is_password_protected: bool
    participant_count: int  # connected to the call right now
    member_count: int
    created_at: datetime


class RoomDetail(RoomOut):
    participants: list[Participant]


class CreateRoomRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    password: Optional[str] = Field(default=None, min_length=4, max_length=64)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Room name is required.")
        return v

    @field_validator("password", mode="before")
    @classmethod
    def empty_password_is_none(cls, v: Any) -> Any:
        return None if v == "" else v


class JoinByCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)
    password: Optional[str] = Field(default=None, max_length=64)

    @field_validator("code")
    @classmethod
    def code_must_be_alphanumeric(cls, v: str) -> str:
        v = v.upper()
        if not re.fullmatch(r"[A-Z0-9]{6}", v):
            raise ValueError("code must be exactly 6 letters or digits")
        return v


class JoinByCodeResponse(BaseModel):
    roomId: Optional[str]
    joinCode: str
    requiresPassword: Optional[bool] = None


class MessagePayload(BaseModel):
    text: Optional[str] = None
    fileId: Optional[str] = None
    fileName: Optional[str] = None
    fileSize: Optional[int] = None
    fileType: Optional[str] = None


class RoomMessageOut(BaseModel):
    id: str
    senderId: str
    senderName: str
    payload: MessagePayload
    sentAt: datetime


class WhiteboardStrokeOut(BaseModel):
    strokeId: str
    action: Literal["add"] = "add"
    objectData: Any
    userId: str
    userName: str
    createdAt: datetime


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------


class FileOut(BaseModel):
    id: str
    name: str
    size: int
    mimeType: str
    uploaderId: str
    uploaderName: str
    uploadedAt: datetime
    roomId: Optional[str] = None
    roomName: Optional[str] = None
    roomOwnerId: Optional[str] = None
    isFavorite: bool
    deletedAt: Optional[datetime] = None


class PresignRequest(BaseModel):
    fileName: str = Field(min_length=1, max_length=255)
    fileType: str = Field(default="application/octet-stream", max_length=100)
    fileSize: int = Field(ge=0, le=100_000_000)
    roomId: Optional[str] = None


class PresignResponse(BaseModel):
    uploadUrl: str
    fileId: str


class ConfirmRequest(BaseModel):
    fileId: str
    roomId: Optional[str] = None


class RenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class UsageResponse(BaseModel):
    totalBytes: int
    totalGb: float
    limitGb: int = 10
    limitBytes: int = 10 * 1024**3


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


class NotificationOut(BaseModel):
    id: str
    type: str
    title: str
    body: str
    isRead: bool
    createdAt: datetime
    payload: Optional[Any] = None


class Message(BaseModel):
    message: str
