"""An opt-in smoke test against the real Gemini API. It never runs by default.

    docker compose exec -T -e RUN_LIVE_GEMINI_TESTS=1 backend pytest -q -s tests/live

It makes one analysis, which is at most 2 HTTP requests. Output is limited to a sanitized summary.
"""

import os
import time
import uuid

import httpx
import pytest

from app.core.config import get_settings
from app.db.models.enums import Category, Priority
from app.scripts.seed_data import ARTICLES
from app.services.ai.base import AgentArticle, AgentInput, ProviderError, TriageResult
from app.services.ai.gemini import MAX_ATTEMPTS, GeminiAgent, build_client
from app.services.ai.prompts import PROMPT_VERSION
from app.services.text import make_snippet

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LIVE_GEMINI_TESTS") != "1",
    reason="Set RUN_LIVE_GEMINI_TESTS=1 to call the real Gemini API",
)


def _article(slug: str) -> AgentArticle:
    article = next(item for item in ARTICLES if item["slug"] == slug)
    return AgentArticle(uuid.uuid4(), article["title"], make_snippet(article["body"], 500))


def test_live_analysis_returns_a_valid_cited_result() -> None:
    settings = get_settings()
    requests = []
    http_client = httpx.Client(
        timeout=settings.ai_request_timeout_seconds, event_hooks={"request": [requests.append]}
    )
    client = build_client(
        settings.gemini_api_key.get_secret_value().strip(),
        settings.ai_request_timeout_seconds,
        http_client=http_client,
    )
    agent = GeminiAgent.from_settings(settings, client=client)
    articles = (_article("wifi-connected-no-internet"), _article("vpn-connectivity"))
    agent_input = AgentInput(
        request_id=uuid.uuid4(),
        title="Campus Wi-Fi connects but websites do not load",
        description="My laptop shows it is connected to Wi-Fi, but every website times out.",
        categories=tuple(Category),
        priorities=tuple(Priority),
        articles=articles,
        prompt_version=PROMPT_VERSION,
    )

    started = time.perf_counter()
    outcome = "pass"
    try:
        result = agent.analyze(agent_input)
    except ProviderError as error:
        outcome = f"{error.error_code} http_status={error.http_status}"
        raise
    finally:
        latency_ms = round((time.perf_counter() - started) * 1000)
        print(
            f"\nLIVE model={agent.model_id} http_requests={len(requests)} "
            f"latency_ms={latency_ms} tokens={agent.token_counts} outcome={outcome}"
        )

    print(
        f"LIVE category={result.category.value} priority={result.priority.value} "
        f"confidence={result.confidence} citations={len(result.citation_article_ids)} "
        f"risk_flags={[flag.value for flag in result.risk_flags]} "
        f"review={result.requires_human_review}"
    )
    assert isinstance(result, TriageResult)
    assert set(result.citation_article_ids) <= {article.id for article in articles}
    assert latency_ms > 0
    assert len(requests) <= MAX_ATTEMPTS
