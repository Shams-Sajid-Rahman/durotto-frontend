import os
import shutil
import tempfile
import uuid

import pytest

# Configure the app *before* it is imported: throwaway DB/uploads, no rate limits.
_TMP = tempfile.mkdtemp(prefix="durotto-backend-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_TMP, 'test.db')}"
os.environ["UPLOADS_DIR"] = os.path.join(_TMP, "uploads")
os.environ["SECRET_KEY"] = "test-secret"
os.environ["RATE_LIMIT_ENABLED"] = "0"

from fastapi.testclient import TestClient  # noqa: E402

import hub  # noqa: E402
from database import Base, engine  # noqa: E402
from main import app  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    hub.rooms.clear()
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def pytest_sessionfinish(session, exitstatus):
    engine.dispose()
    shutil.rmtree(_TMP, ignore_errors=True)


class Api:
    """Small helper: a registered user with an authenticated client."""

    def __init__(self, client: TestClient, name: str):
        self.client = client
        self.email = f"{name.lower()}-{uuid.uuid4().hex[:8]}@example.com"
        self.password = "password123"
        res = client.post("/auth/register", json={"name": name, "email": self.email, "password": self.password})
        assert res.status_code == 201, res.text
        body = res.json()
        self.token = body["access_token"]
        self.user = body["user"]
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def get(self, path, **kw):
        return self.client.get(path, headers=self.headers, **kw)

    def post(self, path, **kw):
        return self.client.post(path, headers=self.headers, **kw)

    def patch(self, path, **kw):
        return self.client.patch(path, headers=self.headers, **kw)

    def delete(self, path, **kw):
        return self.client.request("DELETE", path, headers=self.headers, **kw)


@pytest.fixture
def make_user(client):
    def _make(name: str = "User") -> Api:
        return Api(client, name)

    return _make
