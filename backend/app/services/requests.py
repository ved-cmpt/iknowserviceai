"""Request reads, with ownership and role rules enforced on the server."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import is_staff
from app.core.errors import not_found
from app.db.models import RequestComment, RequestEvent, ServiceRequest, User
from app.db.models.enums import EventType
from app.schemas.requests import (
    PersonSummary,
    PublicComment,
    RequesterEvent,
    RequesterRequestDetail,
    RequestListItem,
    StaffComment,
    StaffEvent,
    StaffRequestDetail,
    StaffRequestListItem,
)

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


def _visible_requests(user: User):
    query = select(ServiceRequest)
    return query if is_staff(user) else query.where(ServiceRequest.requester_id == user.id)


def list_requests(
    db: Session, user: User, *, limit: int, offset: int
) -> tuple[list[RequestListItem], int]:
    query = _visible_requests(user)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.order_by(ServiceRequest.created_at.desc(), ServiceRequest.id)
        .limit(limit)
        .offset(offset)
    ).all()
    schema = StaffRequestListItem if is_staff(user) else RequestListItem
    return [schema.model_validate(row) for row in rows], total


def get_visible_request(db: Session, user: User, request_id: uuid.UUID) -> ServiceRequest:
    """Load a request the user may see. A non-owner gets 404, so IDs cannot be enumerated."""
    request = db.scalar(_visible_requests(user).where(ServiceRequest.id == request_id))
    if request is None:
        raise not_found("Request not found")
    return request


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
        return RequesterRequestDetail(
            **fields,
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
