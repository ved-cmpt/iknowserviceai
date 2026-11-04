"""Audit writer. Adds to the caller's transaction; the caller commits.

Metadata must never contain passwords, tokens or comment bodies.
"""

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import AuditLog


def record_audit(
    db: Session,
    *,
    actor_id: uuid.UUID | None,
    entity_type: str,
    entity_id: uuid.UUID | None,
    action: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_id=actor_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            safe_metadata=metadata or {},
        )
    )
