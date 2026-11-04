from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, SmallInteger, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models.base import Base


class DemoState(Base):
    """One row: whether this database allows the automatic demo reset, and when it last ran.

    Only the owner role can enable it, so the app role can never turn it on for itself (ADR-051).
    """

    __tablename__ = "demo_state"
    __table_args__ = (CheckConstraint("id = 1", name="single_row"),)

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    reset_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    last_reset_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
