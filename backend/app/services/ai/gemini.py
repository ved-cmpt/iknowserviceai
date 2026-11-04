"""The only module that talks to Gemini. Uses the Interactions API (ADR-029).

No exception, response body or API key from here may reach logs or callers. Provider errors carry
fixed messages, and every SDK exception is replaced with `from None`, so its text cannot be chained.
"""

import random
import time
from collections.abc import Callable
from functools import lru_cache
from typing import Any

import httpx
from google import genai
from google.genai import types
from pydantic import ValidationError

from app.core.config import Settings
from app.db.models.enums import AiMode, Category, Priority
from app.services.ai.base import (
    AgentInput,
    ProviderAuthError,
    ProviderError,
    ProviderInvalidOutput,
    ProviderRateLimited,
    ProviderTimeout,
    ProviderUnavailable,
    TriageResult,
)
from app.services.ai.prompts import build_prompt
from app.services.policy import HARD_FLAGS

# The global limit on provider calls for one user action (blueprint section 6.5).
MAX_ATTEMPTS = 2
_BACKOFF_SECONDS = (0.5, 1.5)
# The SDK retries 429 and 5xx by default, even with attempts=1, so a status that never occurs turns
# that off. This class controls the retries, which keeps the limit above true (see tests).
_NO_SDK_RETRIES = types.HttpRetryOptions(attempts=1, http_status_codes=[599])

RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "summary": {"type": "string", "description": "At most 200 characters."},
        "category": {"type": "string", "enum": [item.value for item in Category]},
        "priority": {"type": "string", "enum": [item.value for item in Priority]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "risk_flags": {
            "type": "array",
            "items": {"type": "string", "enum": sorted(flag.value for flag in HARD_FLAGS)},
        },
        "recommended_reply": {"type": "string", "description": "At most 1200 characters."},
        "citation_article_ids": {
            "type": "array",
            "items": {"type": "string"},
            "maxItems": 5,
            "description": "Only IDs from the supplied published articles.",
        },
        "requires_human_review": {"type": "boolean"},
        "rationale_short": {"type": "string", "description": "At most 300 characters."},
    },
    "required": [
        "summary",
        "category",
        "priority",
        "confidence",
        "risk_flags",
        "recommended_reply",
        "citation_article_ids",
        "requires_human_review",
        "rationale_short",
    ],
}


def build_client(
    api_key: str, timeout_seconds: float, http_client: httpx.Client | None = None
) -> genai.Client:
    options = types.HttpOptions(
        timeout=int(timeout_seconds * 1000),
        retry_options=_NO_SDK_RETRIES,
        httpx_client=http_client,
    )
    return genai.Client(api_key=api_key, http_options=options)


@lru_cache(maxsize=1)
def _shared_client(api_key: str, timeout_seconds: float) -> genai.Client:
    """Reuse one client, and so one connection pool, across requests."""
    return build_client(api_key, timeout_seconds)


def _status_of(error: Exception) -> int | None:
    for attribute in ("status_code", "code"):
        value = getattr(error, attribute, None)
        if isinstance(value, int):
            return value
    return None


def _classify(error: Exception) -> tuple[ProviderError, bool]:
    """Map an SDK exception to a typed error, and say whether one retry is allowed.

    Only timeouts, 408, 429 and 5xx are retried. The exception's text is used solely to recognize
    an invalid key, which Google reports as a 400. It is never stored.
    """
    status = _status_of(error)
    timed_out = isinstance(error, TimeoutError | httpx.TimeoutException) or (
        type(error).__name__ == "APITimeoutError"
    )
    mapped: ProviderError
    retry = False
    if timed_out or status == 408:
        mapped, retry = ProviderTimeout(), True
    elif status == 429:
        mapped, retry = ProviderRateLimited(), True
    elif status in (401, 403) or (status == 400 and "API_KEY_INVALID" in str(error)):
        mapped = ProviderAuthError()
    elif status is not None and status >= 500:
        mapped, retry = ProviderUnavailable(), True
    else:
        mapped = ProviderUnavailable()
    mapped.http_status = status
    return mapped, retry


def _token_counts(interaction: Any) -> dict[str, int] | None:
    usage = getattr(interaction, "usage", None)
    if usage is None:
        return None
    counts = {
        "input": getattr(usage, "total_input_tokens", None),
        "output": getattr(usage, "total_output_tokens", None),
        "thought": getattr(usage, "total_thought_tokens", None),
        "total": getattr(usage, "total_tokens", None),
    }
    return {key: value for key, value in counts.items() if isinstance(value, int)} or None


class GeminiAgent:
    mode = AiMode.GEMINI

    def __init__(
        self,
        *,
        client: Any,
        model_id: str,
        timeout_seconds: float,
        max_output_tokens: int,
        thinking_level: str,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._client = client
        self.model_id = model_id
        self._timeout_seconds = timeout_seconds
        self._max_output_tokens = max_output_tokens
        self._thinking_level = thinking_level
        self._sleep = sleep
        self.token_counts: dict[str, int] | None = None

    @classmethod
    def from_settings(cls, settings: Settings, *, client: Any = None) -> "GeminiAgent":
        if settings.gemini_api_key is None or not settings.gemini_model:
            raise ProviderAuthError
        return cls(
            client=client
            or _shared_client(
                settings.gemini_api_key.get_secret_value().strip(),
                settings.ai_request_timeout_seconds,
            ),
            model_id=settings.gemini_model,
            timeout_seconds=settings.ai_request_timeout_seconds,
            max_output_tokens=settings.ai_max_output_tokens,
            thinking_level=settings.ai_thinking_level,
        )

    def _call(self, agent_input: AgentInput) -> Any:
        prompt = build_prompt(agent_input)
        return self._client.interactions.create(
            model=self.model_id,
            input=prompt.user,
            system_instruction=prompt.system,
            store=False,  # No server-side retention (ADR-004).
            automatic_continuation=False,  # Continuation would be further billable calls.
            timeout=self._timeout_seconds,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": RESPONSE_SCHEMA,
            },
            generation_config={
                "max_output_tokens": self._max_output_tokens,
                "temperature": 0,
                "thinking_level": self._thinking_level,
            },
        )

    def _parse(self, interaction: Any) -> TriageResult:
        self.token_counts = _token_counts(interaction)
        status = getattr(interaction, "status", None)
        if status == "failed":
            raise ProviderUnavailable
        text = getattr(interaction, "output_text", None)
        # "incomplete" and similar statuses mean the JSON may be cut off.
        if status != "completed" or not isinstance(text, str) or not text.strip():
            raise ProviderInvalidOutput
        try:
            return TriageResult.model_validate_json(text)
        except ValidationError:
            raise ProviderInvalidOutput from None

    def analyze(self, agent_input: AgentInput) -> TriageResult:
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                interaction = self._call(agent_input)
            except Exception as error:  # noqa: BLE001 - Every SDK failure must be sanitized.
                mapped, retry = _classify(error)
                if not retry or attempt == MAX_ATTEMPTS:
                    raise mapped from None
                # Jitter spreads out retries. It does not need cryptographic randomness.
                self._sleep(random.uniform(*_BACKOFF_SECONDS))  # noqa: S311
                continue
            return self._parse(interaction)
        raise ProviderUnavailable  # Unreachable: the loop always returns or raises.
