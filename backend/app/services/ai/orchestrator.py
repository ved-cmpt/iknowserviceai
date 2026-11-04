"""The bounded analysis workflow (blueprint section 6.1).

Two short transactions surround the provider call, so no database lock is held during network
access. Tx1 claims the request and records a run. Tx2 validates the output, applies policy and
persists the result. A crash between them leaves a run that stale recovery can clear.
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import is_staff
from app.core.errors import AppError, conflict
from app.db.models import AiRun, AiSuggestion, KnowledgeArticle, ServiceRequest, User
from app.db.models.enums import (
    AiRunStatus,
    ArticleStatus,
    Category,
    EventType,
    Priority,
    RequestStatus,
    ReviewState,
)
from app.services import policy
from app.services.ai.base import (
    AgentArticle,
    AgentInput,
    AgentProvider,
    ProviderError,
    ProviderInvalidOutput,
    ProviderUnavailable,
    TriageResult,
)
from app.services.ai.prompts import PROMPT_VERSION
from app.services.redaction import redact, without_masks
from app.services.requests import get_visible_request, record_change
from app.services.retrieval import KnowledgeRetriever, RetrievedArticle
from app.services.state_machine import ensure_system_transition
from app.services.suggestions import count_attempts
from app.services.text import markdown_to_plain_text

logger = logging.getLogger("app.ai")

STALE_RUN_ERROR = "STALE_RUN"
NO_MATCH_REPLY = (
    "We could not find a published article that covers this request, so a member of the support "
    "team will review it. You can add more detail in a comment while you wait."
)
_REQUESTER_FAILURE_CODE = "ANALYSIS_FAILED"
_FAILURE_MESSAGE = "Automatic analysis is unavailable right now. Your request has been saved."


def _in_progress() -> AppError:
    return conflict("ANALYSIS_IN_PROGRESS", "This request is already being analyzed")


def _record_status_change(
    db: Session, request: ServiceRequest, actor: User, target: RequestStatus, source: str
) -> None:
    previous = RequestStatus(request.status)
    ensure_system_transition(previous, target)
    request.status = target.value
    record_change(
        db,
        request,
        actor,
        event_type=EventType.STATUS_CHANGED,
        action="request.status_changed",
        details={"from": previous.value, "to": target.value, "source": source},
    )


def _recover_stale_run(db: Session, request: ServiceRequest, actor: User) -> None:
    """Return an abandoned ANALYZING request to NEW, or refuse if a run is still active.

    A request with no run at all, like the seeded one, has nothing active and recovers at once.
    """
    run = db.scalar(
        select(AiRun)
        .where(AiRun.request_id == request.id, AiRun.status == AiRunStatus.STARTED.value)
        .order_by(AiRun.started_at.desc())
        .limit(1)
    )
    now = datetime.now(UTC)
    max_age = timedelta(seconds=get_settings().ai_stale_run_seconds)
    if run is not None and now - run.started_at <= max_age:
        raise _in_progress()

    details = {"error_code": STALE_RUN_ERROR, "ai_run_id": str(run.id) if run else None}
    if run is not None:
        run.status = AiRunStatus.FAILED.value
        run.error_code = STALE_RUN_ERROR
        run.ended_at = now
    record_change(
        db,
        request,
        actor,
        event_type=EventType.AI_ANALYSIS_FAILED,
        action="request.ai_analysis_failed",
        details=details,
    )
    _record_status_change(db, request, actor, RequestStatus.NEW, "STALE_RECOVERY")
    request.version += 1


@dataclass(frozen=True)
class _Claim:
    run_id: uuid.UUID
    category: str
    priority: str
    redacted_title: str
    redacted_description: str


def _claim(db: Session, user: User, request_id: uuid.UUID, provider: AgentProvider) -> _Claim:
    """Tx1: verify state and budget, move to ANALYZING and record a STARTED run."""
    request = get_visible_request(db, user, request_id, lock=True)
    if request.status == RequestStatus.ANALYZING:
        _recover_stale_run(db, request, user)
    if request.status != RequestStatus.NEW:
        raise conflict("INVALID_STATE", "Only a NEW request can be analyzed")

    if count_attempts(db, request.id) >= get_settings().ai_max_analyze_attempts:
        db.commit()  # Keeps any stale recovery above, so staff can still triage manually.
        raise AppError(
            429,
            "ANALYZE_LIMIT_REACHED",
            "The analysis limit for this request has been reached. Staff can triage it manually",
        )

    title = redact(request.title)
    description = redact(request.description)
    run = AiRun(
        request_id=request.id,
        mode=provider.mode.value,
        model_id=provider.model_id,
        status=AiRunStatus.STARTED.value,
        redacted_input=f"Title: {title}\nDescription: {description}",
        prompt_version=PROMPT_VERSION,
    )
    db.add(run)
    db.flush()
    _record_status_change(db, request, user, RequestStatus.ANALYZING, "AI_ANALYSIS")
    record_change(
        db,
        request,
        user,
        event_type=EventType.AI_ANALYSIS_STARTED,
        action="request.ai_analysis_started",
        details={"ai_run_id": str(run.id), "mode": run.mode, "prompt_version": PROMPT_VERSION},
    )
    request.version += 1
    claim = _Claim(run.id, request.category, request.priority, title, description)
    db.commit()
    return claim


def _call_provider(
    db: Session, request_id: uuid.UUID, claim: _Claim, provider: AgentProvider
) -> tuple[TriageResult, list[RetrievedArticle]]:
    """Retrieve, then call the provider, with no transaction open during the network call."""
    try:
        query = without_masks(f"{claim.redacted_title} {claim.redacted_description}")
        retrieved = KnowledgeRetriever(db).search(query)
        db.commit()  # Ends the read transaction.
        agent_input = AgentInput(
            request_id=request_id,
            title=claim.redacted_title,
            description=claim.redacted_description,
            categories=tuple(Category),
            priorities=tuple(Priority),
            articles=tuple(AgentArticle(a.id, a.title, a.snippet) for a in retrieved),
            prompt_version=PROMPT_VERSION,
        )
        return provider.analyze(agent_input), retrieved
    except ProviderError:
        raise
    except ValidationError:
        raise ProviderInvalidOutput from None
    except Exception:
        # An unexpected failure must take the same safe path. Its text could hold provider data.
        logger.error("ai_provider_unexpected_error", extra={"ai_run_id": str(claim.run_id)})
        raise ProviderUnavailable from None


def _locked_active_run(
    db: Session, request_id: uuid.UUID, run_id: uuid.UUID
) -> tuple[ServiceRequest, AiRun]:
    """Lock the request again and confirm that stale recovery did not take this run away."""
    request = db.scalar(
        select(ServiceRequest)
        .where(ServiceRequest.id == request_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    run = db.get(AiRun, run_id, populate_existing=True)
    if (
        request is None
        or run is None
        or request.status != RequestStatus.ANALYZING
        or run.status != AiRunStatus.STARTED
    ):
        db.rollback()
        raise conflict("ANALYSIS_SUPERSEDED", "This analysis was replaced by a newer one")
    return request, run


def _finish_run(run: AiRun, status: AiRunStatus, provider: AgentProvider) -> None:
    run.status = status.value
    run.ended_at = datetime.now(UTC)
    run.token_counts = getattr(provider, "token_counts", None)


def _record_failure(
    db: Session,
    user: User,
    request_id: uuid.UUID,
    run_id: uuid.UUID,
    error: ProviderError,
    provider: AgentProvider,
) -> AppError:
    """Tx2 on failure: the run fails and the request returns to NEW. No suggestion is written."""
    db.rollback()
    request, run = _locked_active_run(db, request_id, run_id)
    _finish_run(run, AiRunStatus.FAILED, provider)
    run.error_code = error.error_code
    _record_status_change(db, request, user, RequestStatus.NEW, "AI_FAILURE")
    record_change(
        db,
        request,
        user,
        event_type=EventType.AI_ANALYSIS_FAILED,
        action="request.ai_analysis_failed",
        details={"ai_run_id": str(run.id), "error_code": error.error_code},
    )
    request.version += 1
    remaining = max(0, get_settings().ai_max_analyze_attempts - count_attempts(db, request.id))
    db.commit()
    logger.warning(
        "ai_run_failed", extra={"ai_run_id": str(run.id), "error_code": error.error_code}
    )
    # Requesters get one generic code; provider failure details are for staff (ADR-028).
    return AppError(
        503,
        error.error_code if is_staff(user) else _REQUESTER_FAILURE_CODE,
        _FAILURE_MESSAGE,
        extra={"retryable": error.retryable and remaining > 0, "attempts_remaining": remaining},
    )


def _clean_model_text(value: str) -> str:
    """Model text is untrusted: no markup is ever stored or shown."""
    return markdown_to_plain_text(value)


def _validated_output(
    db: Session, result: TriageResult, retrieved: list[RetrievedArticle]
) -> tuple[TriageResult, list[KnowledgeArticle], bool]:
    """Strip markup and keep only citations that were retrieved and are still published."""
    summary = _clean_model_text(result.summary)
    reply = _clean_model_text(result.recommended_reply)
    if not summary or not reply:
        raise ProviderInvalidOutput

    retrieved_ids = {article.id for article in retrieved}
    requested = list(dict.fromkeys(result.citation_article_ids))
    candidates = [article_id for article_id in requested if article_id in retrieved_ids]
    published = {
        article.id: article
        for article in db.scalars(
            select(KnowledgeArticle).where(
                KnowledgeArticle.id.in_(candidates),
                KnowledgeArticle.status == ArticleStatus.PUBLISHED.value,
            )
        )
    }
    cited = [published[article_id] for article_id in candidates if article_id in published]
    clean = result.model_copy(
        update={
            "summary": summary,
            "recommended_reply": reply,
            "rationale_short": _clean_model_text(result.rationale_short),
            "citation_article_ids": [article.id for article in cited],
        }
    )
    return clean, cited, len(cited) != len(requested)


def _apply_triage_field(
    db: Session,
    request: ServiceRequest,
    user: User,
    *,
    field: str,
    claimed_value: str,
    new_value: str,
    run_id: uuid.UUID,
) -> None:
    """Apply an AI value, unless staff changed the field while the analysis was running."""
    current = getattr(request, field)
    if current != claimed_value or current == new_value:
        return
    setattr(request, field, new_value)
    event_type = EventType.CATEGORY_CHANGED if field == "category" else EventType.PRIORITY_CHANGED
    record_change(
        db,
        request,
        user,
        event_type=event_type,
        action=f"request.{field}_changed",
        details={
            "from": current,
            "to": new_value,
            "reason": "AI triage",
            "ai_run_id": str(run_id),
        },
    )


def _record_success(
    db: Session,
    user: User,
    request_id: uuid.UUID,
    claim: _Claim,
    result: TriageResult,
    retrieved: list[RetrievedArticle],
    provider: AgentProvider,
) -> ServiceRequest:
    """Tx2 on success: validate, apply policy and persist everything together."""
    request, run = _locked_active_run(db, request_id, claim.run_id)
    clean, cited, dropped = _validated_output(db, result, retrieved)
    if not retrieved:
        clean = clean.model_copy(update={"recommended_reply": NO_MATCH_REPLY})

    decision = policy.decide(
        redacted_text=f"{claim.redacted_title}\n{claim.redacted_description}",
        result=clean,
        valid_citation_count=len(cited),
        dropped_citations=dropped,
        retrieved_nothing=not retrieved,
        retrieved_article_texts=[f"{a.title} {a.snippet}" for a in retrieved],
        cited_article_bodies=[article.body_markdown for article in cited],
        confidence_threshold=get_settings().ai_review_confidence_threshold,
    )
    review_state = (
        ReviewState.PENDING_REVIEW if decision.review_required else ReviewState.NOT_REQUIRED
    )
    suggestion = AiSuggestion(
        ai_run_id=run.id,
        request_id=request.id,
        summary=clean.summary,
        proposed_category=clean.category.value,
        proposed_priority=decision.priority.value,
        proposed_reply=clean.recommended_reply,
        confidence=clean.confidence,
        risk_flags=[flag.value for flag in decision.risk_flags],
        citation_article_ids=[str(article.id) for article in cited],
        rationale_short=clean.rationale_short or None,
        review_state=review_state.value,
    )
    db.add(suggestion)
    db.flush()
    _finish_run(run, AiRunStatus.SUCCEEDED, provider)

    _apply_triage_field(
        db,
        request,
        user,
        field="category",
        claimed_value=claim.category,
        new_value=clean.category.value,
        run_id=run.id,
    )
    _apply_triage_field(
        db,
        request,
        user,
        field="priority",
        claimed_value=claim.priority,
        new_value=decision.priority.value,
        run_id=run.id,
    )
    target = RequestStatus.NEEDS_HUMAN_REVIEW if decision.review_required else RequestStatus.TRIAGED
    _record_status_change(db, request, user, target, "AI_ANALYSIS")
    record_change(
        db,
        request,
        user,
        event_type=EventType.AI_ANALYSIS_SUCCEEDED,
        action="request.ai_analysis_succeeded",
        details={
            "ai_run_id": str(run.id),
            "suggestion_id": str(suggestion.id),
            "review_state": review_state.value,
            "risk_flags": suggestion.risk_flags,
        },
    )
    request.version += 1
    db.commit()
    return request


def analyze_request(
    db: Session, user: User, request_id: uuid.UUID, provider: AgentProvider
) -> ServiceRequest:
    """Run one analysis. Raises 503 with a retry hint if the provider or its output fails."""
    claim = _claim(db, user, request_id, provider)
    try:
        result, retrieved = _call_provider(db, request_id, claim, provider)
        return _record_success(db, user, request_id, claim, result, retrieved, provider)
    except ProviderError as error:
        raise _record_failure(db, user, request_id, claim.run_id, error, provider) from None
