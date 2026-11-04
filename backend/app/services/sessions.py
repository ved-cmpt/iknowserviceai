"""Rotating refresh tokens, held by the browser in an HttpOnly cookie (ADR-045).

A sign-in starts a family with an absolute expiry. Each refresh replaces the token and keeps that
expiry, so a session cannot be extended forever. Presenting a token that was already replaced means
that two parties hold it, so the whole family is revoked.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import RefreshToken, User
from app.services.audit import record_audit


class InvalidRefreshToken(Exception):
    """The token cannot be used. The caller signs the person out, and learns nothing more."""


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _add_token(db: Session, user_id: uuid.UUID, family_id: uuid.UUID, expires_at: datetime) -> str:
    token = secrets.token_urlsafe(32)
    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=_hash(token),
            family_id=family_id,
            expires_at=expires_at,
        )
    )
    return token


def seconds_until(expires_at: datetime) -> int:
    return max(0, int((expires_at - datetime.now(UTC)).total_seconds()))


def start_session(db: Session, user: User) -> tuple[str, datetime]:
    """Start a new family, and clear this person's expired rows. Commits."""
    now = datetime.now(UTC)
    db.execute(
        delete(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.expires_at <= now)
    )
    expires_at = now + timedelta(hours=get_settings().refresh_token_hours)
    token = _add_token(db, user.id, uuid.uuid4(), expires_at)
    db.commit()
    return token, expires_at


def _revoke_family(db: Session, family_id: uuid.UUID, now: datetime) -> int:
    result = db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    return result.rowcount


def rotate(db: Session, token: str) -> tuple[User, str, datetime]:
    """Replace a valid token. Commits. Raises InvalidRefreshToken for anything else."""
    row = db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == _hash(token))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if row is None:
        raise InvalidRefreshToken

    now = datetime.now(UTC)
    if row.revoked_at is not None:
        # Only the first sighting is worth an audit row: later ones find nothing left to revoke.
        if _revoke_family(db, row.family_id, now):
            record_audit(
                db,
                actor_id=None,
                entity_type="auth",
                entity_id=row.user_id,
                action="auth.refresh_reuse_detected",
            )
        db.commit()
        raise InvalidRefreshToken
    if row.expires_at <= now or not row.user.active:
        _revoke_family(db, row.family_id, now)
        db.commit()
        raise InvalidRefreshToken

    row.revoked_at = now
    new_token = _add_token(db, row.user_id, row.family_id, row.expires_at)
    user, expires_at = row.user, row.expires_at
    db.commit()
    return user, new_token, expires_at


def end_session(db: Session, token: str | None) -> None:
    """Revoke the family of this token, if there is one. Commits."""
    if not token:
        return
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == _hash(token)))
    if row is None:
        return
    if _revoke_family(db, row.family_id, datetime.now(UTC)):
        record_audit(
            db,
            actor_id=row.user_id,
            entity_type="auth",
            entity_id=row.user_id,
            action="auth.logout",
        )
    db.commit()
