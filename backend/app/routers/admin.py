from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.db.models import AuditLog, User
from app.db.models.enums import Role
from app.db.session import get_db
from app.schemas.audit import AuditEntry
from app.schemas.common import Page

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/audit")
def list_audit(
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    _: User = Depends(require_roles(Role.ADMIN)),
    db: Session = Depends(get_db),
) -> Page[AuditEntry]:
    total = db.scalar(select(func.count()).select_from(AuditLog)) or 0
    rows = db.scalars(
        select(AuditLog)
        .order_by(AuditLog.occurred_at.desc(), AuditLog.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return Page(
        items=[AuditEntry.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )
