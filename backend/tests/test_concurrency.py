"""A real race over real connections. The rollback-based `db` fixture cannot exercise row locks."""

import uuid
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db.models import RequestEvent, ServiceRequest, User
from app.db.models.enums import EventType, Role
from app.db.session import SessionLocal
from app.main import app
from tests.conftest import auth, truncate_all_tables

ATTEMPTS = 5


@pytest.fixture
def committed_rows() -> Iterator[tuple]:
    with SessionLocal() as session:
        requester = User(
            email="race-requester@example.test",
            display_name="Race Requester",
            password_hash="not-a-real-hash",
            role=Role.USER.value,
        )
        agent = User(
            email="race-agent@example.test",
            display_name="Race Agent",
            password_hash="not-a-real-hash",
            role=Role.AGENT.value,
        )
        session.add_all([requester, agent])
        session.commit()
        ids = (requester.id, agent.id)
        agent_headers = auth(agent)

    yield ids, agent_headers

    truncate_all_tables()


def _race(request_id: uuid.UUID, headers: dict[str, str]) -> list[int]:
    barrier = Barrier(2)

    def patch(client: TestClient, target: str) -> int:
        barrier.wait(timeout=5)
        return client.patch(
            f"/api/v1/requests/{request_id}",
            json={"expected_version": 1, "status": target},
            headers=headers,
        ).status_code

    with (
        TestClient(app) as first,
        TestClient(app) as second,
        ThreadPoolExecutor(max_workers=2) as pool,
    ):
        return sorted(pool.map(patch, [first, second], ["TRIAGED", "NEEDS_HUMAN_REVIEW"]))


def test_simultaneous_updates_have_exactly_one_winner(committed_rows: tuple) -> None:
    (requester_id, _), headers = committed_rows

    for _ in range(ATTEMPTS):
        with SessionLocal() as session:
            request = ServiceRequest(
                requester_id=requester_id,
                title="A contested request",
                description="Two agents act on this at once.",
            )
            session.add(request)
            session.commit()
            request_id = request.id

        assert _race(request_id, headers) == [200, 409]

        with SessionLocal() as session:
            stored = session.get(ServiceRequest, request_id)
            assert stored.version == 2
            events = session.scalar(
                select(func.count())
                .select_from(RequestEvent)
                .where(
                    RequestEvent.request_id == request_id,
                    RequestEvent.event_type == EventType.STATUS_CHANGED.value,
                )
            )
            assert events == 1
