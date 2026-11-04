from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import get_settings

router = APIRouter(tags=["config"])

DEMO_BANNER = "Public demo — shared synthetic data, resets daily. Don't enter personal information."
MOCK_AI_NOTICE = "AI responses in this demo are simulated by the built-in mock agent."


class PublicConfig(BaseModel):
    demo_mode: bool
    demo_password_hint: str | None
    demo_banner: str | None
    ai_notice: str | None


@router.get("/config")
def public_config() -> PublicConfig:
    """What the pages may show. One image serves demo and non-demo sites (ADR-046, ADR-051)."""
    settings = get_settings()
    show = settings.show_demo_help
    return PublicConfig(
        demo_mode=show,
        demo_password_hint=settings.demo_password if show else None,
        demo_banner=DEMO_BANNER if settings.demo_mode else None,
        ai_notice=MOCK_AI_NOTICE if settings.demo_mode and settings.ai_mode == "mock" else None,
    )
