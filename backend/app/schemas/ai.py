"""AI response schemas. Requester and staff shapes are separate allowlists (ADR-014, ADR-028)."""

import uuid
from datetime import datetime
from typing import Any, Literal

from app.db.models.enums import AiMode, AiRunStatus, ArticleStatus, Category, Priority, ReviewState
from app.schemas.common import ORMModel

AI_SUGGESTION_LABEL = "AI-generated suggestion; verify before acting"

SuggestionState = Literal["AVAILABLE", "AWAITING_STAFF_REVIEW"]


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
