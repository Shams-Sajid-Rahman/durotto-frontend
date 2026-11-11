from pathlib import Path
from urllib.parse import urlparse

import services

CONTENT = b"hello, durotto"


def _upload(user, room_id: str | None = None, name: str = "notes.txt", content: bytes = CONTENT):
    pre = user.post(
        "/files/presign",
        json={"fileName": name, "fileType": "text/plain", "fileSize": len(content), "roomId": room_id or ""},
    )
    assert pre.status_code == 201, pre.text
    body = pre.json()
    url = urlparse(body["uploadUrl"])
    put = user.client.put(f"{url.path}?{url.query}", content=content)
    assert put.status_code == 200, put.text
    confirmed = user.post("/files/confirm", json={"fileId": body["fileId"], "roomId": room_id or ""})
    assert confirmed.status_code == 200, confirmed.text
    return confirmed.json(), body


# ── Rooms ────────────────────────────────────────────────────────────────────


def test_rooms_are_private_to_members(make_user):
    alice, bob = make_user("Alice"), make_user("Bob")
    room = alice.post("/rooms", json={"name": "Standup"}).json()
    assert room["join_code"].isalnum() and len(room["join_code"]) == 6
    assert room["member_count"] == 1

    assert [r["id"] for r in alice.get("/rooms").json()] == [room["id"]]
    assert bob.get("/rooms").json() == []
    for path in ("", "/messages", "/files", "/whiteboard"):
        assert bob.get(f"/rooms/{room['id']}{path}").status_code == 404

    detail = alice.get(f"/rooms/{room['id']}").json()
    assert detail["participants"] == [{"id": alice.user["id"], "name": "Alice"}]


def test_join_by_code_with_password_and_host_notification(make_user):
    alice, bob = make_user("Alice"), make_user("Bob")
    room = alice.post("/rooms", json={"name": "Locked", "password": "s3cret"}).json()

    ask = bob.post("/rooms/join-by-code", json={"code": room["join_code"].lower()}).json()
    assert ask == {"roomId": None, "joinCode": room["join_code"], "requiresPassword": True}
    assert bob.post("/rooms/join-by-code", json={"code": room["join_code"], "password": "nope"}).status_code == 403
    ok = bob.post("/rooms/join-by-code", json={"code": room["join_code"], "password": "s3cret"})
    assert ok.json()["roomId"] == room["id"]
    assert bob.get(f"/rooms/{room['id']}").status_code == 200

    joins = [n for n in alice.get("/notifications").json() if n["type"] == "join"]
    assert "Bob" in joins[0]["body"]
    assert bob.patch(f"/notifications/{joins[0]['id']}/read").status_code == 404
    assert alice.patch(f"/notifications/{joins[0]['id']}/read").json()["isRead"] is True


def test_join_rejects_bad_codes(make_user):
    bob = make_user("Bob")
    assert bob.post("/rooms/join-by-code", json={"code": "abc"}).status_code == 422
    assert bob.post("/rooms/join-by-code", json={"code": "ZZZZZZ"}).status_code == 404


# ── Files ────────────────────────────────────────────────────────────────────


def test_upload_download_roundtrip(make_user):
    alice = make_user("Alice")
    file, _ = _upload(alice)
    assert file["size"] == len(CONTENT)
    assert file["mimeType"] == "text/plain"
    assert file["uploaderName"] == "Alice"

    res = alice.get(f"/files/{file['id']}/download")
    assert res.status_code == 200
    assert res.content == CONTENT
    assert res.headers["content-disposition"].startswith("attachment")

    assert [f["id"] for f in alice.get("/files").json()] == [file["id"]]
    assert alice.get("/files/usage").json()["totalBytes"] == len(CONTENT)


def test_upload_cannot_escape_uploads_dir(make_user):
    alice = make_user("Alice")
    file, _ = _upload(alice, name="../../main.py")
    assert file["name"] == ".._.._main.py"
    stored = services.stored_path(file["id"])
    assert stored.exists()
    assert stored.resolve().parent == Path(services.uploads_dir()).resolve()


def test_upload_url_is_protected_and_single_use(make_user):
    alice = make_user("Alice")
    pre = alice.post("/files/presign", json={"fileName": "a.txt", "fileType": "text/plain", "fileSize": len(CONTENT)}).json()
    url = urlparse(pre["uploadUrl"])

    assert alice.client.put(url.path, content=CONTENT).status_code == 403
    assert alice.client.put(f"{url.path}?{url.query}", content=CONTENT + b"extra bytes").status_code == 413
    assert alice.client.put(f"{url.path}?{url.query}", content=CONTENT).status_code == 200
    assert alice.client.put(f"{url.path}?{url.query}", content=CONTENT).status_code == 409


def test_presign_rejections(make_user):
    alice, bob = make_user("Alice"), make_user("Bob")
    room = alice.post("/rooms", json={"name": "R"}).json()
    assert alice.post("/files/presign", json={"fileName": "x.html", "fileType": "text/html", "fileSize": 1}).status_code == 415
    assert alice.post("/files/presign", json={"fileName": "x.svg", "fileType": "image/svg+xml", "fileSize": 1}).status_code == 415
    assert bob.post("/files/presign", json={"fileName": "x.txt", "fileType": "text/plain", "fileSize": 1, "roomId": room["id"]}).status_code == 404


def test_room_files_visible_to_members_only(make_user):
    alice, bob, eve = make_user("Alice"), make_user("Bob"), make_user("Eve")
    room = alice.post("/rooms", json={"name": "Shared"}).json()
    bob.post("/rooms/join-by-code", json={"code": room["join_code"]})

    file, _ = _upload(alice, room_id=room["id"])
    assert [f["id"] for f in bob.get(f"/rooms/{room['id']}/files").json()] == [file["id"]]
    assert bob.get(f"/files/{file['id']}/download").status_code == 200
    assert eve.get(f"/files/{file['id']}/download").status_code == 404
    assert bob.delete(f"/files/{file['id']}").status_code == 403

    uploads = [n for n in bob.get("/notifications").json() if n["type"] == "upload"]
    assert uploads and "notes.txt" in uploads[0]["body"]

    # favorites are per user
    assert bob.post(f"/files/{file['id']}/favorite").status_code == 200
    assert bob.get("/files").json()[0]["isFavorite"] is True
    assert alice.get("/files").json()[0]["isFavorite"] is False


def test_trash_lifecycle(make_user):
    alice = make_user("Alice")
    file, _ = _upload(alice)
    fid = file["id"]
    assert alice.patch(f"/files/{fid}", json={"name": "plan.txt"}).json()["name"] == "plan.txt"
    assert alice.post(f"/files/{fid}/restore").status_code == 409
    assert alice.delete(f"/files/{fid}").status_code == 200
    assert alice.get("/files").json()[0]["deletedAt"] is not None
    assert alice.post(f"/files/{fid}/restore").status_code == 200
    assert alice.delete(f"/files/{fid}/delete").status_code == 200
    assert alice.get("/files").json() == []
    assert not services.stored_path(fid).exists()


def test_replace_file_content(make_user):
    alice, bob = make_user("Alice"), make_user("Bob")
    room = alice.post("/rooms", json={"name": "R"}).json()
    bob.post("/rooms/join-by-code", json={"code": room["join_code"]})
    file, _ = _upload(alice, room_id=room["id"])
    new = b"edited board contents"

    assert bob.post(f"/files/{file['id']}/replace", json={"fileSize": len(new), "fileType": "text/plain"}).status_code == 403
    assert alice.post(f"/files/{file['id']}/replace", json={"fileSize": 5, "fileType": "image/png"}).status_code == 415

    res = alice.post(f"/files/{file['id']}/replace", json={"fileSize": len(new), "fileType": "text/plain"})
    assert res.status_code == 200, res.text
    url = urlparse(res.json()["uploadUrl"])
    assert alice.client.put(f"{url.path}?{url.query}", content=new + b"!").status_code == 413
    assert alice.get(f"/files/{file['id']}/download").content == CONTENT  # failed replace kept old bytes
    assert alice.client.put(f"{url.path}?{url.query}", content=new).status_code == 200
    assert alice.get(f"/files/{file['id']}/download").content == new
    assert [f["id"] for f in alice.get("/files").json()] == [file["id"]]
