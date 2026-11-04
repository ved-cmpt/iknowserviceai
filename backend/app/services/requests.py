"""Request workflow. Ownership, role and lifecycle rules are enforced here, on the server.

Transaction ownership: functions that write commit exactly once, after all events and audit rows
are added, so a request change and its history succeed or fail together.
"""

import uuid
from typing import Literal

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, joinedload

from app.core.deps import STAFF_ROLES, is_staff
from app.core.errors import conflict, forbidden, not_found, unprocessable
from app.db.models import RequestComment, RequestEvent, ServiceRequest, User
from app.db.models.enums import Category, EventType, Priority, RequestStatus, ReviewState
from app.schemas.requests import (
    CommentCreate,
    PersonSummary,
    PublicComment,
    RequestCreate,
    RequesterEvent,
    RequesterRequestDetail,
    RequestListItem,
    RequestUpdate,
    StaffComment,
    StaffEvent,
    StaffRequestDetail,
    StaffRequestListItem,
)
from app.services import suggestions
from app.services.audit import record_audit
from app.services.state_machine import ensure_staff_transition

SortField = Literal["created_at", "updated_at", "priority"]
SortDirection = Literal["asc", "desc"]

ENTITY_TYPE = "service_request"

# The only event details a requester can see, per event type. Anything else stays staff-only,
# including reasons and staff identifiers (ADR-014).
REQUESTER_EVENT_DETAILS: dict[str, tuple[str, ...]] = {
    EventType.REQUEST_CREATED: (),
    EventType.ASSIGNED: (),
    EventType.UNASSIGNED: (),
    EventType.PRIORITY_CHANGED: ("from", "to"),
    EventType.CATEGORY_CHANGED: ("from", "to"),
    EventType.STATUS_CHANGED: ("from", "to"),
    EventType.COMMENT_ADDED: (),
}

_PRIORITY_ORDER = case(
    {priority.value: rank for rank, priority in enumerate(Priority)},
    value=ServiceRequest.priority,
)
_SORT_COLUMNS = {
    "created_at": ServiceRequest.created_at,
    "updated_at": ServiceRequest.updated_at,
    "priority": _PRIORITY_ORDER,
}


def _visible_requests(user: User):
    query = select(ServiceRequest)
    return query if is_staff(user) else query.where(ServiceRequest.requester_id == user.id)


def _assigned_to_filter(user: User, assigned_to: str):
    if assigned_to == "me":
        return ServiceRequest.assigned_agent_id == user.id
    if assigned_to == "unassigned":
        return ServiceRequest.assigned_agent_id.is_(None)
    try:
        return ServiceRequest.assigned_agent_id == uuid.UUID(assigned_to)
    except ValueError:
        raise unprocessable(
            "VALIDATION_ERROR", "assigned_to must be me, unassigned or a user ID"
        ) from None


def list_requests(
    db: Session,
    user: User,
    *,
    limit: int,
    offset: int,
    status: RequestStatus | None = None,
    category: Category | None = None,
    priority: Priority | None = None,
    assigned_to: str | None = None,
    mine: bool = False,
    sort: SortField = "created_at",
    direction: SortDirection = "desc",
) -> tuple[list[RequestListItem], int]:
    query = _visible_requests(user)
    if mine:
        query = query.where(ServiceRequest.requester_id == user.id)
    if status:
        query = query.where(ServiceRequest.status == status.value)
    if category:
        query = query.where(ServiceRequest.category == category.value)
    if priority:
        query = query.where(ServiceRequest.priority == priority.value)
    if assigned_to is not None:
        if not is_staff(user):
            raise forbidden("Only staff can filter by assignee")
        query = query.where(_assigned_to_filter(user, assigned_to))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    column = _SORT_COLUMNS[sort]
    ordering = column.asc() if direction == "asc" else column.desc()
    rows = db.scalars(
        query.options(joinedload(ServiceRequest.assigned_agent))
        .order_by(ordering, ServiceRequest.id)
        .limit(limit)
        .offset(offset)
    ).all()
    schema = StaffRequestListItem if is_staff(user) else RequestListItem
    return [schema.model_validate(row) for row in rows], total


def count_by_status(db: Session, user: User, *, mine: bool = False) -> dict[str, int]:
    """Count the requests this user may see, with an explicit zero for every status."""
    visible = _visible_requests(user)
    if mine:
        visible = visible.where(ServiceRequest.requester_id == user.id)
    rows = visible.subquery()
    found = db.execute(select(rows.c.status, func.count()).group_by(rows.c.status)).all()
    return {status.value: 0 for status in RequestStatus} | {row[0]: row[1] for row in found}


def get_visible_request(
    db: Session, user: User, request_id: uuid.UUID, *, lock: bool = False
) -> ServiceRequest:
    """Load a request the user may see. A non-owner gets 404, so IDs cannot be enumerated."""
    query = _visible_requests(user).where(ServiceRequest.id == request_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    request = db.scalar(query)
    if request is None:
        raise not_found("Request not found")
    return request


def record_change(
    db: Session,
    request: ServiceRequest,
    actor: User,
    *,
    event_type: EventType,
    action: str,
    details: dict,
) -> None:
    db.add(
        RequestEvent(
            request_id=request.id,
            actor_id=actor.id,
            event_type=event_type.value,
            details=details,
        )
    )
    record_audit(
        db,
        actor_id=actor.id,
        entity_type=ENTITY_TYPE,
        entity_id=request.id,
        action=action,
        metadata=details,
    )


def create_request(db: Session, user: User, payload: RequestCreate) -> ServiceRequest:
    request = ServiceRequest(
        requester_id=user.id,
        title=payload.title,
        description=payload.description,
        category=Category.OTHER.value,
        priority=Priority.MEDIUM.value,
        status=RequestStatus.NEW.value,
    )
    db.add(request)
    db.flush()
    record_change(
        db,
        request,
        user,
        event_type=EventType.REQUEST_CREATED,
        action="request.created",
        details={},
    )
    db.commit()
    return request


def add_comment(
    db: Session, user: User, request_id: uuid.UUID, payload: CommentCreate
) -> RequestComment:
    # Checked first, so a requester learns nothing about whether the request exists.
    if payload.is_internal and not is_staff(user):
        raise forbidden("Only staff can add internal comments")

    request = get_visible_request(db, user, request_id, lock=True)
    if request.status == RequestStatus.CLOSED:
        raise conflict("REQUEST_CLOSED", "This request is closed and cannot take new comments")

    comment = RequestComment(
        request_id=request.id,
        author_id=user.id,
        body=payload.body,
        is_internal=payload.is_internal,
    )
    db.add(comment)
    db.flush()
    request.version += 1  # A comment is a change staff should see before acting (ADR-013).
    # The audit and event rows hold the ID and visibility only, never the body.
    record_change(
        db,
        request,
        user,
        event_type=EventType.COMMENT_ADDED,
        action="request.comment_added",
        details={"comment_id": str(comment.id), "is_internal": payload.is_internal},
    )
    db.commit()
    return comment


def _resolve_assignee(db: Session, assignee_id: uuid.UUID | None) -> User | None:
    if assignee_id is None:
        return None
    assignee = db.get(User, assignee_id)
    if assignee is None or not assignee.active or assignee.role not in STAFF_ROLES:
        raise unprocessable("INVALID_ASSIGNEE", "The assignee must be an active AGENT or ADMIN")
    return assignee


def update_request(
    db: Session, actor: User, request_id: uuid.UUID, payload: RequestUpdate
) -> ServiceRequest:
    """Apply a staff update atomically. A request with no real change is returned unchanged."""
    request = get_visible_request(db, actor, request_id, lock=True)

    if request.version != payload.expected_version:
        raise conflict("STALE_UPDATE", "This request has changed. Reload it and try again")
    if request.status == RequestStatus.CLOSED:
        raise conflict("REQUEST_CLOSED", "This request is closed and cannot be changed")

    # Validate everything before changing anything, so a rejected update changes nothing.
    target_status = payload.status
    if target_status is not None:
        ensure_staff_transition(RequestStatus(request.status), target_status)
    assign = "assigned_agent_id" in payload.model_fields_set
    assignee = _resolve_assignee(db, payload.assigned_agent_id) if assign else None

    changed = False

    if assign and request.assigned_agent_id != payload.assigned_agent_id:
        previous = request.assigned_agent_id
        request.assigned_agent_id = assignee.id if assignee else None
        record_change(
            db,
            request,
            actor,
            event_type=EventType.ASSIGNED if assignee else EventType.UNASSIGNED,
            action="request.assigned" if assignee else "request.unassigned",
            details={
                "from": str(previous) if previous else None,
                "to": str(assignee.id) if assignee else None,
            },
        )
        changed = True

    for field, event_type, action in (
        ("priority", EventType.PRIORITY_CHANGED, "request.priority_changed"),
        ("category", EventType.CATEGORY_CHANGED, "request.category_changed"),
    ):
        value = getattr(payload, field)
        if value is not None and getattr(request, field) != value.value:
            previous = getattr(request, field)
            setattr(request, field, value.value)
            record_change(
                db,
                request,
                actor,
                event_type=event_type,
                action=action,
                details={"from": previous, "to": value.value, "reason": payload.reason},
            )
            changed = True

    if target_status is not None:
        previous = request.status
        request.status = target_status.value
        if target_status == RequestStatus.RESOLVED:
            request.resolved_at = func.clock_timestamp()
        elif target_status != RequestStatus.CLOSED:
            request.resolved_at = None  # Escalating a resolved request reopens it.
        details = {"from": previous, "to": target_status.value}
        if payload.reason:
            details["reason"] = payload.reason
        record_change(
            db,
            request,
            actor,
            event_type=EventType.STATUS_CHANGED,
            action="request.status_changed",
            details=details,
        )
        if target_status == RequestStatus.NEEDS_HUMAN_REVIEW:
            _withhold_visible_suggestion(db, request, actor)
        changed = True

    if changed:
        request.version += 1
    db.commit()
    return request


def _withhold_visible_suggestion(db: Session, request: ServiceRequest, actor: User) -> None:
    """Staff escalating a request may distrust its AI reply, so hide it until it is reviewed."""
    suggestion = suggestions.latest_suggestion(db, request.id)
    if suggestion is None or suggestion.review_state != ReviewState.NOT_REQUIRED:
        return
    suggestion.review_state = ReviewState.PENDING_REVIEW.value
    record_change(
        db,
        request,
        actor,
        event_type=EventType.SUGGESTION_WITHHELD,
        action="request.suggestion_withheld",
        details={"suggestion_id": str(suggestion.id)},
    )


def _requester_events(events: list[RequestEvent]) -> list[RequesterEvent]:
    visible = []
    for event in events:
        allowed = REQUESTER_EVENT_DETAILS.get(event.event_type)
        if allowed is None:
            continue  # Unknown types are hidden by default.
        if event.event_type == EventType.COMMENT_ADDED and event.details.get("is_internal"):
            continue
        visible.append(
            RequesterEvent(
                event_type=event.event_type,
                details={key: event.details[key] for key in allowed if key in event.details},
                created_at=event.created_at,
            )
        )
    return visible


def build_detail(
    db: Session, user: User, request: ServiceRequest
) -> RequesterRequestDetail | StaffRequestDetail:
    comment_query = (
        select(RequestComment)
        .where(RequestComment.request_id == request.id)
        .order_by(RequestComment.created_at, RequestComment.id)
    )
    if not is_staff(user):
        comment_query = comment_query.where(RequestComment.is_internal.is_(False))
    comments = db.scalars(comment_query).all()
    events = db.scalars(
        select(RequestEvent)
        .where(RequestEvent.request_id == request.id)
        .order_by(RequestEvent.created_at, RequestEvent.id)
    ).all()

    fields = {
        name: getattr(request, name)
        for name in (
            "id",
            "title",
            "description",
            "status",
            "category",
            "priority",
            "created_at",
            "updated_at",
            "resolved_at",
        )
    }

    if not is_staff(user):
        suggestion_state, suggestion = suggestions.requester_view(db, request)
        return RequesterRequestDetail(
            **fields,
            suggestion_state=suggestion_state,
            suggestion=suggestion,
            attempts_remaining=suggestions.attempts_remaining(db, request.id),
            last_analysis_failed=suggestions.last_analysis_failed(db, request.id),
            comments=[
                PublicComment(
                    id=comment.id,
                    author_name=comment.author.display_name,
                    body=comment.body,
                    created_at=comment.created_at,
                )
                for comment in comments
            ],
            events=_requester_events(list(events)),
        )

    return StaffRequestDetail(
        **fields,
        version=request.version,
        suggestion=suggestions.staff_suggestion(db, request),
        ai_runs=suggestions.staff_runs(db, request.id),
        attempts_remaining=suggestions.attempts_remaining(db, request.id),
        requester=PersonSummary.model_validate(request.requester),
        assigned_agent=(
            PersonSummary.model_validate(request.assigned_agent) if request.assigned_agent else None
        ),
        comments=[
            StaffComment(
                id=comment.id,
                author_id=comment.author_id,
                author_name=comment.author.display_name,
                body=comment.body,
                is_internal=comment.is_internal,
                created_at=comment.created_at,
            )
            for comment in comments
        ],
        events=[StaffEvent.model_validate(event) for event in events],
    )


def serialize_comment(user: User, comment: RequestComment) -> PublicComment | StaffComment:
    if is_staff(user):
        return StaffComment(
            id=comment.id,
            author_id=comment.author_id,
            author_name=comment.author.display_name,
            body=comment.body,
            is_internal=comment.is_internal,
            created_at=comment.created_at,
        )
    return PublicComment(
        id=comment.id,
        author_name=comment.author.display_name,
        body=comment.body,
        created_at=comment.created_at,
    )
