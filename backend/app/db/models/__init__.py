from app.db.models.ai import AiRun, AiSuggestion, RequestFeedback
from app.db.models.audit import AuditLog
from app.db.models.base import Base
from app.db.models.demo import DemoState
from app.db.models.knowledge import KnowledgeArticle
from app.db.models.request import RequestComment, RequestEvent, ServiceRequest
from app.db.models.session import RefreshToken
from app.db.models.user import User


def data_tables() -> list:
    """Every table a demo reset empties. demo_state is configuration, and must survive a reset."""
    return [table for table in Base.metadata.sorted_tables if table.name != "demo_state"]


__all__ = [
    "AiRun",
    "AiSuggestion",
    "AuditLog",
    "Base",
    "DemoState",
    "KnowledgeArticle",
    "data_tables",
    "RefreshToken",
    "RequestComment",
    "RequestEvent",
    "RequestFeedback",
    "ServiceRequest",
    "User",
]
