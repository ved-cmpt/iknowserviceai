from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.session import get_db
from app.services.readiness import check_readiness

router = APIRouter(tags=["health"])


@router.get("/healthz")
def healthz() -> dict[str, str]:
    """Liveness. Has no dependencies."""
    return {"status": "ok"}


@router.get("/readyz")
def readyz(db: Session = Depends(get_db)) -> dict[str, str]:
    """Readiness: database reachable and migrations at head."""
    ready, details = check_readiness(db)
    if not ready:
        raise AppError(503, "NOT_READY", "Service is not ready")
    return {"status": "ready", **details}
