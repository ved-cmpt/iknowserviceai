"""The public demo's safeguards: daily auto-reset, volume caps and banner (ADR-051).

The reset tests use real connections, because the advisory lock and role limits are the point.
"""

import os
import threading
import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.db.models import data_tables
from app.db.session import SessionLocal
from app.db.session import engine as owner_engine
from app.main import create_app
from app.routers import config as config_router
from app.scripts.seed_data import REQUESTS, USERS
from app.scripts.seed_demo import seed_demo
from app.services import demo
from tests.conftest import TEST_PASSWORD, auth, truncate_all_tables

APP_URL = os.environ.get("TEST_APP_DATABASE_URL", "")
DEMO_PASSWORD = "test-demo-password"
ADVISORY_KEY = 7262501


def _settings(**overrides: object) -> Settings:
    values = {
        "database_url": "postgresql+psycopg://x@y/z",
        "jwt_secret": "x" * 32,
        "demo_mode": True,
        "demo_password": DEMO_PASSWORD,
        **overrides,
    }
    return Settings(_env_file=None, **values)


def _set_state(*, enabled: bool, hours_ago: int | None) -> None:
    last = "NULL" if hours_ago is None else f"clock_timestamp() - interval '{hours_ago} hours'"
    with owner_engine.begin() as connection:
        connection.execute(
            text(f"UPDATE demo_state SET reset_enabled = :enabled, last_reset_at = {last}"),  # noqa: S608
            {"enabled": enabled},
        )


def _count(table: str) -> int:
    with owner_engine.connect() as connection:
        return connection.execute(text(f'SELECT count(*) FROM "{table}"')).scalar()  # noqa: S608


def _add_clutter() -> None:
    """A row in an append-only table, which the app role cannot remove by itself."""
    with owner_engine.begin() as connection:
        connection.execute(
            text("INSERT INTO audit_logs (entity_type, action) VALUES ('auth', 'clutter')")
        )


@pytest.fixture
def clean_state() -> Iterator[None]:
    truncate_all_tables()
    yield
    truncate_all_tables()
    _set_state(enabled=False, hours_ago=None)


@pytest.fixture(scope="module")
def app_engine() -> Iterator[Engine]:
    assert APP_URL, "TEST_APP_DATABASE_URL must be set, so this role is actually tested"
    engine = create_engine(APP_URL)
    yield engine
    engine.dispose()


@pytest.fixture
def app_sessions(app_engine: Engine) -> sessionmaker:
    return sessionmaker(bind=app_engine, expire_on_commit=False)


# Interval logic


@pytest.mark.usefixtures("clean_state")
def test_reset_runs_when_the_interval_has_passed(app_sessions: sessionmaker) -> None:
    _set_state(enabled=True, hours_ago=25)
    _add_clutter()
    assert demo.reset_if_due(_settings(), app_sessions) is True
    assert _count("users") == len(USERS)
    assert _count("service_requests") == len(REQUESTS)
    with owner_engine.connect() as connection:
        rows = connection.execute(
            text("SELECT count(*) FROM audit_logs WHERE action = 'clutter'")
        ).scalar()
        recent = connection.execute(
            text("SELECT last_reset_at > clock_timestamp() - interval '1 minute' FROM demo_state")
        ).scalar()
    assert rows == 0
    assert recent is True


@pytest.mark.usefixtures("clean_state")
def test_reset_waits_until_the_interval_has_passed(app_sessions: sessionmaker) -> None:
    _set_state(enabled=True, hours_ago=23)
    _add_clutter()
    assert demo.reset_if_due(_settings(), app_sessions) is False
    assert _count("audit_logs") == 1


@pytest.mark.usefixtures("clean_state")
def test_the_interval_is_configurable(app_sessions: sessionmaker) -> None:
    _set_state(enabled=True, hours_ago=3)
    assert demo.reset_if_due(_settings(demo_reset_interval_hours=4), app_sessions) is False
    assert demo.reset_if_due(_settings(demo_reset_interval_hours=2), app_sessions) is True


@pytest.mark.usefixtures("clean_state")
def test_the_database_keeps_a_one_hour_floor(app_engine: Engine) -> None:
    """A compromised app role cannot wipe the demo over and over by asking for a zero interval."""
    _set_state(enabled=True, hours_ago=0)
    _add_clutter()
    with app_engine.begin() as connection:
        assert connection.execute(text("SELECT demo_reset_begin(0)")).scalar() is False
    assert _count("audit_logs") == 1


# Single runner


@pytest.mark.usefixtures("clean_state")
def test_an_advisory_lock_holder_keeps_others_out(app_sessions: sessionmaker) -> None:
    _set_state(enabled=True, hours_ago=25)
    _add_clutter()
    with owner_engine.connect() as holder:
        transaction = holder.begin()
        holder.execute(text(f"SELECT pg_advisory_xact_lock({ADVISORY_KEY})"))
        assert demo.reset_if_due(_settings(), app_sessions) is False
        transaction.rollback()
    assert _count("audit_logs") == 1


@pytest.mark.usefixtures("clean_state")
def test_only_one_of_several_concurrent_callers_resets(app_sessions: sessionmaker) -> None:
    _set_state(enabled=True, hours_ago=25)
    barrier = threading.Barrier(4)
    results: list[bool] = []

    def attempt() -> None:
        barrier.wait()
        results.append(demo.reset_if_due(_settings(), app_sessions))

    threads = [threading.Thread(target=attempt) for _ in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert results.count(True) == 1
    assert _count("users") == len(USERS)


@pytest.mark.usefixtures("clean_state")
def test_a_failed_reseed_rolls_the_whole_reset_back(
    app_sessions: sessionmaker, monkeypatch: pytest.MonkeyPatch
) -> None:
    _set_state(enabled=True, hours_ago=25)
    _add_clutter()

    def broken_seed(db: Session, password: str) -> None:
        raise RuntimeError("seed failed")

    monkeypatch.setattr(demo, "seed_demo", broken_seed)
    with pytest.raises(RuntimeError):
        demo.reset_if_due(_settings(), app_sessions)
    assert _count("audit_logs") == 1
    with owner_engine.connect() as connection:
        still_due = connection.execute(
            text("SELECT last_reset_at < clock_timestamp() - interval '24 hours' FROM demo_state")
        ).scalar()
    assert still_due is True


# Disabled unless explicitly enabled


@pytest.mark.usefixtures("clean_state")
def test_outside_demo_mode_nothing_happens(app_sessions: sessionmaker) -> None:
    _set_state(enabled=True, hours_ago=25)
    _add_clutter()
    assert demo.reset_if_due(_settings(demo_mode=False), app_sessions) is False
    assert _count("audit_logs") == 1


@pytest.mark.usefixtures("clean_state")
def test_a_database_that_has_not_enabled_it_refuses(
    app_sessions: sessionmaker, app_engine: Engine
) -> None:
    """DEMO_MODE alone is not enough, so a wrong setting cannot wipe a real database."""
    _set_state(enabled=False, hours_ago=25)
    _add_clutter()
    assert demo.reset_if_due(_settings(), app_sessions) is False
    with app_engine.begin() as connection:
        assert connection.execute(text("SELECT demo_reset_begin(1)")).scalar() is False
    assert _count("audit_logs") == 1


def test_without_a_password_there_is_no_reset() -> None:
    assert demo.reset_if_due(_settings(demo_password=None)) is False


# The app role's limits


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE demo_state SET reset_enabled = true",
        "UPDATE demo_state SET last_reset_at = NULL",
        "DELETE FROM demo_state",
        "INSERT INTO demo_state (id) VALUES (2)",
        "TRUNCATE demo_state",
    ],
)
def test_the_app_role_cannot_change_the_switch(app_engine: Engine, statement: str) -> None:
    with app_engine.connect() as connection, pytest.raises(ProgrammingError, match="denied"):
        connection.execute(text(statement))


def test_the_reset_function_is_granted_narrowly(app_engine: Engine) -> None:
    with app_engine.connect() as connection:
        row = connection.execute(
            text(
                "SELECT prosecdef, proconfig, has_function_privilege(oid, 'EXECUTE')"
                " FROM pg_proc WHERE proname = 'demo_reset_begin'"
            )
        ).one()
        public_can = connection.execute(
            text(
                "SELECT bool_or(acl.grantee = 0) FROM pg_proc p,"
                " aclexplode(p.proacl) acl WHERE p.proname = 'demo_reset_begin'"
            )
        ).scalar()
    assert row[0] is True, "must be SECURITY DEFINER"
    assert row[2] is True, "app_user must be able to call it"
    assert any(setting.startswith("search_path=") for setting in row[1])
    assert public_can is False


def test_the_function_empties_every_data_table() -> None:
    """A new table must be added to the function, or a reset would leave its rows behind."""
    with owner_engine.connect() as connection:
        source = connection.execute(
            text("SELECT prosrc FROM pg_proc WHERE proname = 'demo_reset_begin'")
        ).scalar()
    for table in data_tables():
        assert table.name in source


# Triggering from traffic


@pytest.mark.usefixtures("clean_state")
def test_api_traffic_starts_the_reset_but_health_checks_do_not() -> None:
    _set_state(enabled=True, hours_ago=25)
    _add_clutter()
    application = create_app(_settings())
    with TestClient(application) as client:
        assert client.get("/healthz").status_code == 200
        assert client.get("/api/v1/healthz").status_code == 200
        assert _count("audit_logs") == 1
        assert client.get("/api/v1/config").status_code == 200
    assert _count("users") == len(USERS)
    assert _count("audit_logs") == 0


@pytest.mark.usefixtures("clean_state")
def test_api_traffic_never_resets_outside_demo_mode() -> None:
    _set_state(enabled=True, hours_ago=25)
    _add_clutter()
    application = create_app(_settings(demo_mode=False))
    with TestClient(application) as client:
        assert client.get("/api/v1/config").status_code == 200
    assert _count("audit_logs") == 1


def test_a_failed_reset_does_not_fail_the_request(monkeypatch: pytest.MonkeyPatch) -> None:
    def explode(settings: Settings) -> bool:
        raise RuntimeError("database gone")

    monkeypatch.setattr("app.core.middleware.reset_if_due", explode)
    application = create_app(_settings())
    with TestClient(application) as client:
        assert client.get("/api/v1/config").status_code == 200


def test_the_database_check_runs_at_most_once_a_minute() -> None:
    now = [100.0]
    schedule = demo.DemoResetSchedule(clock=lambda: now[0])
    assert schedule.claim() is True
    assert schedule.claim() is False
    now[0] += demo.RECHECK_SECONDS - 1
    assert schedule.claim() is False
    now[0] += 1
    assert schedule.claim() is True


@pytest.mark.usefixtures("clean_state")
def test_the_command_line_reset_counts_as_a_reset(app_sessions: sessionmaker) -> None:
    from app.scripts.reset_demo import reset_demo

    _set_state(enabled=True, hours_ago=25)
    with SessionLocal() as db:
        reset_demo(db, DEMO_PASSWORD)
    assert demo.reset_if_due(_settings(), app_sessions) is False


# Caps


def _create(client: TestClient, user) -> object:
    return client.post(
        "/api/v1/requests",
        headers=auth(user),
        json={"title": "My printer is offline", "description": "It says offline since morning."},
    )


@pytest.fixture
def capped(monkeypatch: pytest.MonkeyPatch):
    def apply(**overrides: object) -> None:
        settings = _settings(**overrides)
        monkeypatch.setattr(demo, "get_settings", lambda: settings)

    return apply


def test_no_caps_outside_demo_mode(client: TestClient, requester, capped) -> None:
    capped(demo_mode=False, demo_max_requests_per_account_per_day=1)
    assert _create(client, requester).status_code == 201
    assert _create(client, requester).status_code == 201


def test_the_per_account_cap_is_friendly(
    client: TestClient, requester, other_requester, capped
) -> None:
    capped(demo_max_requests_per_account_per_day=2)
    assert _create(client, requester).status_code == 201
    assert _create(client, requester).status_code == 201
    refused = _create(client, requester)
    assert refused.status_code == 429
    assert refused.json()["error"]["code"] == "DEMO_LIMIT_REACHED"
    assert "resets daily" in refused.json()["error"]["message"]
    assert _create(client, other_requester).status_code == 201


def test_the_total_cap_is_friendly(client: TestClient, requester, other_requester, capped) -> None:
    capped(demo_max_requests_total=1)
    assert _create(client, requester).status_code == 201
    refused = _create(client, other_requester)
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "DEMO_CAPACITY_REACHED"
    assert "The public demo is busy; data resets daily" in refused.json()["error"]["message"]


def test_seeded_rows_do_not_count_towards_the_caps(
    client: TestClient, db: Session, capped, admin
) -> None:
    seed_demo(db, DEMO_PASSWORD)
    capped(demo_max_requests_total=1, demo_max_requests_per_account_per_day=1, demo_max_articles=1)
    riley = db.execute(text("SELECT id FROM users WHERE email LIKE 'riley%'")).scalar()
    from app.core.security import create_access_token

    response = client.post(
        "/api/v1/requests",
        headers={"Authorization": f"Bearer {create_access_token(riley)}"},
        json={"title": "My printer is offline", "description": "It says offline since morning."},
    )
    assert response.status_code == 201
    assert _create_article(client, admin).status_code == 201


def _create_article(client: TestClient, admin) -> object:
    return client.post(
        "/api/v1/admin/knowledge",
        headers=auth(admin),
        json={
            "slug": f"article-{uuid.uuid4().hex[:8]}",
            "title": "A new article",
            "body_markdown": "Some body text for the article.",
            "category": "OTHER",
            "tags": [],
        },
    )


def test_the_article_cap_is_friendly(client: TestClient, admin, capped) -> None:
    capped(demo_max_articles=1)
    assert _create_article(client, admin).status_code == 201
    refused = _create_article(client, admin)
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "DEMO_CAPACITY_REACHED"


# Banner


def test_the_banner_shows_on_a_public_demo_in_mock_mode(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(config_router, "get_settings", lambda: _settings())
    body = client.get("/api/v1/config").json()
    assert body["demo_banner"] == config_router.DEMO_BANNER
    assert "Don't enter personal information" in body["demo_banner"]
    assert body["ai_notice"] == config_router.MOCK_AI_NOTICE


def test_the_mock_notice_is_absent_in_live_mode(client: TestClient, monkeypatch) -> None:
    settings = _settings(ai_mode="gemini", gemini_api_key="k", gemini_model="m")
    monkeypatch.setattr(config_router, "get_settings", lambda: settings)
    body = client.get("/api/v1/config").json()
    assert body["demo_banner"]
    assert body["ai_notice"] is None


def test_no_banner_outside_a_public_demo(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(config_router, "get_settings", lambda: _settings(demo_mode=False))
    body = client.get("/api/v1/config").json()
    assert body["demo_banner"] is None
    assert body["ai_notice"] is None


def test_seed_passwords_still_work_after_a_reset(
    app_sessions: sessionmaker, clean_state: None
) -> None:
    from app.core.security import verify_password

    _set_state(enabled=True, hours_ago=25)
    assert demo.reset_if_due(_settings(), app_sessions) is True
    with owner_engine.connect() as connection:
        stored = connection.execute(
            text("SELECT password_hash FROM users WHERE email LIKE 'riley%'")
        ).scalar()
    assert verify_password(stored, DEMO_PASSWORD)
    assert not verify_password(stored, TEST_PASSWORD)
