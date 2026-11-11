"""
WebSocket signaling hub for WebRTC peer connections.

1. POST /ws/ticket {"roomId": "..."} with the bearer token → {"ticket": "..."}
   (single-use, valid 30 s, bound to the room).
2. Connect to ws://host/ws/{room_id}?ticket=<ticket>.

Server → client events:
    {"type": "welcome", "payload": {"peers": [{"id", "name"}]}}
    {"type": "peer-joined" | "peer-rejoined" | "peer-left", "senderId", "senderName"}
    {"type": "session-replaced"}   — the same user connected from elsewhere
Client → server frames (relayed; `senderId`/`senderName` are stamped by the
server and cannot be spoofed): offer, answer, ice-candidate, chat-message,
draw, cursor. Add "targetUserId" to send to one peer only.

Close codes:
    4001 — missing/invalid/expired ticket
    4003 — not a member of the room
    4004 — room not found
"""

import json

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

import hub
from auth import get_current_user, issue_ws_ticket, redeem_ws_ticket
from database import SessionLocal, get_db
from models import Message, Room, RoomParticipant, User, WhiteboardStroke
from services import require_member_room

router = APIRouter()

CLIENT_MESSAGE_TYPES = {"offer", "answer", "ice-candidate", "chat-message", "draw", "cursor"}
MAX_MESSAGE_BYTES = 512 * 1024
MAX_MESSAGES_PER_ROOM = 500
MAX_STROKES_PER_ROOM = 2000


class TicketRequest(BaseModel):
    roomId: str


@router.post("/ws/ticket")
def create_ticket(
    body: TicketRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_member_room(db, body.roomId, current_user)
    return {"ticket": issue_ws_ticket(current_user.id, body.roomId)}


async def _send(ws: WebSocket, message: dict) -> None:
    try:
        await ws.send_text(json.dumps(message))
    except Exception:  # noqa: BLE001 — a dead peer must not break the hub
        pass


async def _broadcast(room_id: str, except_user: str, message: dict) -> None:
    state = hub.rooms.get(room_id)
    if not state:
        return
    for conn in list(state.by_user.values()):
        if conn.user_id != except_user:
            await _send(conn.websocket, message)


def _str(value, limit: int) -> str | None:
    return value[:limit] if isinstance(value, str) and value else None


def _persist(room_id: str, user_id: str, user_name: str, message: dict) -> None:
    """Store chat messages and whiteboard strokes for late joiners."""
    payload = message.get("payload") or {}
    if not isinstance(payload, dict):
        return
    db = SessionLocal()
    try:
        if message["type"] == "chat-message":
            stored = {
                "text": _str(payload.get("text"), 4000),
                "fileId": _str(payload.get("fileId"), 64),
                "fileName": _str(payload.get("fileName"), 255),
                "fileSize": payload.get("fileSize") if isinstance(payload.get("fileSize"), int) else None,
                "fileType": _str(payload.get("fileType"), 100),
            }
            if not stored["text"] and not stored["fileId"]:
                return
            db.add(Message(room_id=room_id, sender_id=user_id, payload_json=json.dumps(stored)))
            db.flush()
            count = db.query(Message).filter(Message.room_id == room_id).count()
            if count > MAX_MESSAGES_PER_ROOM:
                oldest = (
                    db.query(Message)
                    .filter(Message.room_id == room_id)
                    .order_by(Message.sent_at)
                    .limit(count - MAX_MESSAGES_PER_ROOM)
                    .all()
                )
                for m in oldest:
                    db.delete(m)
            db.commit()
        elif message["type"] == "draw":
            stroke_id = _str(payload.get("strokeId"), 100)
            action = payload.get("action")
            if not stroke_id:
                return
            existing = (
                db.query(WhiteboardStroke)
                .filter(WhiteboardStroke.room_id == room_id, WhiteboardStroke.stroke_id == stroke_id)
                .first()
            )
            if action == "remove":
                if existing:
                    db.delete(existing)
            elif action in {"add", "update"}:
                data = json.dumps(payload.get("objectData"))
                if existing:
                    if action == "update":
                        existing.object_json = data
                elif db.query(WhiteboardStroke).filter(WhiteboardStroke.room_id == room_id).count() < MAX_STROKES_PER_ROOM:
                    db.add(
                        WhiteboardStroke(
                            room_id=room_id,
                            stroke_id=stroke_id,
                            object_json=data,
                            user_id=user_id,
                            user_name=user_name,
                        )
                    )
            db.commit()
    finally:
        db.close()


@router.websocket("/ws/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    ticket: str | None = Query(default=None),
):
    user_id = redeem_ws_ticket(ticket, room_id)
    if user_id is None:
        await websocket.close(code=4001)
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        room = db.query(Room).filter(Room.id == room_id, Room.deleted_at.is_(None)).first()
        if user is None:
            await websocket.close(code=4001)
            return
        if room is None:
            await websocket.close(code=4004)
            return
        member = (
            db.query(RoomParticipant)
            .filter(RoomParticipant.room_id == room_id, RoomParticipant.user_id == user.id)
            .first()
        )
        if member is None:
            await websocket.close(code=4003)
            return
        user_name = user.name
    finally:
        db.close()

    await websocket.accept()
    state = hub.rooms.setdefault(room_id, hub.RoomConnections())
    previous = state.by_user.get(user_id)
    if previous is not None:
        await _send(previous.websocket, {"type": "session-replaced"})
        try:
            await previous.websocket.close()
        except Exception:  # noqa: BLE001
            pass

    peers = [{"id": c.user_id, "name": c.user_name} for c in state.by_user.values() if c.user_id != user_id]
    conn = hub.Connection(user_id=user_id, user_name=user_name, websocket=websocket)
    state.by_user[user_id] = conn

    await _send(websocket, {"type": "welcome", "payload": {"peers": peers}})
    await _broadcast(
        room_id,
        user_id,
        {"type": "peer-rejoined" if previous else "peer-joined", "senderId": user_id, "senderName": user_name},
    )

    try:
        while True:
            raw = await websocket.receive_text()
            if len(raw) > MAX_MESSAGE_BYTES:
                continue
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if not isinstance(message, dict) or message.get("type") not in CLIENT_MESSAGE_TYPES:
                continue

            outbound = {
                "type": message["type"],
                "payload": message.get("payload"),
                "senderId": user_id,
                "senderName": user_name,
            }
            target = message.get("targetUserId")
            if isinstance(target, str) and target:
                outbound["targetUserId"] = target
                peer = state.by_user.get(target)
                if peer is not None:
                    await _send(peer.websocket, outbound)
            else:
                await _broadcast(room_id, user_id, outbound)
                _persist(room_id, user_id, user_name, outbound)
    except WebSocketDisconnect:
        pass
    finally:
        # Only clean up if we're still the registered connection (not replaced).
        if state.by_user.get(user_id) is conn:
            state.by_user.pop(user_id, None)
            await _broadcast(room_id, user_id, {"type": "peer-left", "senderId": user_id, "senderName": user_name})
        if not state.by_user:
            hub.rooms.pop(room_id, None)
