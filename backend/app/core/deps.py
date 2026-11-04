"""Authentication and authorization dependencies."""

from collections.abc import Callable

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import AppError, forbidden
from app.core.security import decode_access_token
from app.db.models import User
from app.db.models.enums import Role
from app.db.session import get_db

_bearer = HTTPBearer(auto_error=False)

STAFF_ROLES = (Role.AGENT, Role.ADMIN)


def _unauthorized() -> AppError:
    return AppError(
        401,
        "UNAUTHORIZED",
        "Authentication required",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Authenticate, then load the user from the database so role and active state are current."""
    if credentials is None:
        raise _unauthorized()
    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise _unauthorized()
    user = db.get(User, user_id)
    if user is None or not user.active:
        raise _unauthorized()
    return user


def require_roles(*roles: Role) -> Callable[[User], User]:
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise forbidden()
        return user

    return dependency


def is_staff(user: User) -> bool:
    return user.role in STAFF_ROLES
