"""Role-aware suggestion views. This is the only code that decides what a requester may see."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import AiRun, AiSuggestion, KnowledgeArticle, RequestFeedback, ServiceRequest
from app.db.models.enums import AiRunStatus, ArticleStatus, ReviewState
from app.schemas.ai import (
    AI_SUGGESTION_LABEL,
    STAFF_REVIEWED_LABEL,
    CitationLink,
    RequesterSuggestion,
    StaffAiRun,
    StaffCitation,
    StaffFeedback,
    StaffSuggestion,
    SuggestionState,
)


def latest_suggestion(db: Session, request_id: uuid.UUID) -> AiSuggestion | None:
    return db.scalar(
        select(AiSuggestion)
        .join(AiRun, AiRun.id == AiSuggestion.ai_run_id)
        .where(AiSuggestion.request_id == request_id)
        .order_by(AiRun.started_at.desc(), AiSuggestion.id)
        .limit(1)
    )


def visible_reply(suggestion: AiSuggestion) -> str | None:
    """Return the only text a requester may read, or None while it is withheld."""
    if suggestion.review_state == ReviewState.NOT_REQUIRED:
        return suggestion.proposed_reply
    if suggestion.review_state == ReviewState.APPROVED:
        return suggestion.published_reply
    return None


def _citation_articles(db: Session, suggestion: AiSuggestion) -> list[KnowledgeArticle]:
    """Load cited articles in the order they were cited."""
    ids = [uuid.UUID(value) for value in suggestion.citation_article_ids]
    if not ids:
        return []
    articles = {
        article.id: article
        for article in db.scalars(select(KnowledgeArticle).where(KnowledgeArticle.id.in_(ids)))
    }
    return [articles[article_id] for article_id in ids if article_id in articles]


def requester_view(
    db: Session, request: ServiceRequest
) -> tuple[SuggestionState | None, RequesterSuggestion | None]:
    suggestion = latest_suggestion(db, request.id)
    if suggestion is None or suggestion.review_state == ReviewState.REJECTED:
        return None, None
    if suggestion.review_state == ReviewState.PENDING_REVIEW:
        return "AWAITING_STAFF_REVIEW", None

    feedback_id = db.scalar(
        select(RequestFeedback.id).where(
            RequestFeedback.suggestion_id == suggestion.id,
            RequestFeedback.user_id == request.requester_id,
        )
    )
    reviewed = suggestion.review_state == ReviewState.APPROVED
    return "AVAILABLE", RequesterSuggestion(
        id=suggestion.id,
        reply=visible_reply(suggestion),
        # An article unpublished after the analysis must not appear as a link.
        citations=[
            CitationLink(id=article.id, title=article.title)
            for article in _citation_articles(db, suggestion)
            if article.status == ArticleStatus.PUBLISHED
        ],
        source="STAFF_REVIEWED" if reviewed else "AI",
        label=STAFF_REVIEWED_LABEL if reviewed else AI_SUGGESTION_LABEL,
        feedback_submitted=feedback_id is not None,
    )


def staff_suggestion(db: Session, request: ServiceRequest) -> StaffSuggestion | None:
    suggestion = latest_suggestion(db, request.id)
    if suggestion is None:
        return None
    feedback = db.scalars(
        select(RequestFeedback)
        .where(RequestFeedback.suggestion_id == suggestion.id)
        .order_by(RequestFeedback.created_at)
    ).all()
    return StaffSuggestion(
        id=suggestion.id,
        ai_run_id=suggestion.ai_run_id,
        summary=suggestion.summary,
        proposed_category=suggestion.proposed_category,
        proposed_priority=suggestion.proposed_priority,
        proposed_reply=suggestion.proposed_reply,
        published_reply=suggestion.published_reply,
        confidence=suggestion.confidence,
        risk_flags=suggestion.risk_flags,
        rationale_short=suggestion.rationale_short,
        citations=[
            StaffCitation(id=article.id, title=article.title, status=article.status)
            for article in _citation_articles(db, suggestion)
        ],
        review_state=suggestion.review_state,
        reviewed_by=suggestion.reviewed_by,
        reviewed_at=suggestion.reviewed_at,
        review_reason=suggestion.review_reason,
        feedback=[StaffFeedback.model_validate(row) for row in feedback],
    )


def count_attempts(db: Session, request_id: uuid.UUID) -> int:
    return (
        db.scalar(select(func.count()).select_from(AiRun).where(AiRun.request_id == request_id))
        or 0
    )


def attempts_remaining(db: Session, request_id: uuid.UUID) -> int:
    return max(0, get_settings().ai_max_analyze_attempts - count_attempts(db, request_id))


def last_analysis_failed(db: Session, request_id: uuid.UUID) -> bool:
    """Report whether the most recent run failed, so a reload can say so without another try."""
    status = db.scalar(
        select(AiRun.status)
        .where(AiRun.request_id == request_id)
        .order_by(AiRun.started_at.desc(), AiRun.id)
        .limit(1)
    )
    return status == AiRunStatus.FAILED


def staff_runs(db: Session, request_id: uuid.UUID) -> list[StaffAiRun]:
    runs = db.scalars(
        select(AiRun).where(AiRun.request_id == request_id).order_by(AiRun.started_at, AiRun.id)
    ).all()
    return [
        StaffAiRun(
            id=run.id,
            mode=run.mode,
            model_id=run.model_id,
            status=run.status,
            started_at=run.started_at,
            ended_at=run.ended_at,
            duration_ms=(
                round((run.ended_at - run.started_at).total_seconds() * 1000)
                if run.ended_at
                else None
            ),
            token_counts=run.token_counts,
            error_code=run.error_code,
            prompt_version=run.prompt_version,
        )
        for run in runs
    ]
