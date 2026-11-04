"""Role-aware request schemas.

Requester schemas are explicit allowlists. A new staff field cannot reach a requester by accident.
"""

import uuid
from datetime import datetime
from typing import Annotated, Any

from pydantic import Field, StringConstraints, model_validator

from app.db.models.enums import Category, Priority, RequestStatus, Role
from app.schemas.ai import RequesterSuggestion, StaffAiRun, StaffSuggestion, SuggestionState
from app.schemas.common import NoNul, ORMModel, StrictInput

Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=3, max_length=120), NoNul
]
Description = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=10, max_length=4000), NoNul
]
CommentBody = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000), NoNul
]
Reason = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=3, max_length=300), NoNul
]


class RequestCreate(StrictInput):
    title: Title
    description: Description


class RequestCreated(ORMModel):
    id: uuid.UUID
    title: str
    status: RequestStatus
    created_at: datetime


class RequestCounts(ORMModel):
    counts: dict[RequestStatus, int]
    total: int


class CommentCreate(StrictInput):
    body: CommentBody
    is_internal: bool = False


class RequestUpdate(StrictInput):
    """Staff update. Omitting a field leaves it unchanged; `assigned_agent_id: null` unassigns."""

    expected_version: Annotated[int, Field(ge=1)]
    assigned_agent_id: uuid.UUID | None = None
    priority: Priority | None = None
    category: Category | None = None
    status: RequestStatus | None = None
    reason: Reason | None = None

    @model_validator(mode="after")
    def validate_change(self) -> "RequestUpdate":
        for field in ("priority", "category", "status"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        if self.model_fields_set <= {"expected_version", "reason"}:
            raise ValueError("Provide at least one field to change")
        if (self.priority or self.category) and not self.reason:
            raise ValueError("A reason is required to change priority or category")
        return self


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
    assigned_agent_name: str | None
    version: int


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
    suggestion_state: SuggestionState | None
    suggestion: RequesterSuggestion | None
    # The same facts a failed analyze response already gives the requester (ADR-028).
    attempts_remaining: int
    last_analysis_failed: bool


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
    version: int
    requester: PersonSummary
    assigned_agent: PersonSummary | None
    comments: list[StaffComment]
    events: list[StaffEvent]
    suggestion: StaffSuggestion | None
    ai_runs: list[StaffAiRun]
    attempts_remaining: int
