import uuid
from datetime import datetime
from typing import Any

from app.schemas.common import ORMModel


class AuditEntry(ORMModel):
    id: uuid.UUID
    actor_id: uuid.UUID | None
    entity_type: str
    entity_id: uuid.UUID | None
    action: str
    safe_metadata: dict[str, Any]
    occurred_at: datetime
