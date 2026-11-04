from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import get_settings

router = APIRouter(tags=["config"])


class PublicConfig(BaseModel):
    demo_mode: bool
    demo_password_hint: str | None


@router.get("/config")
def public_config() -> PublicConfig:
    """What the sign-in page may show. One image serves demo and non-demo sites (ADR-046)."""
    settings = get_settings()
    show = settings.show_demo_help
    return PublicConfig(demo_mode=show, demo_password_hint=settings.demo_password if show else None)
