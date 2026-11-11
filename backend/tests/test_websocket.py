import pytest
from starlette.websockets import WebSocketDisconnect


def _ticket(user, room_id):
    res = user.post("/ws/ticket", json={"roomId": room_id})
    assert res.status_code == 200, res.text
    return res.json()["ticket"]


def _setup(make_user):
    alice, bob = make_user("Alice"), make_user("Bob")
    room = alice.post("/rooms", json={"name": "Call"}).json()
    bob.post("/rooms/join-by-code", json={"code": room["join_code"]})
    return alice, bob, room


def test_ticket_requires_membership(make_user):
    alice, _, room = _setup(make_user)
    eve = make_user("Eve")
    assert eve.post("/ws/ticket", json={"roomId": room["id"]}).status_code == 404
    assert alice.client.post("/ws/ticket", json={"roomId": room["id"]}).status_code == 401


def test_invalid_or_reused_ticket_is_rejected(client, make_user):
    alice, _, room = _setup(make_user)
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"/ws/{room['id']}?ticket=bogus") as ws:
            ws.receive_text()
    assert exc.value.code == 4001

    ticket = _ticket(alice, room["id"])
    with client.websocket_connect(f"/ws/{room['id']}?ticket={ticket}") as ws:
        assert ws.receive_json()["type"] == "welcome"
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"/ws/{room['id']}?ticket={ticket}") as ws:
            ws.receive_text()
    assert exc.value.code == 4001


def test_presence_relay_and_persistence(client, make_user):
    alice, bob, room = _setup(make_user)
    rid = room["id"]

    with client.websocket_connect(f"/ws/{rid}?ticket={_ticket(alice, rid)}") as wa:
        assert wa.receive_json() == {"type": "welcome", "payload": {"peers": []}}

        with client.websocket_connect(f"/ws/{rid}?ticket={_ticket(bob, rid)}") as wb:
            welcome = wb.receive_json()
            assert welcome["payload"]["peers"] == [{"id": alice.user["id"], "name": "Alice"}]
            joined = wa.receive_json()
            assert joined == {"type": "peer-joined", "senderId": bob.user["id"], "senderName": "Bob"}

            # Live presence is visible through the REST API.
            assert alice.get(f"/rooms/{rid}").json()["participant_count"] == 2
            assert alice.get("/users/online").json() == [
                {"id": bob.user["id"], "name": "Bob", "roomId": rid, "roomName": "Call"}
            ]

            # Targeted relay; a spoofed senderId is overwritten.
            wb.send_json({"type": "offer", "targetUserId": alice.user["id"], "senderId": "spoof", "payload": {"sdp": "v=0"}})
            offer = wa.receive_json()
            assert offer["senderId"] == bob.user["id"]
            assert offer["payload"] == {"sdp": "v=0"}

            # Unknown types are dropped; chat + draw are persisted.
            wb.send_json({"type": "peer-left"})
            wb.send_json({"type": "chat-message", "payload": {"text": "hello"}})
            assert wa.receive_json()["type"] == "chat-message"
            wb.send_json({"type": "draw", "payload": {"strokeId": "s1", "action": "add", "objectData": {"type": "Rect"}}})
            assert wa.receive_json()["type"] == "draw"
            wb.send_json({"type": "draw", "payload": {"strokeId": "s1", "action": "update", "objectData": {"type": "Rect", "left": 3}}})
            assert wa.receive_json()["type"] == "draw"

        assert wa.receive_json() == {"type": "peer-left", "senderId": bob.user["id"], "senderName": "Bob"}

    messages = alice.get(f"/rooms/{rid}/messages").json()
    assert [(m["senderName"], m["payload"]["text"]) for m in messages] == [("Bob", "hello")]
    strokes = alice.get(f"/rooms/{rid}/whiteboard").json()
    assert strokes[0]["strokeId"] == "s1"
    assert strokes[0]["objectData"] == {"type": "Rect", "left": 3}
