import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.models.base import Base, created_at_column, uuid_pk
from app.db.models.user import User


class RefreshToken(Base):
    """One rotating refresh token. The token itself is never stored, only its SHA-256 hash."""

    __tablename__ = "refresh_tokens"
    __table_args__ = (
        Index("uq_refresh_tokens_token_hash", "token_hash", unique=True),
        Index("ix_refresh_tokens_family", "family_id"),
        Index("ix_refresh_tokens_user_expires", "user_id", "expires_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    # A session has no meaning without its user.
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    # Every rotation of one sign-in shares a family, so reuse can revoke all of them.
    family_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = created_at_column()

    user: Mapped[User] = relationship()
