import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.db.models import AuditLog, KnowledgeArticle, ServiceRequest, User
from app.db.models.enums import Role
from app.db.session import get_db
from app.schemas.audit import AuditEntry
from app.schemas.common import NoNul, Page

router = APIRouter(prefix="/admin", tags=["admin"])

MAX_FILTER_LENGTH = 100
_ASSIGNMENT_ACTIONS = ("request.assigned", "request.unassigned")


def _entity_names(db: Session, logs: list[AuditLog]) -> dict[uuid.UUID, str]:
    """Titles for the requests and articles on this page of the log."""
    names: dict[uuid.UUID, str] = {}
    for entity_type, model in (
        ("service_request", ServiceRequest),
        ("knowledge_article", KnowledgeArticle),
    ):
        ids = {log.entity_id for log in logs if log.entity_type == entity_type and log.entity_id}
        if ids:
            rows = db.execute(select(model.id, model.title).where(model.id.in_(ids)))
            names.update({row[0]: row[1] for row in rows})
    return names


def _assignee_names(db: Session, logs: list[AuditLog]) -> dict[str, str]:
    """Display names for the user IDs that assignment rows hold in their metadata."""
    ids = {
        uuid.UUID(value)
        for log in logs
        if log.action in _ASSIGNMENT_ACTIONS
        for value in (log.safe_metadata.get("from"), log.safe_metadata.get("to"))
        if value
    }
    if not ids:
        return {}
    rows = db.execute(select(User.id, User.display_name).where(User.id.in_(ids)))
    return {str(row[0]): row[1] for row in rows}


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
    logs = [row[0] for row in rows]
    entity_names = _entity_names(db, logs)
    assignees = _assignee_names(db, logs)
    return Page(
        items=[
            AuditEntry.model_validate(row[0]).model_copy(
                update={
                    "actor_name": row[1],
                    "entity_name": entity_names.get(row[0].entity_id),
                    "names": {
                        value: assignees[value]
                        for value in row[0].safe_metadata.values()
                        if isinstance(value, str) and value in assignees
                    },
                }
            )
            for row in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )
