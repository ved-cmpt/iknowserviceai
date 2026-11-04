import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.models.base import (
    Base,
    created_at_column,
    enum_check,
    updated_at_column,
    uuid_pk,
)
from app.db.models.enums import Category, Priority, RequestStatus
from app.db.models.user import User


class ServiceRequest(Base):
    __tablename__ = "service_requests"
    __table_args__ = (
        enum_check("category", Category),
        enum_check("priority", Priority),
        enum_check("status", RequestStatus),
        Index(
            "ix_service_requests_requester_created",
            "requester_id",
            text("created_at DESC"),
        ),
        Index("ix_service_requests_status_updated", "status", text("updated_at DESC")),
        Index("ix_service_requests_assignee_status", "assigned_agent_id", "status"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    requester_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    assigned_agent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(
        String(32), nullable=False, default=Category.OTHER, server_default=Category.OTHER
    )
    priority: Mapped[str] = mapped_column(
        String(16), nullable=False, default=Priority.MEDIUM, server_default=Priority.MEDIUM
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=RequestStatus.NEW, server_default=RequestStatus.NEW
    )
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default=text("1")
    )

    requester: Mapped[User] = relationship(foreign_keys=[requester_id])
    assigned_agent: Mapped[User | None] = relationship(foreign_keys=[assigned_agent_id])


class RequestComment(Base):
    __tablename__ = "request_comments"
    __table_args__ = (Index("ix_request_comments_request_created", "request_id", "created_at"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    created_at: Mapped[datetime] = created_at_column()

    author: Mapped[User] = relationship()


class RequestEvent(Base):
    __tablename__ = "request_events"
    __table_args__ = (Index("ix_request_events_request_created", "request_id", "created_at"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = created_at_column()
