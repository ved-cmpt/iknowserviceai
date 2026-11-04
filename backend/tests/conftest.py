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

from collections.abc import Callable, Iterator  # noqa: E402
from itertools import count  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.security import create_access_token, hash_password  # noqa: E402
from app.db.models import Base, ServiceRequest, User  # noqa: E402
from app.db.models.enums import Role  # noqa: E402
from app.db.session import engine, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.services.readiness import alembic_config  # noqa: E402

TEST_PASSWORD = "correct-horse-battery-staple"
# Hashing is deliberately slow, so the factories share one hash.
_TEST_PASSWORD_HASH = hash_password(TEST_PASSWORD)
_sequence = count(1)


def migration_config():
    config = alembic_config()
    config.attributes["configure_logging"] = False
    return config


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> None:
    """Migrate once per session, from a clean schema."""
    command.downgrade(migration_config(), "base")
    command.upgrade(migration_config(), "head")


def truncate_all_tables() -> None:
    """Remove committed rows from the test database, for tests that use real connections.

    TRUNCATE is the only way to clear append-only history, because row triggers refuse DELETE.
    """
    tables = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
    with engine.begin() as connection:
        connection.execute(text(f"TRUNCATE {tables} CASCADE"))


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


@pytest.fixture
def make_user(db: Session) -> Callable[..., User]:
    def factory(role: Role = Role.USER, **overrides: object) -> User:
        number = next(_sequence)
        values = {
            "email": f"user{number}@example.test",
            "display_name": f"Test User {number}",
            "password_hash": _TEST_PASSWORD_HASH,
            "role": role.value,
            **overrides,
        }
        user = User(**values)
        db.add(user)
        db.commit()
        return user

    return factory


@pytest.fixture
def requester(make_user: Callable[..., User]) -> User:
    return make_user(Role.USER)


@pytest.fixture
def other_requester(make_user: Callable[..., User]) -> User:
    return make_user(Role.USER)


@pytest.fixture
def agent(make_user: Callable[..., User]) -> User:
    return make_user(Role.AGENT)


@pytest.fixture
def admin(make_user: Callable[..., User]) -> User:
    return make_user(Role.ADMIN)


@pytest.fixture
def make_request(db: Session) -> Callable[..., ServiceRequest]:
    def factory(requester: User, **overrides: object) -> ServiceRequest:
        values = {
            "requester_id": requester.id,
            "title": "A test request",
            "description": "A description long enough to be valid.",
            **overrides,
        }
        request = ServiceRequest(**values)
        db.add(request)
        db.commit()
        return request

    return factory


def auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}
