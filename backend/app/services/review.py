"""Staff review of held suggestions, and requester feedback on visible ones."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import conflict, forbidden, unprocessable
from app.db.models import AiSuggestion, RequestFeedback, ServiceRequest, User
from app.db.models.enums import EventType, RequestStatus, ReviewState
from app.schemas.ai import FeedbackCreate, ReviewCreate
from app.services.policy import asks_for_credentials
from app.services.requests import get_visible_request, record_change
from app.services.state_machine import ensure_staff_transition
from app.services.suggestions import latest_suggestion, visible_reply


def _checked_review(
    db: Session, reviewer: User, request_id: uuid.UUID, payload: ReviewCreate
) -> tuple[ServiceRequest, AiSuggestion, RequestStatus]:
    """Run every check on a review. A dry run and a real decision share this, so they agree."""
    request = get_visible_request(db, reviewer, request_id, lock=True)
    if request.requester_id == reviewer.id:
        raise forbidden("You cannot review a request you submitted")

    suggestion = latest_suggestion(db, request.id)
    if suggestion is None:
        raise conflict("NO_PENDING_SUGGESTION", "This request has no suggestion to review")
    if suggestion.id != payload.expected_suggestion_id:
        raise conflict("STALE_REVIEW", "A newer suggestion exists. Reload and review that one")
    if suggestion.review_state != ReviewState.PENDING_REVIEW:
        raise conflict("ALREADY_REVIEWED", "This suggestion is not waiting for review")
    if request.status != RequestStatus.NEEDS_HUMAN_REVIEW:
        raise conflict("INVALID_STATE", "This request is not waiting for review")
    target = RequestStatus(payload.next_status)
    ensure_staff_transition(RequestStatus(request.status), target)
    if payload.published_reply is not None and asks_for_credentials(payload.published_reply):
        raise unprocessable(
            "UNSAFE_REPLY", "A published reply must not ask for passwords, codes or tokens"
        )
    return request, suggestion, target


def validate_review(
    db: Session, reviewer: User, request_id: uuid.UUID, payload: ReviewCreate
) -> None:
    """Raise what a real review would raise. Writes nothing, and releases the row lock."""
    try:
        _checked_review(db, reviewer, request_id, payload)
    finally:
        db.rollback()


def review_suggestion(
    db: Session, reviewer: User, request_id: uuid.UUID, payload: ReviewCreate
) -> ServiceRequest:
    """Approve or reject the latest held suggestion. Nothing is changed until every check passes."""
    request, suggestion, target = _checked_review(db, reviewer, request_id, payload)

    approved = payload.decision == "APPROVED"
    suggestion.review_state = (ReviewState.APPROVED if approved else ReviewState.REJECTED).value
    suggestion.reviewed_by = reviewer.id
    suggestion.reviewed_at = datetime.now(UTC)
    suggestion.review_reason = payload.review_reason
    suggestion.published_reply = payload.published_reply if approved else None

    # History records the decision and reason. Reply bodies stay on the suggestion row only.
    details = {
        "suggestion_id": str(suggestion.id),
        "decision": payload.decision,
        "reason": payload.review_reason,
        "edited": approved and payload.published_reply != suggestion.proposed_reply,
    }
    record_change(
        db,
        request,
        reviewer,
        event_type=EventType.SUGGESTION_REVIEWED,
        action="request.review_approved" if approved else "request.review_rejected",
        details=details,
    )
    previous = request.status
    request.status = target.value
    record_change(
        db,
        request,
        reviewer,
        event_type=EventType.STATUS_CHANGED,
        action="request.status_changed",
        details={"from": previous, "to": target.value, "source": "REVIEW"},
    )
    request.version += 1
    db.commit()
    return request


def add_feedback(
    db: Session, user: User, request_id: uuid.UUID, payload: FeedbackCreate
) -> RequestFeedback:
    """Record the owner's rating of the suggestion they can see, once per suggestion."""
    # The row lock makes the duplicate check below safe against a simultaneous submission.
    request = get_visible_request(db, user, request_id, lock=True)
    if request.requester_id != user.id:
        raise forbidden("Only the person who submitted this request can give feedback")

    suggestion = latest_suggestion(db, request.id)
    if suggestion is None or visible_reply(suggestion) is None:
        raise conflict("NO_VISIBLE_SUGGESTION", "There is no visible suggestion to rate")
    existing = db.scalar(
        select(RequestFeedback.id).where(
            RequestFeedback.suggestion_id == suggestion.id, RequestFeedback.user_id == user.id
        )
    )
    if existing is not None:
        raise conflict("FEEDBACK_EXISTS", "You have already rated this suggestion")

    feedback = RequestFeedback(
        request_id=request.id,
        user_id=user.id,
        suggestion_id=suggestion.id,
        helpful=payload.helpful,
        comment=payload.comment,
    )
    db.add(feedback)
    db.flush()
    record_change(
        db,
        request,
        user,
        event_type=EventType.FEEDBACK_ADDED,
        action="request.feedback_added",
        details={"suggestion_id": str(suggestion.id), "helpful": payload.helpful},
    )
    db.commit()
    return feedback
