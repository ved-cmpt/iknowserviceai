"""Rate limits, log masking and CORS."""

import io
import json
import logging
import sys

import pytest
from fastapi.testclient import TestClient

from app.core.logging import JsonFormatter, SecretMaskingFilter, mask_secrets
from app.core.rate_limit import SlidingWindowLimiter, analyze_limiter, login_limiter
from tests.ai_fakes import FakeProvider, use_provider
from tests.conftest import TEST_PASSWORD, auth

LOGIN = "/api/v1/auth/login"
REQUESTS = "/api/v1/requests"
FAKE_KEY = "AQ.FakeKeyValueForTestsOnly1234567890abcdef"


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


# The limiter itself


def test_limiter_allows_up_to_the_limit_and_then_refuses() -> None:
    limiter = SlidingWindowLimiter(2, 60, clock=FakeClock())
    assert limiter.retry_after("a") is None
    assert limiter.retry_after("a") is None
    assert limiter.retry_after("a") == 60


def test_window_slides_rather_than_resetting() -> None:
    clock = FakeClock()
    limiter = SlidingWindowLimiter(2, 60, clock=clock)
    limiter.retry_after("a")
    clock.now += 40
    limiter.retry_after("a")
    clock.now += 19
    assert limiter.retry_after("a") == 1
    clock.now += 2
    assert limiter.retry_after("a") is None  # Only the first hit has expired.
    assert limiter.retry_after("a") == 39


def test_keys_are_independent() -> None:
    limiter = SlidingWindowLimiter(1, 60, clock=FakeClock())
    assert limiter.retry_after("a") is None
    assert limiter.retry_after("b") is None


def test_refused_attempts_do_not_extend_the_wait() -> None:
    clock = FakeClock()
    limiter = SlidingWindowLimiter(1, 60, clock=clock)
    limiter.retry_after("a")
    for _ in range(5):
        clock.now += 10
        limiter.retry_after("a")
    clock.now += 11
    assert limiter.retry_after("a") is None


def test_reset_clears_state() -> None:
    limiter = SlidingWindowLimiter(1, 60, clock=FakeClock())
    limiter.retry_after("a")
    limiter.reset()
    assert limiter.retry_after("a") is None


# Login


def _login(client: TestClient, email: str, password: str = "wrong-password"):
    return client.post(LOGIN, json={"email": email, "password": password})


def test_login_returns_429_with_retry_after(client: TestClient, requester, monkeypatch) -> None:
    monkeypatch.setattr(login_limiter, "limit", 2)
    assert _login(client, requester.email).status_code == 401
    assert _login(client, requester.email).status_code == 401
    response = _login(client, requester.email, TEST_PASSWORD)
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "RATE_LIMITED"
    assert response.json()["error"]["request_id"]
    assert int(response.headers["Retry-After"]) >= 1


def test_login_limit_is_per_email(client: TestClient, requester, agent, monkeypatch) -> None:
    monkeypatch.setattr(login_limiter, "limit", 1)
    assert _login(client, requester.email).status_code == 401
    assert _login(client, requester.email).status_code == 429
    assert _login(client, agent.email, TEST_PASSWORD).status_code == 200


def test_login_limit_ignores_email_case_and_spacing(
    client: TestClient, requester, monkeypatch
) -> None:
    monkeypatch.setattr(login_limiter, "limit", 1)
    assert _login(client, requester.email).status_code == 401
    assert _login(client, f" {requester.email.upper()} ").status_code == 429


def test_default_login_limit_is_five(client: TestClient, requester) -> None:
    statuses = [_login(client, requester.email).status_code for _ in range(6)]
    assert statuses == [401, 401, 401, 401, 401, 429]


# Analyze


def test_analyze_returns_429_per_user(
    client: TestClient, make_request, requester, other_requester, monkeypatch
) -> None:
    monkeypatch.setattr(analyze_limiter, "limit", 1)
    provider = use_provider(FakeProvider())
    first = make_request(requester)
    second = make_request(requester)
    assert client.post(f"{REQUESTS}/{first.id}/analyze", headers=auth(requester)).status_code == 200
    limited = client.post(f"{REQUESTS}/{second.id}/analyze", headers=auth(requester))
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "RATE_LIMITED"
    assert "Retry-After" in limited.headers
    assert len(provider.calls) == 1

    other = make_request(other_requester)
    response = client.post(f"{REQUESTS}/{other.id}/analyze", headers=auth(other_requester))
    assert response.status_code == 200


def test_rate_limited_analysis_leaves_the_request_unchanged(
    client: TestClient, make_request, requester, monkeypatch
) -> None:
    monkeypatch.setattr(analyze_limiter, "limit", 1)
    analyze_limiter.check(str(requester.id))
    request = make_request(requester)
    response = client.post(f"{REQUESTS}/{request.id}/analyze", headers=auth(requester))
    assert response.status_code == 429
    assert request.status == "NEW"


def test_default_analyze_limit_is_ten() -> None:
    assert analyze_limiter.limit == 10
    assert analyze_limiter.window_seconds == 3600


# Log masking


@pytest.mark.parametrize(
    "text",
    [
        "Authorization: Bearer abc.def-ghi_123",
        "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl seen",
        f"key {FAKE_KEY} seen",
        "key AIzaSyA1234567890abcdefghijklmn seen",
        "password=hunter2",
        '{"password": "hunter2"}',
        "api_key: hunter2",
        "x-goog-api-key: hunter2",
        "url https://example.test/path?key=hunter2&x=1",
    ],
)
def test_secret_like_values_are_masked(text: str) -> None:
    masked = mask_secrets(text)
    assert "[MASKED]" in masked
    for fragment in ("hunter2", "abc.def", "eyJhbGci", "FakeKeyValue", "AIzaSy"):
        assert fragment not in masked


@pytest.mark.parametrize(
    "text",
    [
        "request",
        "ai_run_failed",
        "The monkey sat on the keyboard",
        "database connection refused on port 5432",
    ],
)
def test_ordinary_log_text_is_unchanged(text: str) -> None:
    assert mask_secrets(text) == text


def _format_with_handler(message: str, *args: object, exc_info=None) -> dict:
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(SecretMaskingFilter())
    logger = logging.getLogger("tests.masking")
    logger.handlers = [handler]
    logger.propagate = False
    logger.setLevel(logging.INFO)
    logger.error(message, *args, exc_info=exc_info)
    return json.loads(stream.getvalue())


def test_filter_masks_format_arguments() -> None:
    entry = _format_with_handler("calling with %s", f"key={FAKE_KEY}")
    assert FAKE_KEY not in entry["message"]
    assert "[MASKED]" in entry["message"]


def test_formatter_masks_exception_text() -> None:
    try:
        raise ValueError(f"failed with password=hunter2 and {FAKE_KEY}")
    except ValueError:
        entry = _format_with_handler("boom", exc_info=sys.exc_info())
    assert "hunter2" not in entry["exception"]
    assert FAKE_KEY not in entry["exception"]


def test_login_logs_hold_no_password_or_token(client: TestClient, requester, caplog) -> None:
    caplog.set_level(logging.DEBUG)
    response = _login(client, requester.email, TEST_PASSWORD)
    assert response.status_code == 200
    token = response.json()["access_token"]
    client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert TEST_PASSWORD not in caplog.text
    assert token not in caplog.text


def test_analysis_logs_hold_no_request_text_or_redacted_input(
    client: TestClient, make_request, requester, caplog
) -> None:
    caplog.set_level(logging.DEBUG)
    request = make_request(requester, title="Marker title 555", description="Marker body 777 here.")
    response = client.post(f"{REQUESTS}/{request.id}/analyze", headers=auth(requester))
    assert response.status_code == 200
    assert "Marker title 555" not in caplog.text
    assert "Marker body 777" not in caplog.text


# CORS


def _preflight(client: TestClient, origin: str):
    return client.options(
        LOGIN,
        headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
    )


def test_configured_origin_is_allowed(client: TestClient) -> None:
    response = _preflight(client, "http://localhost:5173")
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


@pytest.mark.parametrize(
    "origin",
    ["https://evil.example.test", "http://localhost:5173.evil.example.test", "null"],
)
def test_other_origins_are_refused(client: TestClient, origin: str) -> None:
    response = _preflight(client, origin)
    assert "access-control-allow-origin" not in response.headers
    simple = client.get("/healthz", headers={"Origin": origin})
    assert "access-control-allow-origin" not in simple.headers


def test_browser_can_read_retry_after(client: TestClient) -> None:
    response = client.get("/healthz", headers={"Origin": "http://localhost:5173"})
    assert "retry-after" in response.headers["access-control-expose-headers"].lower()
