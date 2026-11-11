from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth import (
    burn_password_check,
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from database import get_db
from limiter import RATE_LIMIT_LOGIN, limiter
from models import LoginAttempt, User
from schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    Message,
    RegisterRequest,
    TokenResponse,
)
from services import notify, user_out

router = APIRouter()


def _client(request: Request) -> tuple[str, str]:
    ip = request.client.host if request.client else "unknown"
    return ip, (request.headers.get("user-agent") or "unknown")[:300]


@router.post("/login", response_model=TokenResponse)
@limiter.limit(RATE_LIMIT_LOGIN)
def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    email = body.email.lower()
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if user is None:
        burn_password_check(body.password)
        ok = False
    else:
        ok = verify_password(body.password, user.hashed_password)

    ip, agent = _client(request)
    db.add(
        LoginAttempt(
            user_id=user.id if user else None,
            email=email,
            ip_address=ip,
            user_agent=agent,
            success=ok,
        )
    )
    db.commit()

    if user is None or not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    return TokenResponse(access_token=create_access_token(user.id), user=user_out(user))


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(RATE_LIMIT_LOGIN)
def register(request: Request, body: RegisterRequest, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists.",
        )
    user = User(name=body.name, email=email, hashed_password=hash_password(body.password))
    db.add(user)
    db.flush()
    ip, agent = _client(request)
    db.add(LoginAttempt(user_id=user.id, email=email, ip_address=ip, user_agent=agent, success=True))
    notify(
        db,
        user.id,
        "system",
        "Welcome to Durotto!",
        "Your account is set up and ready to go. Start by creating a room.",
        {"targetUrl": "/meetings"},
    )
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(user.id), user=user_out(user))


@router.post("/forgot-password", response_model=Message)
@limiter.limit("3/minute")
def forgot_password(request: Request, body: ForgotPasswordRequest):
    # Intentionally identical for known and unknown emails.
    return Message(message="If that email is registered, a reset link will be sent.")


@router.post("/change-password", response_model=Message)
@limiter.limit(RATE_LIMIT_LOGIN)
def change_password(
    request: Request,
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.currentPassword, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )
    current_user.hashed_password = hash_password(body.newPassword)
    db.commit()
    return Message(message="Password updated successfully.")
