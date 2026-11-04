"""The provider contract: what an agent receives, what it must return and how it fails."""

import uuid
from dataclasses import dataclass
from typing import Annotated, Protocol

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.db.models.enums import AiMode, Category, Priority, RiskFlag


class TriageResult(BaseModel):
    """A model's proposal. Nothing here is trusted until the orchestrator and policy check it."""

    model_config = ConfigDict(extra="forbid", strict=True)

    summary: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    category: Category
    priority: Priority
    confidence: Annotated[float, Field(ge=0, le=1)]
    risk_flags: list[RiskFlag]
    recommended_reply: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1200)
    ]
    citation_article_ids: Annotated[list[uuid.UUID], Field(max_length=5)]
    requires_human_review: bool
    rationale_short: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]


@dataclass(frozen=True)
class AgentArticle:
    id: uuid.UUID
    title: str
    snippet: str
    # Retrieval metadata for choosing citations. `build_prompt` does not send these to a provider.
    category: str = ""
    rank: float = 0.0
    body_markdown: str = ""


@dataclass(frozen=True)
class AgentInput:
    """Everything a provider may see. Title and description are already redacted."""

    request_id: uuid.UUID  # Correlation only.
    title: str
    description: str
    categories: tuple[str, ...]
    priorities: tuple[str, ...]
    articles: tuple[AgentArticle, ...]  # At most 5, snippets at most 500 characters.
    prompt_version: str


class ProviderError(Exception):
    """A provider failure. The message is a fixed string, so no provider text can leak through."""

    error_code = "AI_UNAVAILABLE"
    retryable = True
    message = "The AI provider is unavailable"
    http_status: int | None = None  # The only provider detail that may be logged.

    def __init__(self) -> None:
        super().__init__(self.message)


class ProviderTimeout(ProviderError):
    error_code = "AI_TIMEOUT"
    message = "The AI provider timed out"


class ProviderRateLimited(ProviderError):
    error_code = "AI_RATE_LIMITED"
    message = "The AI provider is rate limited"


class ProviderUnavailable(ProviderError):
    pass


class ProviderInvalidOutput(ProviderError):
    error_code = "AI_INVALID_OUTPUT"
    message = "The AI provider returned invalid output"


class ProviderAuthError(ProviderError):
    error_code = "AI_AUTH"
    retryable = False
    message = "The AI provider rejected the configured credentials"


class AgentProvider(Protocol):
    mode: AiMode
    model_id: str | None
    token_counts: dict[str, int] | None  # Set by `analyze` when the provider reports usage.

    def analyze(self, agent_input: AgentInput) -> TriageResult: ...
