import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.common import Page
from app.schemas.requests import (
    RequesterRequestDetail,
    RequestListItem,
    StaffRequestDetail,
    StaffRequestListItem,
)
from app.services import requests as request_service

router = APIRouter(prefix="/requests", tags=["requests"])


@router.get("")
def list_requests(
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Page[StaffRequestListItem | RequestListItem]:
    items, total = request_service.list_requests(db, user, limit=limit, offset=offset)
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{request_id}")
def get_request(
    request_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StaffRequestDetail | RequesterRequestDetail:
    request = request_service.get_visible_request(db, user, request_id)
    return request_service.build_detail(db, user, request)
