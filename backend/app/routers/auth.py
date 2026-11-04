from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Header, Request, Response
from sqlalchemy.orm import Session

from app.core.cookies import (
    REFRESH_COOKIE_NAME,
    clear_refresh_cookie_header,
    refresh_cookie_header,
)
from app.core.deps import get_current_user
from app.core.errors import AppError
from app.core.rate_limit import client_ip, login_limiter, refresh_limiter
from app.core.security import access_token_lifetime_seconds, create_access_token
from app.db.models import User
from app.db.session import get_db
from app.schemas.auth import LoginInput, LoginResponse, UserProfile
from app.services import sessions
from app.services.auth import authenticate

router = APIRouter(prefix="/auth", tags=["auth"])

CSRF_HEADER_VALUE = "iknowserviceai"
RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)]


def require_csrf_header(x_requested_with: Annotated[str | None, Header()] = None) -> None:
    """A page on another site cannot send this header without passing a CORS check (ADR-045)."""
    if x_requested_with != CSRF_HEADER_VALUE:
        raise AppError(403, "CSRF_HEADER_REQUIRED", "This request is missing a required header")


def _session_response(user: User, response: Response, token: str, expires_at) -> LoginResponse:
    response.headers["Set-Cookie"] = refresh_cookie_header(
        token, sessions.seconds_until(expires_at)
    )
    response.headers["Cache-Control"] = "no-store"
    return LoginResponse(
        access_token=create_access_token(user.id),
        expires_in=access_token_lifetime_seconds(),
        user=UserProfile.model_validate(user),
    )


@router.post("/login")
def login(
    payload: LoginInput, request: Request, response: Response, db: Session = Depends(get_db)
) -> LoginResponse:
    # Checked before hashing, so a flood of attempts cannot use up CPU on Argon2.
    login_limiter.check(f"{client_ip(request)}|{payload.email.strip().lower()}")
    user = authenticate(db, payload.email, payload.password)
    token, expires_at = sessions.start_session(db, user)
    return _session_response(user, response, token, expires_at)


@router.post("/refresh", dependencies=[Depends(require_csrf_header)])
def refresh(
    request: Request,
    response: Response,
    token: RefreshCookie = None,
    db: Session = Depends(get_db),
) -> LoginResponse:
    refresh_limiter.check(client_ip(request))
    try:
        if not token:
            raise sessions.InvalidRefreshToken
        user, new_token, expires_at = sessions.rotate(db, token)
    except sessions.InvalidRefreshToken:
        raise AppError(
            401,
            "UNAUTHORIZED",
            "Authentication required",
            headers={"Set-Cookie": clear_refresh_cookie_header(), "Cache-Control": "no-store"},
        ) from None
    return _session_response(user, response, new_token, expires_at)


@router.post("/logout", status_code=204, dependencies=[Depends(require_csrf_header)])
def logout(response: Response, token: RefreshCookie = None, db: Session = Depends(get_db)) -> None:
    sessions.end_session(db, token)
    response.headers["Set-Cookie"] = clear_refresh_cookie_header()


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> UserProfile:
    return UserProfile.model_validate(user)
