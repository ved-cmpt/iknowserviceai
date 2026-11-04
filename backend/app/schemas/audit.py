import uuid
from datetime import datetime
from typing import Any

from app.schemas.common import ORMModel


class AuditEntry(ORMModel):
    id: uuid.UUID
    actor_id: uuid.UUID | None
    actor_name: str | None = None
    entity_type: str
    entity_id: uuid.UUID | None
    entity_name: str | None = None  # The request or article title, when it still exists.
    # Display names for user IDs held in safe_metadata, such as an assignee.
    names: dict[str, str] = {}
    action: str
    safe_metadata: dict[str, Any]
    occurred_at: datetime
