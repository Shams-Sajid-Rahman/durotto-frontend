"""In-memory registry of live WebSocket connections, per room.

Single-process only — use Redis pub/sub (or similar) to run several workers.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from fastapi import WebSocket


@dataclass
class Connection:
    user_id: str
    user_name: str
    websocket: WebSocket


@dataclass
class RoomConnections:
    by_user: dict[str, Connection] = field(default_factory=dict)


rooms: dict[str, RoomConnections] = {}


def connected_peers(room_id: str) -> list[dict[str, str]]:
    state = rooms.get(room_id)
    if not state:
        return []
    return [{"id": c.user_id, "name": c.user_name} for c in state.by_user.values()]


def active_room_ids() -> list[str]:
    return list(rooms.keys())
