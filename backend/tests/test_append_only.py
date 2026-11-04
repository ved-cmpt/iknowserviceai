"""The database itself refuses changes to history (ADR-025). These bypass the application."""

from collections.abc import Iterator

import pytest
from sqlalchemy import Connection, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.db.models import RequestEvent, ServiceRequest
from app.db.session import engine
from app.scripts.reset_demo import reset_demo
from app.scripts.seed_demo import seed_demo

STATEMENTS = [
    "UPDATE audit_logs SET action = 'tampered'",
    "DELETE FROM audit_logs",
    "UPDATE request_events SET event_type = 'tampered'",
    "DELETE FROM request_events",
]


@pytest.fixture
def connection() -> Iterator[Connection]:
    """Real SQL with no ORM, rolled back at the end."""
    with engine.connect() as conn:
        outer = conn.begin()
        requester_id = conn.execute(
            text(
                "INSERT INTO users (email, password_hash, display_name, role) "
                "VALUES ('history@example.test', 'not-a-hash', 'History', 'USER') RETURNING id"
            )
        ).scalar_one()
        request_id = conn.execute(
            text(
                "INSERT INTO service_requests (requester_id, title, description) "
                "VALUES (:requester, 'A title', 'A long enough description') RETURNING id"
            ),
            {"requester": requester_id},
        ).scalar_one()
        conn.execute(
            text("INSERT INTO request_events (request_id, event_type) VALUES (:id, 'CREATED')"),
            {"id": request_id},
        )
        conn.execute(
            text(
                "INSERT INTO audit_logs (entity_type, entity_id, action) "
                "VALUES ('service_request', :id, 'request.created')"
            ),
            {"id": request_id},
        )
        yield conn
        outer.rollback()


@pytest.mark.parametrize("statement", STATEMENTS)
def test_history_cannot_be_changed_with_sql(connection: Connection, statement: str) -> None:
    with pytest.raises(DBAPIError, match="append-only"):
        connection.execute(text(statement))


def test_inserts_still_work(connection: Connection) -> None:
    count = connection.execute(text("SELECT count(*) FROM audit_logs")).scalar_one()
    assert count == 1


def test_deleting_a_request_with_history_is_refused(connection: Connection) -> None:
    with pytest.raises(DBAPIError, match="append-only"):
        connection.execute(text("DELETE FROM service_requests"))


def test_truncate_still_clears_history(connection: Connection) -> None:
    connection.execute(text("TRUNCATE audit_logs, request_events"))
    assert connection.execute(text("SELECT count(*) FROM audit_logs")).scalar_one() == 0


def test_demo_reset_still_works_with_the_triggers(db: Session) -> None:
    seed_demo(db, "test-demo-password")
    reset_demo(db, "test-demo-password")
    assert db.query(ServiceRequest).count() == 9
    assert db.query(RequestEvent).count() > 0
