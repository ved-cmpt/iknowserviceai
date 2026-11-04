from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.db.models import AuditLog, User
from app.db.models.enums import Role
from app.db.session import get_db
from app.schemas.audit import AuditEntry
from app.schemas.common import NoNul, Page

router = APIRouter(prefix="/admin", tags=["admin"])

MAX_FILTER_LENGTH = 100


@router.get("/audit")
def list_audit(
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    action: Annotated[str | None, Query(max_length=MAX_FILTER_LENGTH), NoNul] = None,
    entity_type: Annotated[str | None, Query(max_length=MAX_FILTER_LENGTH), NoNul] = None,
    _: User = Depends(require_roles(Role.ADMIN)),
    db: Session = Depends(get_db),
) -> Page[AuditEntry]:
    filters = []
    if action:
        filters.append(AuditLog.action == action)
    if entity_type:
        filters.append(AuditLog.entity_type == entity_type)

    total = db.scalar(select(func.count()).select_from(AuditLog).where(*filters)) or 0
    rows = db.execute(
        select(AuditLog, User.display_name)
        .outerjoin(User, AuditLog.actor_id == User.id)
        .where(*filters)
        .order_by(AuditLog.occurred_at.desc(), AuditLog.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return Page(
        items=[
            AuditEntry.model_validate(row[0]).model_copy(update={"actor_name": row[1]})
            for row in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )
