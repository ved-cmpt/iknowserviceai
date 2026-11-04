"""Role-aware request schemas.

Requester schemas are explicit allowlists. A new staff field cannot reach a requester by accident.
"""

import uuid
from datetime import datetime
from typing import Any

from app.db.models.enums import Category, Priority, RequestStatus, Role
from app.schemas.common import ORMModel


class RequestListItem(ORMModel):
    id: uuid.UUID
    title: str
    status: RequestStatus
    category: Category
    priority: Priority
    created_at: datetime
    updated_at: datetime


class StaffRequestListItem(RequestListItem):
    requester_id: uuid.UUID
    assigned_agent_id: uuid.UUID | None


class PublicComment(ORMModel):
    id: uuid.UUID
    author_name: str
    body: str
    created_at: datetime


class StaffComment(PublicComment):
    author_id: uuid.UUID
    is_internal: bool


class RequesterEvent(ORMModel):
    event_type: str
    details: dict[str, Any]
    created_at: datetime


class StaffEvent(RequesterEvent):
    id: uuid.UUID
    actor_id: uuid.UUID | None


class PersonSummary(ORMModel):
    id: uuid.UUID
    email: str
    display_name: str
    role: Role


class RequesterRequestDetail(ORMModel):
    id: uuid.UUID
    title: str
    description: str
    status: RequestStatus
    category: Category
    priority: Priority
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    comments: list[PublicComment]
    events: list[RequesterEvent]


class StaffRequestDetail(ORMModel):
    id: uuid.UUID
    title: str
    description: str
    status: RequestStatus
    category: Category
    priority: Priority
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    requester: PersonSummary
    assigned_agent: PersonSummary | None
    comments: list[StaffComment]
    events: list[StaffEvent]
