"""Test fixtures. Tests run against the real PostgreSQL test database.

The environment must be changed before any `app` import, because the engine is created at import.
"""

import os

_test_url = os.environ.get("TEST_DATABASE_URL", "")
if "test" not in _test_url.rsplit("/", 1)[-1]:
    raise RuntimeError("TEST_DATABASE_URL must be set and name a database containing 'test'")
os.environ["DATABASE_URL"] = _test_url
os.environ["APP_ENV"] = "test"
os.environ["AI_MODE"] = "mock"

from collections.abc import Iterator  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.db.session import engine, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.services.readiness import alembic_config  # noqa: E402


def migration_config():
    config = alembic_config()
    config.attributes["configure_logging"] = False
    return config


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> None:
    """Migrate once per session, from a clean schema."""
    command.downgrade(migration_config(), "base")
    command.upgrade(migration_config(), "head")


@pytest.fixture
def db() -> Iterator[Session]:
    """Isolate each test in an outer transaction that is always rolled back.

    Service-layer commits release a savepoint, so application code runs unchanged.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(
        bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
    )
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    def override_get_db() -> Iterator[Session]:
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
