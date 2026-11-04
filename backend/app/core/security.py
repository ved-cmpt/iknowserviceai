"""Password hashing (Argon2id) and access tokens (JWT HS256)."""

import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import get_settings

JWT_ALGORITHM = "HS256"
TOKEN_TYPE = "access"  # noqa: S105 - a claim value, not a credential

_hasher = PasswordHasher()
# A real hash to verify against when the email is unknown, reducing the timing difference.
_dummy_hash = _hasher.hash(uuid.uuid4().hex)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def verify_dummy_password(password: str) -> None:
    verify_password(_dummy_hash, password)


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def access_token_lifetime_seconds() -> int:
    return get_settings().access_token_minutes * 60


def create_access_token(user_id: uuid.UUID, expires_in: timedelta | None = None) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    lifetime = expires_in or timedelta(minutes=settings.access_token_minutes)
    payload = {"sub": str(user_id), "iat": now, "exp": now + lifetime, "type": TOKEN_TYPE}
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> uuid.UUID | None:
    """Return the user ID from a valid access token, or None."""
    try:
        payload = jwt.decode(
            token,
            get_settings().jwt_secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "iat", "exp", "type"]},
        )
        if payload["type"] != TOKEN_TYPE:
            return None
        return uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, ValueError, TypeError):
        return None
