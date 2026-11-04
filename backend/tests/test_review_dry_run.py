"""A review dry run gives the same answers as a real review, and changes nothing."""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import AiSuggestion, AuditLog, KnowledgeArticle, RequestEvent, ServiceRequest
from app.db.models.enums import ReviewState
from app.scripts.seed_demo import seed_demo
from tests.ai_fakes import citing, use_provider
from tests.conftest import auth

REQUESTS = "/api/v1/requests"
SENSITIVE = "I think someone accessed my account and I need admin credentials."
SAFE_REPLY = "Please use the verified channel, and do not share your password."
UNSAFE_REPLY = "Please send us your password."


@pytest.fixture
def held(client: TestClient, db: Session, make_request, requester):
    seed_demo(db, "test-demo-password")
    wifi = db.scalar(
        select(KnowledgeArticle.id).where(KnowledgeArticle.slug == "wifi-connected-no-internet")
    )
    request = make_request(requester, title="Account trouble", description=SENSITIVE)
    use_provider(citing(wifi, recommended_reply="A draft reply."))
    client.post(f"{REQUESTS}/{request.id}/analyze", headers=auth(requester))
    return request


def _suggestion(db: Session, request) -> AiSuggestion:
    return db.scalar(select(AiSuggestion).where(AiSuggestion.request_id == request.id))


def _dry_run(client: TestClient, request, user, suggestion_id, **overrides):
    body = {
        "decision": "APPROVED",
        "published_reply": SAFE_REPLY,
        "review_reason": "Checking this reply",
        "expected_suggestion_id": str(suggestion_id),
        "dry_run": True,
        **overrides,
    }
    return client.post(f"{REQUESTS}/{request.id}/review", json=body, headers=auth(user))


def _counts(db: Session) -> tuple[int, int]:
    return (
        db.scalar(select(func.count()).select_from(RequestEvent)),
        db.scalar(select(func.count()).select_from(AuditLog)),
    )


def test_a_passing_dry_run_saves_and_audits_nothing(
    client: TestClient, db: Session, held, agent
) -> None:
    suggestion = _suggestion(db, held)
    version = held.version
    before = _counts(db)

    response = _dry_run(client, held, agent, suggestion.id)

    assert response.status_code == 200
    assert response.json() == {"valid": True}
    assert _counts(db) == before
    db.expire_all()
    stored = _suggestion(db, held)
    assert stored.review_state == ReviewState.PENDING_REVIEW
    assert stored.published_reply is None
    assert stored.reviewed_by is None
    request = db.get(ServiceRequest, held.id)
    assert request.status == "NEEDS_HUMAN_REVIEW"
    assert request.version == version


def test_a_dry_run_refuses_an_unsafe_reply_without_recording_it(
    client: TestClient, db: Session, held, agent
) -> None:
    before = _counts(db)
    response = _dry_run(client, held, agent, _suggestion(db, held).id, published_reply=UNSAFE_REPLY)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "UNSAFE_REPLY"
    assert _counts(db) == before


def test_the_real_review_still_validates_on_the_server(
    client: TestClient, db: Session, held, agent
) -> None:
    suggestion = _suggestion(db, held)
    assert _dry_run(client, held, agent, suggestion.id).status_code == 200
    real = _dry_run(client, held, agent, suggestion.id, published_reply=UNSAFE_REPLY, dry_run=False)
    assert real.status_code == 422
    assert real.json()["error"]["code"] == "UNSAFE_REPLY"


def test_a_real_review_succeeds_after_a_dry_run(
    client: TestClient, db: Session, held, agent
) -> None:
    suggestion = _suggestion(db, held)
    assert _dry_run(client, held, agent, suggestion.id).status_code == 200
    real = _dry_run(client, held, agent, suggestion.id, dry_run=False)
    assert real.status_code == 200
    assert real.json()["suggestion"]["review_state"] == "APPROVED"


def test_a_dry_run_reports_the_same_conflicts_and_permissions(
    client: TestClient, db: Session, held, agent, requester, make_user
) -> None:
    suggestion = _suggestion(db, held)
    assert _dry_run(client, held, requester, suggestion.id).status_code == 403
    stale = _dry_run(client, held, agent, uuid.uuid4())
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "STALE_REVIEW"

    assert _dry_run(client, held, agent, suggestion.id, dry_run=False).status_code == 200
    again = _dry_run(client, held, agent, suggestion.id)
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "ALREADY_REVIEWED"


def test_dry_run_must_be_a_boolean(client: TestClient, db: Session, held, agent) -> None:
    response = _dry_run(client, held, agent, _suggestion(db, held).id, dry_run="yes")
    assert response.status_code == 422
