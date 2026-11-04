"""What the app's own database role can and cannot do, proved by connecting as it (ADR-047)."""

import contextlib
import os
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, make_url
from sqlalchemy.exc import ProgrammingError

from app.db.session import engine as owner_engine
from tests.conftest import truncate_all_tables

APP_URL = os.environ.get("TEST_APP_DATABASE_URL", "")


@pytest.fixture(scope="module")
def app_engine():
    assert APP_URL, "TEST_APP_DATABASE_URL must be set, so this role is actually tested"
    assert "test" in make_url(APP_URL).database
    engine = create_engine(APP_URL, isolation_level="AUTOCOMMIT")
    yield engine
    engine.dispose()


@pytest.fixture
def app_connection(app_engine) -> Connection:
    with app_engine.connect() as connection:
        yield connection


@pytest.fixture
def seeded_history() -> dict[str, uuid.UUID]:
    """Committed rows, written as the owner, for the app role to try to change."""
    ids = {
        "user": uuid.uuid4(),
        "request": uuid.uuid4(),
        "event": uuid.uuid4(),
        "audit": uuid.uuid4(),
    }
    with owner_engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (id, email, password_hash, display_name, role)"
                " VALUES (:id, :email, 'x', 'Role Test', 'USER')"
            ),
            {"id": ids["user"], "email": f"{ids['user']}@example.test"},
        )
        connection.execute(
            text(
                "INSERT INTO service_requests (id, requester_id, title, description)"
                " VALUES (:id, :user, 'Role test', 'A role test request.')"
            ),
            {"id": ids["request"], "user": ids["user"]},
        )
        connection.execute(
            text(
                "INSERT INTO request_events (id, request_id, event_type)"
                " VALUES (:id, :request, 'REQUEST_CREATED')"
            ),
            {"id": ids["event"], "request": ids["request"]},
        )
        connection.execute(
            text(
                "INSERT INTO audit_logs (id, entity_type, action)"
                " VALUES (:id, 'auth', 'auth.login_failure')"
            ),
            {"id": ids["audit"]},
        )
    yield ids
    truncate_all_tables()


def test_the_role_is_not_privileged(app_connection: Connection) -> None:
    row = app_connection.execute(
        text(
            "SELECT current_user, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls"
            " FROM pg_roles WHERE rolname = current_user"
        )
    ).one()
    assert row[0] == "app_user"
    assert row[1:] == (False, False, False, False)


def test_the_role_owns_nothing(app_connection: Connection) -> None:
    owned = app_connection.execute(
        text("SELECT count(*) FROM pg_tables WHERE tableowner = current_user")
    ).scalar()
    assert owned == 0


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE audit_logs SET action = 'tampered'",
        "UPDATE request_events SET event_type = 'tampered'",
        "DELETE FROM audit_logs",
        "DELETE FROM request_events",
        "TRUNCATE audit_logs",
        "TRUNCATE request_events",
        "TRUNCATE service_requests CASCADE",
    ],
)
def test_history_cannot_be_changed(app_connection: Connection, seeded_history, statement) -> None:
    with pytest.raises(ProgrammingError, match="permission denied"):
        app_connection.execute(text(statement))


@pytest.mark.parametrize(
    "statement",
    [
        "CREATE TABLE sneaky (id int)",
        "DROP TABLE audit_logs",
        "ALTER TABLE users ADD COLUMN sneaky text",
        "ALTER TABLE audit_logs DISABLE TRIGGER USER",
        "DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs",
        "CREATE ROLE sneaky",
    ],
)
def test_the_role_cannot_run_ddl(app_connection: Connection, statement: str) -> None:
    with pytest.raises(ProgrammingError):
        app_connection.execute(text(statement))


def test_the_role_cannot_grant_itself_more(app_connection: Connection, seeded_history) -> None:
    # PostgreSQL may only warn about this, so what matters is that nothing changes.
    with contextlib.suppress(ProgrammingError):
        app_connection.execute(text("GRANT UPDATE ON audit_logs TO app_user"))
    with pytest.raises(ProgrammingError, match="permission denied"):
        app_connection.execute(text("UPDATE audit_logs SET action = 'tampered'"))


def test_migration_state_is_read_only(app_connection: Connection) -> None:
    assert app_connection.execute(text("SELECT count(*) FROM alembic_version")).scalar() == 1
    with pytest.raises(ProgrammingError, match="permission denied"):
        app_connection.execute(text("UPDATE alembic_version SET version_num = 'x'"))


def test_the_role_can_do_its_job(app_connection: Connection, seeded_history) -> None:
    ids = seeded_history
    event = uuid.uuid4()
    app_connection.execute(
        text(
            "INSERT INTO request_events (id, request_id, event_type)"
            " VALUES (:id, :request, 'COMMENT_ADDED')"
        ),
        {"id": event, "request": ids["request"]},
    )
    app_connection.execute(
        text("INSERT INTO audit_logs (entity_type, action) VALUES ('auth', 'auth.login_success')")
    )
    assert (
        app_connection.execute(
            text("SELECT count(*) FROM request_events WHERE id = :id"), {"id": event}
        ).scalar()
        == 1
    )
    app_connection.execute(
        text("UPDATE service_requests SET title = 'Changed' WHERE id = :id"), {"id": ids["request"]}
    )
    token = uuid.uuid4()
    app_connection.execute(
        text(
            "INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, expires_at)"
            " VALUES (:id, :user, :hash, :family, now())"
        ),
        {"id": token, "user": ids["user"], "hash": token.hex, "family": token},
    )
    app_connection.execute(text("DELETE FROM refresh_tokens WHERE id = :id"), {"id": token})
