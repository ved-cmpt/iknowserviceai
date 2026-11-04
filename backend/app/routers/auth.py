from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.rate_limit import login_limiter
from app.core.security import access_token_lifetime_seconds, create_access_token
from app.db.models import User
from app.db.session import get_db
from app.schemas.auth import LoginInput, LoginResponse, UserProfile
from app.services.auth import authenticate

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(payload: LoginInput, request: Request, db: Session = Depends(get_db)) -> LoginResponse:
    # Checked before hashing, so a flood of attempts cannot use up CPU on Argon2.
    client_ip = request.client.host if request.client else "unknown"
    login_limiter.check(f"{client_ip}|{payload.email.strip().lower()}")
    user = authenticate(db, payload.email, payload.password)
    return LoginResponse(
        access_token=create_access_token(user.id),
        expires_in=access_token_lifetime_seconds(),
        user=UserProfile.model_validate(user),
    )


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> UserProfile:
    return UserProfile.model_validate(user)
