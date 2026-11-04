"""A real race over real connections. The rollback-based `db` fixture cannot exercise row locks."""

import uuid
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db.models import AiRun, RequestEvent, ServiceRequest, User
from app.db.models.enums import EventType, RequestStatus, Role
from app.db.session import SessionLocal
from app.main import app
from app.services.ai.factory import get_agent_provider
from tests.ai_fakes import FakeProvider, triage_result
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


def _new_request(requester_id: uuid.UUID) -> uuid.UUID:
    with SessionLocal() as session:
        request = ServiceRequest(
            requester_id=requester_id,
            title="A contested analysis",
            description="Two people analyze this at once.",
        )
        session.add(request)
        session.commit()
        return request.id


def _race_analyze(request_id: uuid.UUID, headers: dict[str, str]) -> list[int]:
    barrier = Barrier(2)

    def analyze(client: TestClient) -> int:
        barrier.wait(timeout=5)
        return client.post(f"/api/v1/requests/{request_id}/analyze", headers=headers).status_code

    with (
        TestClient(app) as first,
        TestClient(app) as second,
        ThreadPoolExecutor(max_workers=2) as pool,
    ):
        return sorted(pool.map(analyze, [first, second]))


def test_simultaneous_analyses_have_exactly_one_winner(committed_rows: tuple) -> None:
    (requester_id, _), headers = committed_rows
    provider = FakeProvider()
    app.dependency_overrides[get_agent_provider] = lambda: provider
    try:
        for attempt in range(ATTEMPTS):
            request_id = _new_request(requester_id)
            assert _race_analyze(request_id, headers) == [200, 409]
            assert len(provider.calls) == attempt + 1
            with SessionLocal() as session:
                runs = session.scalar(
                    select(func.count()).select_from(AiRun).where(AiRun.request_id == request_id)
                )
                assert runs == 1
    finally:
        app.dependency_overrides.clear()


def test_analysis_in_progress_blocks_others_but_holds_no_lock(committed_rows: tuple) -> None:
    (requester_id, _), headers = committed_rows
    request_id = _new_request(requester_id)
    entered, release = Event(), Event()
    lock_free = []

    def build(_agent_input):
        # A different connection can lock the row while the provider call is running.
        with SessionLocal() as session:
            locked = session.scalar(
                select(ServiceRequest)
                .where(ServiceRequest.id == request_id)
                .with_for_update(nowait=True)
            )
            lock_free.append(locked.status)
            session.rollback()
        entered.set()
        assert release.wait(timeout=10)
        return triage_result()

    app.dependency_overrides[get_agent_provider] = lambda: FakeProvider(build=build)
    try:
        with (
            TestClient(app) as first,
            TestClient(app) as second,
            ThreadPoolExecutor(max_workers=1) as pool,
        ):
            url = f"/api/v1/requests/{request_id}/analyze"
            running = pool.submit(first.post, url, headers=headers)
            assert entered.wait(timeout=10)

            blocked = second.post(url, headers=headers)
            assert blocked.status_code == 409
            assert blocked.json()["error"]["code"] == "ANALYSIS_IN_PROGRESS"

            release.set()
            assert running.result(timeout=10).status_code == 200
    finally:
        release.set()
        app.dependency_overrides.clear()

    assert lock_free == [RequestStatus.ANALYZING]
