"""Fake providers for tests. No test outside tests/live/ may reach a real provider."""

import uuid
from collections.abc import Callable
from typing import Any

from app.db.models.enums import AiMode
from app.main import app
from app.services.ai.base import AgentInput, TriageResult
from app.services.ai.factory import get_agent_provider


def triage_result(**overrides: Any) -> TriageResult:
    values: dict[str, Any] = {
        "summary": "A short summary",
        "category": "NETWORK",
        "priority": "MEDIUM",
        "confidence": 0.9,
        "risk_flags": [],
        "recommended_reply": "Check the steps in the cited article.",
        "citation_article_ids": [],
        "requires_human_review": False,
        "rationale_short": "The request describes a network problem.",
        **overrides,
    }
    return TriageResult.model_validate(values, strict=False)


class FakeProvider:
    """Returns `result`, or a result built from the input, or raises `error`. Records its calls."""

    mode = AiMode.GEMINI
    model_id = "fake-model"

    def __init__(
        self,
        *,
        error: Exception | None = None,
        result: TriageResult | None = None,
        build: Callable[[AgentInput], TriageResult] | None = None,
        token_counts: dict[str, int] | None = None,
    ) -> None:
        self.error = error
        self.result = result
        self.build = build
        self.token_counts = token_counts
        self.calls: list[AgentInput] = []

    def analyze(self, agent_input: AgentInput) -> TriageResult:
        self.calls.append(agent_input)
        if self.error is not None:
            raise self.error
        if self.build is not None:
            return self.build(agent_input)
        if self.result is not None:
            return self.result
        return triage_result(
            citation_article_ids=[article.id for article in agent_input.articles[:1]]
        )


def use_provider(provider: FakeProvider) -> FakeProvider:
    """Inject a provider. The `client` fixture clears the override afterwards."""
    app.dependency_overrides[get_agent_provider] = lambda: provider
    return provider


def citing(*article_ids: uuid.UUID, **overrides: Any) -> FakeProvider:
    return FakeProvider(result=triage_result(citation_article_ids=list(article_ids), **overrides))
