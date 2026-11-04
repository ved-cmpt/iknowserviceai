import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import STAFF_ROLES, get_current_user, require_roles
from app.core.rate_limit import analyze_limiter
from app.db.models import User
from app.db.models.enums import Category, Priority, RequestStatus
from app.db.session import get_db
from app.schemas.ai import FeedbackCreate, FeedbackCreated, ReviewCreate
from app.schemas.common import Page
from app.schemas.requests import (
    CommentCreate,
    PublicComment,
    RequestCounts,
    RequestCreate,
    RequestCreated,
    RequesterRequestDetail,
    RequestListItem,
    RequestUpdate,
    StaffComment,
    StaffRequestDetail,
    StaffRequestListItem,
)
from app.services import requests as request_service
from app.services import review as review_service
from app.services.ai import orchestrator
from app.services.ai.base import AgentProvider
from app.services.ai.factory import get_agent_provider

router = APIRouter(prefix="/requests", tags=["requests"])


@router.post("", status_code=201)
def create_request(
    payload: RequestCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RequestCreated:
    return RequestCreated.model_validate(request_service.create_request(db, user, payload))


@router.get("")
def list_requests(
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    status: RequestStatus | None = None,
    category: Category | None = None,
    priority: Priority | None = None,
    assigned_to: str | None = None,
    mine: bool = False,
    sort: request_service.SortField = "created_at",
    direction: request_service.SortDirection = "desc",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Page[StaffRequestListItem | RequestListItem]:
    items, total = request_service.list_requests(
        db,
        user,
        limit=limit,
        offset=offset,
        status=status,
        category=category,
        priority=priority,
        assigned_to=assigned_to,
        mine=mine,
        sort=sort,
        direction=direction,
    )
    return Page(items=items, total=total, limit=limit, offset=offset)


# Declared before "/{request_id}", which would otherwise try to read "counts" as an ID.
@router.get("/counts")
def request_counts(
    mine: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RequestCounts:
    counts = request_service.count_by_status(db, user, mine=mine)
    return RequestCounts(counts=counts, total=sum(counts.values()))


@router.get("/{request_id}")
def get_request(
    request_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StaffRequestDetail | RequesterRequestDetail:
    request = request_service.get_visible_request(db, user, request_id)
    return request_service.build_detail(db, user, request)


@router.post("/{request_id}/analyze")
def analyze_request(
    request_id: uuid.UUID,
    user: User = Depends(get_current_user),
    provider: AgentProvider = Depends(get_agent_provider),
    db: Session = Depends(get_db),
) -> StaffRequestDetail | RequesterRequestDetail:
    """Run one AI analysis. A plain `def`, so the provider call runs in a worker thread."""
    analyze_limiter.check(str(user.id))
    request = orchestrator.analyze_request(db, user, request_id, provider)
    return request_service.build_detail(db, user, request)


@router.post("/{request_id}/review")
def review_request(
    request_id: uuid.UUID,
    payload: ReviewCreate,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
) -> StaffRequestDetail:
    request = review_service.review_suggestion(db, user, request_id, payload)
    return request_service.build_detail(db, user, request)


@router.post("/{request_id}/feedback", status_code=201)
def add_feedback(
    request_id: uuid.UUID,
    payload: FeedbackCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FeedbackCreated:
    return FeedbackCreated.model_validate(
        review_service.add_feedback(db, user, request_id, payload)
    )


@router.post("/{request_id}/comments", status_code=201)
def add_comment(
    request_id: uuid.UUID,
    payload: CommentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StaffComment | PublicComment:
    comment = request_service.add_comment(db, user, request_id, payload)
    return request_service.serialize_comment(user, comment)


@router.patch("/{request_id}")
def update_request(
    request_id: uuid.UUID,
    payload: RequestUpdate,
    user: User = Depends(require_roles(*STAFF_ROLES)),
    db: Session = Depends(get_db),
) -> StaffRequestDetail:
    request = request_service.update_request(db, user, request_id, payload)
    return request_service.build_detail(db, user, request)
