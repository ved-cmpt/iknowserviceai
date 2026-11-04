import time
from collections.abc import Iterator
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import QueuePool

from app.core.config import Settings
from app.db.session import PROBE_CONNECT_TIMEOUT_SECONDS, engine, get_db, get_probe_db
from app.main import app
from app.services import readiness


@pytest.mark.parametrize("path", ["/healthz", "/api/v1/healthz"])
def test_healthz(client: TestClient, path: str) -> None:
    response = client.get(path)
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize("path", ["/readyz", "/api/v1/readyz"])
def test_readyz_with_database(client: TestClient, path: str) -> None:
    response = client.get(path)
    assert response.status_code == 200
    assert response.json() == {"status": "ready", "database": "ok", "migrations": "at_head"}


def test_readyz_503_when_database_unavailable(client: TestClient) -> None:
    unreachable = create_engine(
        "postgresql+psycopg://nobody:secret-value@127.0.0.1:1/none",
        connect_args={"connect_timeout": 1},
    )

    def broken_db() -> Iterator[Session]:
        with Session(unreachable) as session:
            yield session

    app.dependency_overrides[get_probe_db] = broken_db
    response = client.get("/readyz")
    assert response.status_code == 503
    body = response.json()
    assert body["error"]["code"] == "NOT_READY"
    assert body["database"] == "unavailable"
    assert "secret-value" not in response.text


def test_readyz_says_clearly_when_migrations_are_behind(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.services.readiness.head_revision", lambda: "some-newer-revision")
    response = client.get("/readyz")
    assert response.status_code == 503
    assert response.json()["database"] == "ok"
    assert response.json()["migrations"] == "behind_head"


def test_readiness_retries_once_while_the_database_wakes(monkeypatch) -> None:
    answers = iter(
        [
            (False, {"database": "unavailable", "migrations": "unknown"}),
            (True, {"database": "ok", "migrations": "at_head"}),
        ]
    )
    monkeypatch.setattr(readiness, "check_readiness", lambda db: next(answers))
    waits: list[float] = []
    session = MagicMock()
    ready, details = readiness.check_readiness_with_retry(session, sleep=waits.append)
    assert ready is True
    assert details["migrations"] == "at_head"
    assert waits == [readiness.RETRY_DELAY_SECONDS]
    session.rollback.assert_called_once()


def test_readiness_does_not_retry_a_schema_problem(monkeypatch) -> None:
    calls: list[int] = []

    def behind(db: object) -> tuple[bool, dict[str, str]]:
        calls.append(1)
        return False, {"database": "ok", "migrations": "behind_head"}

    monkeypatch.setattr(readiness, "check_readiness", behind)
    ready, _ = readiness.check_readiness_with_retry(MagicMock(), sleep=lambda _: None)
    assert ready is False
    assert len(calls) == 1


def test_readiness_answers_within_the_time_budget_when_the_database_is_down(
    client: TestClient,
) -> None:
    """The real probe settings, against an address that accepts nothing, and one that hangs."""
    unreachable = create_engine(
        "postgresql+psycopg://nobody:x@127.0.0.1:1/none",
        connect_args={"connect_timeout": PROBE_CONNECT_TIMEOUT_SECONDS},
    )

    def broken_db() -> Iterator[Session]:
        with Session(unreachable) as session:
            yield session

    app.dependency_overrides[get_probe_db] = broken_db
    started = time.monotonic()
    assert client.get("/readyz").status_code == 503
    assert time.monotonic() - started < 2 * PROBE_CONNECT_TIMEOUT_SECONDS + 2


def test_healthz_never_touches_the_database(client: TestClient) -> None:
    def fail() -> Iterator[Session]:
        raise AssertionError("/healthz must not open a database session")
        yield  # pragma: no cover

    app.dependency_overrides[get_db] = fail
    app.dependency_overrides[get_probe_db] = fail
    assert client.get("/healthz").status_code == 200


def test_the_pool_suits_a_database_that_suspends_when_idle() -> None:
    pool = engine.pool
    assert isinstance(pool, QueuePool)
    assert pool.size() == 3
    assert pool._max_overflow == 2  # noqa: SLF001 - SQLAlchemy has no public accessor
    assert pool._recycle < 300  # noqa: SLF001 - Neon suspends after about 5 idle minutes
    assert pool._pre_ping is True  # noqa: SLF001


def test_unknown_route_uses_error_envelope(client: TestClient) -> None:
    response = client.get("/does-not-exist")
    assert response.status_code == 404
    error = response.json()["error"]
    assert set(error) == {"code", "message", "request_id"}
    assert error["code"] == "NOT_FOUND"
    assert error["request_id"] == response.headers["X-Request-ID"]


def test_method_not_allowed_uses_error_envelope(client: TestClient) -> None:
    response = client.post("/healthz")
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "METHOD_NOT_ALLOWED"


def test_unhandled_exception_returns_safe_500(client: TestClient) -> None:
    def explode() -> None:
        raise RuntimeError("secret internal detail")

    app.add_api_route("/__test_explode", explode)
    try:
        response = client.get("/__test_explode")
    finally:
        app.router.routes.pop()

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
    assert "secret internal detail" not in response.text
    assert "Traceback" not in response.text
    assert response.json()["error"]["request_id"] == response.headers["X-Request-ID"]


def test_request_id_is_propagated(client: TestClient) -> None:
    response = client.get("/healthz", headers={"X-Request-ID": "caller-supplied-id"})
    assert response.headers["X-Request-ID"] == "caller-supplied-id"


def test_unsafe_request_id_is_replaced(client: TestClient) -> None:
    response = client.get("/healthz", headers={"X-Request-ID": "bad id with spaces"})
    assert response.headers["X-Request-ID"] != "bad id with spaces"


def _settings(**overrides: object) -> Settings:
    values = {"database_url": "postgresql+psycopg://x@y/z", "jwt_secret": "x" * 32}
    return Settings(_env_file=None, **{**values, **overrides})


def test_config_rejects_short_jwt_secret() -> None:
    with pytest.raises(ValueError, match="at least 32"):
        _settings(jwt_secret="short")


def test_config_errors_do_not_echo_settings() -> None:
    with pytest.raises(ValueError) as caught:
        _settings(jwt_secret="short", database_url="postgresql+psycopg://u:db-password@h/d")
    assert "db-password" not in str(caught.value)
    assert "short" not in str(caught.value).replace("shorter", "")


def test_config_rejects_placeholder_secret_in_production() -> None:
    with pytest.raises(ValueError, match="placeholder"):
        _settings(app_env="production", jwt_secret="<replace-with-a-long-random-string>")


def test_config_rejects_wildcard_cors() -> None:
    with pytest.raises(ValueError, match="explicit origins"):
        _settings(cors_allowed_origins="*")


def test_config_splits_cors_origins() -> None:
    settings = _settings(cors_allowed_origins="http://a.test, http://b.test")
    assert settings.cors_allowed_origins == ["http://a.test", "http://b.test"]
