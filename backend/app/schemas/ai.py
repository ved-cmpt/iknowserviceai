"""AI response schemas. Requester and staff shapes are separate allowlists (ADR-014, ADR-028)."""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import StrictBool, StringConstraints, model_validator

from app.db.models.enums import AiMode, AiRunStatus, ArticleStatus, Category, Priority, ReviewState
from app.schemas.common import NoNul, ORMModel, StrictInput

AI_SUGGESTION_LABEL = "AI-generated suggestion; verify before acting"

SuggestionState = Literal["AVAILABLE", "AWAITING_STAFF_REVIEW"]

PublishedReply = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1200), NoNul
]
ReviewReason = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=3, max_length=300), NoNul
]
FeedbackComment = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500), NoNul]


class ReviewCreate(StrictInput):
    decision: Literal["APPROVED", "REJECTED"]
    published_reply: PublishedReply | None = None
    review_reason: ReviewReason
    expected_suggestion_id: uuid.UUID
    next_status: Literal["TRIAGED", "IN_PROGRESS"] = "TRIAGED"

    @model_validator(mode="after")
    def validate_reply(self) -> "ReviewCreate":
        if self.decision == "APPROVED" and self.published_reply is None:
            raise ValueError("published_reply is required to approve")
        if self.decision == "REJECTED" and self.published_reply is not None:
            raise ValueError("published_reply is only allowed when approving")
        return self


class FeedbackCreate(StrictInput):
    helpful: StrictBool
    comment: FeedbackComment | None = None


class FeedbackCreated(ORMModel):
    id: uuid.UUID
    suggestion_id: uuid.UUID
    helpful: bool
    comment: str | None
    created_at: datetime


class CitationLink(ORMModel):
    id: uuid.UUID
    title: str


class RequesterSuggestion(ORMModel):
    """Only reply text that policy or staff have cleared. Never flags, scores or run details."""

    id: uuid.UUID
    reply: str
    citations: list[CitationLink]
    label: str
    feedback_submitted: bool


class StaffCitation(CitationLink):
    status: ArticleStatus


class StaffFeedback(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID
    helpful: bool
    comment: str | None
    created_at: datetime


class StaffSuggestion(ORMModel):
    id: uuid.UUID
    ai_run_id: uuid.UUID
    summary: str
    proposed_category: Category
    proposed_priority: Priority
    proposed_reply: str
    published_reply: str | None
    confidence: float
    risk_flags: list[str]
    rationale_short: str | None
    citations: list[StaffCitation]
    review_state: ReviewState
    reviewed_by: uuid.UUID | None
    reviewed_at: datetime | None
    review_reason: str | None
    feedback: list[StaffFeedback]


class StaffAiRun(ORMModel):
    """Sanitized run history. `redacted_input` is deliberately absent."""

    id: uuid.UUID
    mode: AiMode
    model_id: str | None
    status: AiRunStatus
    started_at: datetime
    ended_at: datetime | None
    duration_ms: int | None
    token_counts: dict[str, Any] | None
    error_code: str | None
    prompt_version: str
