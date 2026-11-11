import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402

import models  # noqa: E402,F401 — registers all ORM models with Base
from database import Base, engine  # noqa: E402
from limiter import limiter  # noqa: E402
from routers import auth, files, notifications, rooms, users, websocket  # noqa: E402

# Create tables on startup (dev convenience — use Alembic migrations in production)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Durotto API",
    version="0.2.0",
    description="Real-time communication backend for the Durotto app.",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---------------------------------------------------------------------------
# CORS — origins come from env; never wildcard (credentials are allowed)
# ---------------------------------------------------------------------------
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip() and o.strip() != "*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(rooms.router, prefix="/rooms", tags=["rooms"])
app.include_router(files.router, prefix="/files", tags=["files"])
app.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
app.include_router(websocket.router, tags=["websocket"])


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}
