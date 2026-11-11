import jwt

from auth import create_access_token, create_upload_token


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_register_login_and_me(client, make_user):
    alice = make_user("Alice")
    assert alice.user["name"] == "Alice"
    assert "hashed_password" not in alice.user
    assert set(alice.user) == {"id", "name", "email", "bio", "avatarUrl"}

    res = client.post("/auth/login", json={"email": alice.email.upper(), "password": alice.password})
    assert res.status_code == 200
    me = client.get("/users/me", headers={"Authorization": f"Bearer {res.json()['access_token']}"})
    assert me.json()["email"] == alice.email

    notes = alice.get("/notifications").json()
    assert notes[0]["title"].startswith("Welcome")
    assert notes[0]["isRead"] is False


def test_login_failures_are_indistinguishable(client, make_user):
    alice = make_user("Alice")
    wrong = client.post("/auth/login", json={"email": alice.email, "password": "nope-nope"})
    unknown = client.post("/auth/login", json={"email": "ghost@example.com", "password": "nope-nope"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_register_validation_and_duplicates(client, make_user):
    alice = make_user("Alice")
    assert client.post("/auth/register", json={"name": "A", "email": alice.email, "password": "password123"}).status_code == 409
    assert client.post("/auth/register", json={"name": "A", "email": "x@example.com", "password": "short"}).status_code == 422
    assert client.post("/auth/register", json={"name": "  ", "email": "y@example.com", "password": "password123"}).status_code == 422
    assert client.post("/auth/register", json={"name": "A", "email": "bad", "password": "password123"}).status_code == 422


def test_tokens_are_validated(client, make_user):
    alice = make_user("Alice")
    assert client.get("/users/me").status_code == 401
    assert client.get("/users/me", headers={"Authorization": "Bearer garbage"}).status_code == 401

    forged = jwt.encode({"sub": alice.user["id"], "typ": "access"}, "wrong-secret", algorithm="HS256")
    assert client.get("/users/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401

    # An upload token is not a login token.
    upload = create_upload_token("f" * 32, alice.user["id"])
    assert client.get("/users/me", headers={"Authorization": f"Bearer {upload}"}).status_code == 401

    valid = create_access_token(alice.user["id"])
    assert client.get("/users/me", headers={"Authorization": f"Bearer {valid}"}).status_code == 200


def test_change_password(client, make_user):
    alice = make_user("Alice")
    assert alice.post("/auth/change-password", json={"currentPassword": "wrong", "newPassword": "newpassword1"}).status_code == 400
    assert alice.post("/auth/change-password", json={"currentPassword": alice.password, "newPassword": "newpassword1"}).status_code == 200
    assert client.post("/auth/login", json={"email": alice.email, "password": "newpassword1"}).status_code == 200


def test_profile_settings_and_sign_ins(client, make_user):
    alice = make_user("Alice")
    res = alice.patch("/users/me", json={"name": "Ada", "bio": "hi", "avatarUrl": "data:image/png;base64,AAAA"})
    assert res.status_code == 200
    assert res.json()["avatarUrl"].startswith("data:image/png")
    assert alice.patch("/users/me", json={"avatarUrl": "javascript:alert(1)"}).status_code == 422

    settings = alice.get("/users/me/settings").json()
    assert settings["theme"] == "dark"
    assert set(settings["notifications"]) == {"meetingReminders", "chatMessages", "fileUploads", "sounds"}
    updated = alice.patch("/users/me/settings", json={"theme": "light", "notifications": {"sounds": True}}).json()
    assert updated["theme"] == "light"
    assert updated["notifications"]["sounds"] is True
    assert updated["notifications"]["chatMessages"] is True

    client.post("/auth/login", json={"email": alice.email, "password": "wrong-pw"})
    history = alice.get("/users/me/sessions").json()
    assert any(not h["success"] for h in history)


def test_delete_account(client, make_user):
    alice = make_user("Alice")
    room = alice.post("/rooms", json={"name": "Mine"}).json()
    assert alice.delete("/users/me", json={"password": "nope"}).status_code == 400
    assert alice.delete("/users/me", json={"password": alice.password}).status_code == 200
    assert alice.get("/users/me").status_code == 401
    bob = make_user("Bob")
    assert bob.post("/rooms/join-by-code", json={"code": room["join_code"]}).status_code == 404


def test_login_is_rate_limited(client, make_user):
    from limiter import limiter

    alice = make_user("Alice")
    limiter.enabled = True
    limiter.reset()
    try:
        codes = [
            client.post("/auth/login", json={"email": alice.email, "password": "wrong-pw"}).status_code
            for _ in range(7)
        ]
    finally:
        limiter.enabled = False
        limiter.reset()
    assert codes[:5] == [401] * 5
    assert codes[-1] == 429
