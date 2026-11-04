"""GeminiAgent, offline. Stubs replace either the SDK client or its HTTP transport."""

import json
import os
import subprocess
import sys
import uuid
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from pydantic import SecretStr

from app.core.config import Settings
from app.db.models.enums import Category, Priority
from app.services.ai import factory
from app.services.ai.base import (
    AgentArticle,
    AgentInput,
    ProviderAuthError,
    ProviderInvalidOutput,
    ProviderRateLimited,
    ProviderTimeout,
    ProviderUnavailable,
)
from app.services.ai.gemini import MAX_ATTEMPTS, RESPONSE_SCHEMA, GeminiAgent, build_client
from app.services.ai.prompts import PROMPT_VERSION

ARTICLE_ID = uuid.uuid4()
FAKE_KEY = "fake-key-value-for-tests"
VALID_OUTPUT = {
    "summary": "Wi-Fi connects but pages fail",
    "category": "NETWORK",
    "priority": "MEDIUM",
    "confidence": 0.88,
    "risk_flags": [],
    "recommended_reply": "Try the checks in the Wi-Fi guide.",
    "citation_article_ids": [str(ARTICLE_ID)],
    "requires_human_review": False,
    "rationale_short": "This is a connectivity problem.",
}
AGENT_INPUT = AgentInput(
    request_id=uuid.uuid4(),
    title="Campus Wi-Fi connects but websites do not load",
    description="Every website times out.",
    categories=tuple(Category),
    priorities=tuple(Priority),
    articles=(AgentArticle(ARTICLE_ID, "Wi-Fi guide", "Restart the adapter."),),
    prompt_version=PROMPT_VERSION,
)


class StatusError(Exception):
    def __init__(self, status_code: int, text: str = "provider body with secret-value-123") -> None:
        super().__init__(text)
        self.status_code = status_code


class APITimeoutError(Exception):
    """Named like the SDK's timeout class."""


def _interaction(text: str | None = None, status: str = "completed", usage: Any = None):
    return SimpleNamespace(
        status=status,
        output_text=json.dumps(VALID_OUTPUT) if text is None else text,
        usage=usage,
    )


class StubInteractions:
    def __init__(self, *outcomes: Any) -> None:
        self.outcomes = list(outcomes)
        self.calls: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def _agent(*outcomes: Any) -> tuple[GeminiAgent, StubInteractions, list[float]]:
    stub = StubInteractions(*outcomes)
    sleeps: list[float] = []
    agent = GeminiAgent(
        client=SimpleNamespace(interactions=stub),
        model_id="test-model",
        timeout_seconds=7,
        max_output_tokens=512,
        thinking_level="low",
        sleep=sleeps.append,
    )
    return agent, stub, sleeps


def test_success_returns_a_validated_result() -> None:
    usage = SimpleNamespace(
        total_input_tokens=11, total_output_tokens=7, total_thought_tokens=2, total_tokens=20
    )
    agent, stub, sleeps = _agent(_interaction(usage=usage))
    result = agent.analyze(AGENT_INPUT)
    assert result.category == Category.NETWORK
    assert result.citation_article_ids == [ARTICLE_ID]
    assert agent.token_counts == {"input": 11, "output": 7, "thought": 2, "total": 20}
    assert len(stub.calls) == 1
    assert sleeps == []


def test_call_uses_structured_output_with_no_storage_and_bounded_settings() -> None:
    agent, stub, _ = _agent(_interaction())
    agent.analyze(AGENT_INPUT)
    call = stub.calls[0]
    assert call["model"] == "test-model"
    assert call["store"] is False
    assert call["automatic_continuation"] is False
    assert call["timeout"] == 7
    assert call["response_format"]["mime_type"] == "application/json"
    assert call["response_format"]["schema"] == RESPONSE_SCHEMA
    assert call["generation_config"]["max_output_tokens"] == 512
    assert call["generation_config"]["thinking_level"] == "low"
    assert "untrusted data" in call["system_instruction"]
    assert "<<<REQUEST_START>>>" in call["input"]


@pytest.mark.parametrize(
    "text",
    [
        "this is not json",
        '{"summary": "cut off',
        "[]",
        json.dumps({**VALID_OUTPUT, "extra_field": "x"}),
        json.dumps({**VALID_OUTPUT, "category": "NOT_A_CATEGORY"}),
        json.dumps({**VALID_OUTPUT, "risk_flags": ["NOT_A_FLAG"]}),
        json.dumps({**VALID_OUTPUT, "confidence": 1.5}),
        json.dumps({**VALID_OUTPUT, "confidence": "0.5"}),
        json.dumps({**VALID_OUTPUT, "citation_article_ids": ["not-a-uuid"]}),
        json.dumps({**VALID_OUTPUT, "summary": "x" * 201}),
        json.dumps({**VALID_OUTPUT, "recommended_reply": ""}),
        json.dumps({key: VALID_OUTPUT[key] for key in VALID_OUTPUT if key != "summary"}),
        "",
    ],
)
def test_invalid_output_is_rejected_without_retry(text: str) -> None:
    agent, stub, _ = _agent(_interaction(text))
    with pytest.raises(ProviderInvalidOutput):
        agent.analyze(AGENT_INPUT)
    assert len(stub.calls) == 1


@pytest.mark.parametrize("status", ["incomplete", "requires_continuation", "budget_exceeded"])
def test_unfinished_interaction_is_invalid_output(status: str) -> None:
    agent, _, _ = _agent(_interaction(status=status))
    with pytest.raises(ProviderInvalidOutput):
        agent.analyze(AGENT_INPUT)


def test_failed_interaction_is_unavailable() -> None:
    agent, _, _ = _agent(_interaction(status="failed"))
    with pytest.raises(ProviderUnavailable):
        agent.analyze(AGENT_INPUT)


def test_rate_limit_then_success_retries_once_with_jitter() -> None:
    agent, stub, sleeps = _agent(StatusError(429), _interaction())
    assert agent.analyze(AGENT_INPUT).category == Category.NETWORK
    assert len(stub.calls) == 2
    assert len(sleeps) == 1
    assert 0.5 <= sleeps[0] <= 1.5


def test_rate_limit_exhausted_stops_at_two_calls() -> None:
    agent, stub, _ = _agent(StatusError(429), StatusError(429), _interaction())
    with pytest.raises(ProviderRateLimited):
        agent.analyze(AGENT_INPUT)
    assert len(stub.calls) == MAX_ATTEMPTS == 2


@pytest.mark.parametrize(
    "timeout_error",
    [TimeoutError(), APITimeoutError(), httpx.ReadTimeout("slow"), StatusError(408)],
)
def test_timeout_then_success(timeout_error: Exception) -> None:
    agent, stub, _ = _agent(timeout_error, _interaction())
    agent.analyze(AGENT_INPUT)
    assert len(stub.calls) == 2


def test_timeout_exhausted_raises_typed_error() -> None:
    agent, stub, _ = _agent(TimeoutError(), TimeoutError())
    with pytest.raises(ProviderTimeout):
        agent.analyze(AGENT_INPUT)
    assert len(stub.calls) == 2


@pytest.mark.parametrize("status", [500, 502, 503, 504])
def test_server_error_retries_then_is_unavailable(status: int) -> None:
    agent, stub, _ = _agent(StatusError(status), StatusError(status))
    with pytest.raises(ProviderUnavailable) as caught:
        agent.analyze(AGENT_INPUT)
    assert len(stub.calls) == 2
    assert caught.value.http_status == status


@pytest.mark.parametrize(
    "error",
    [StatusError(401), StatusError(403), StatusError(400, "reason: API_KEY_INVALID")],
)
def test_auth_error_is_not_retried(error: Exception) -> None:
    agent, stub, sleeps = _agent(error)
    with pytest.raises(ProviderAuthError):
        agent.analyze(AGENT_INPUT)
    assert len(stub.calls) == 1
    assert sleeps == []


@pytest.mark.parametrize("error", [StatusError(400), StatusError(404), ConnectionError("down")])
def test_other_failures_are_not_retried(error: Exception) -> None:
    agent, stub, _ = _agent(error)
    with pytest.raises(ProviderUnavailable):
        agent.analyze(AGENT_INPUT)
    assert len(stub.calls) == 1


def test_provider_text_never_appears_in_the_raised_error() -> None:
    agent, _, _ = _agent(StatusError(500), StatusError(500))
    with pytest.raises(ProviderUnavailable) as caught:
        agent.analyze(AGENT_INPUT)
    assert "secret-value-123" not in str(caught.value)
    assert caught.value.__cause__ is None
    assert caught.value.__suppress_context__ is True


# The real SDK with a fake transport. This proves the call limit, which stubs cannot.


def _real_sdk_agent(handler) -> tuple[GeminiAgent, httpx.Client]:
    http_client = httpx.Client(transport=httpx.MockTransport(handler))
    agent = GeminiAgent(
        client=build_client(FAKE_KEY, 5, http_client=http_client),
        model_id="test-model",
        timeout_seconds=5,
        max_output_tokens=512,
        thinking_level="low",
        sleep=lambda _seconds: None,
    )
    return agent, http_client


def _success_response() -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "interaction-id",
            "status": "completed",
            "created": "2026-01-01T00:00:00Z",
            "updated": "2026-01-01T00:00:00Z",
            "steps": [
                {
                    "type": "model_output",
                    "content": [{"type": "text", "text": json.dumps(VALID_OUTPUT)}],
                }
            ],
            "usage": {"total_input_tokens": 11, "total_output_tokens": 7, "total_tokens": 18},
        },
    )


@pytest.mark.parametrize(
    ("status", "error"), [(429, ProviderRateLimited), (503, ProviderUnavailable)]
)
def test_real_sdk_makes_exactly_two_http_requests_when_failing(status: int, error: type) -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(status, json={"error": {"code": status, "message": "detail"}})

    agent, _ = _real_sdk_agent(handler)
    with pytest.raises(error):
        agent.analyze(AGENT_INPUT)
    assert len(requests) == 2


def test_real_sdk_makes_one_http_request_on_auth_failure() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(401, json={"error": {"code": 401, "message": "detail"}})

    agent, _ = _real_sdk_agent(handler)
    with pytest.raises(ProviderAuthError):
        agent.analyze(AGENT_INPUT)
    assert len(requests) == 1


def test_real_sdk_maps_a_transport_timeout() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        raise httpx.ReadTimeout("slow", request=request)

    agent, _ = _real_sdk_agent(handler)
    with pytest.raises(ProviderTimeout):
        agent.analyze(AGENT_INPUT)
    assert len(requests) == 2


def test_real_sdk_request_shape_and_response_parsing() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return _success_response()

    agent, _ = _real_sdk_agent(handler)
    result = agent.analyze(AGENT_INPUT)
    assert result.citation_article_ids == [ARTICLE_ID]
    assert agent.token_counts == {"input": 11, "output": 7, "total": 18}

    assert len(requests) == 1
    body = json.loads(requests[0].content)
    assert body["store"] is False
    assert body["model"] == "test-model"
    assert body["response_format"]["schema"]["required"]
    # The key travels in a header, never in the URL or the body.
    assert FAKE_KEY not in str(requests[0].url)
    assert FAKE_KEY not in requests[0].content.decode()


def test_real_sdk_error_text_holds_no_key() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text=f"echo {FAKE_KEY}")

    agent, _ = _real_sdk_agent(handler)
    with pytest.raises(ProviderUnavailable) as caught:
        agent.analyze(AGENT_INPUT)
    assert FAKE_KEY not in str(caught.value)


# Settings and the factory


def _settings(**overrides: Any) -> Settings:
    values = {"database_url": "postgresql+psycopg://x@y/z", "jwt_secret": "x" * 32}
    return Settings(_env_file=None, **{**values, **overrides})


def test_gemini_mode_requires_a_key(monkeypatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        _settings(ai_mode="gemini", gemini_model="m")


def test_gemini_mode_requires_a_real_model_name(monkeypatch) -> None:
    with pytest.raises(ValueError, match="GEMINI_MODEL"):
        _settings(ai_mode="gemini", gemini_api_key=FAKE_KEY, gemini_model="<choose-a-model>")


def test_the_key_stays_out_of_settings_output() -> None:
    settings = _settings(gemini_api_key=FAKE_KEY)
    assert isinstance(settings.gemini_api_key, SecretStr)
    assert FAKE_KEY not in repr(settings)
    assert FAKE_KEY not in str(settings.model_dump())


def test_a_settings_error_does_not_echo_the_key(monkeypatch) -> None:
    with pytest.raises(ValueError) as caught:
        _settings(ai_mode="gemini", gemini_api_key=FAKE_KEY, gemini_model="<choose>")
    assert FAKE_KEY not in str(caught.value)


def test_from_settings_uses_configured_values() -> None:
    stub = StubInteractions(_interaction())
    settings = _settings(
        ai_mode="gemini",
        gemini_api_key=FAKE_KEY,
        gemini_model="configured-model",
        ai_request_timeout_seconds=9,
    )
    agent = GeminiAgent.from_settings(settings, client=SimpleNamespace(interactions=stub))
    agent.analyze(AGENT_INPUT)
    assert stub.calls[0]["model"] == "configured-model"
    assert stub.calls[0]["timeout"] == 9


def test_mock_mode_never_imports_the_sdk() -> None:
    code = (
        "import sys; from app.main import app; "
        "from app.services.ai.factory import get_agent_provider; get_agent_provider(); "
        "sys.exit(1 if 'google.genai' in sys.modules else 0)"
    )
    env = {**os.environ, "AI_MODE": "mock"}
    assert subprocess.run([sys.executable, "-c", code], env=env, check=False).returncode == 0  # noqa: S603


def test_factory_builds_the_gemini_agent_in_gemini_mode(monkeypatch) -> None:
    settings = _settings(ai_mode="gemini", gemini_api_key=FAKE_KEY, gemini_model="configured-model")
    monkeypatch.setattr(factory, "get_settings", lambda: settings)
    provider = factory.get_agent_provider()
    assert isinstance(provider, GeminiAgent)
    assert provider.model_id == "configured-model"
