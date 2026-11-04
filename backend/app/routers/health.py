from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.session import get_probe_db
from app.services.readiness import check_readiness_with_retry

router = APIRouter(tags=["health"])


@router.get("/healthz")
def healthz() -> dict[str, str]:
    """Liveness. Has no dependencies."""
    return {"status": "ok"}


@router.get("/readyz")
def readyz(db: Session = Depends(get_probe_db)) -> dict[str, str]:
    """Readiness: database reachable and migrations at head.

    With the database down, it answers in about 4.5 seconds: under a host's 5 second limit.
    """
    ready, details = check_readiness_with_retry(db)
    if not ready:
        raise AppError(503, "NOT_READY", "Service is not ready", extra=details)
    return {"status": "ready", **details}
