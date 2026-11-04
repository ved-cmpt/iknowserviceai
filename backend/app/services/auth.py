from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import (
    hash_password,
    password_needs_rehash,
    verify_dummy_password,
    verify_password,
)
from app.db.models import User
from app.services.audit import record_audit


def _invalid_credentials() -> AppError:
    # One message for unknown email, wrong password and inactive user.
    return AppError(
        401,
        "INVALID_CREDENTIALS",
        "Incorrect email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )


def authenticate(db: Session, email: str, password: str) -> User:
    """Verify credentials and audit the outcome. Commits."""
    user = db.scalar(select(User).where(func.lower(User.email) == email.strip().lower()))

    if user is None:
        verify_dummy_password(password)
        password_ok = False
    else:
        password_ok = verify_password(user.password_hash, password)

    if user is None or not password_ok or not user.active:
        # The attempted email is not stored: people sometimes type a password into that field.
        record_audit(
            db,
            actor_id=None,
            entity_type="auth",
            entity_id=user.id if user else None,
            action="auth.login_failure",
        )
        db.commit()
        raise _invalid_credentials()

    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    record_audit(
        db,
        actor_id=user.id,
        entity_type="auth",
        entity_id=user.id,
        action="auth.login_success",
    )
    db.commit()
    return user
