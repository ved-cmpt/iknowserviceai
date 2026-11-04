"""Choose the provider from AI_MODE. Tests replace this dependency with fake providers."""

from app.core.config import get_settings
from app.services.ai.base import AgentProvider, ProviderUnavailable
from app.services.ai.mock import MockAgent


def get_agent_provider() -> AgentProvider:
    """Return a new provider per call, because a provider records token counts for its run."""
    settings = get_settings()
    if settings.ai_mode == "gemini":
        raise ProviderUnavailable
    return MockAgent()
