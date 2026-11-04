"""Staff review, requester feedback and the visibility rules around them."""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AiSuggestion, AuditLog, KnowledgeArticle, RequestEvent
from app.db.models.enums import ReviewState, Role
from app.scripts.seed_demo import seed_demo
from tests.ai_fakes import citing, use_provider
from tests.conftest import auth

REQUESTS = "/api/v1/requests"
SENSITIVE = "I think someone accessed my account and I need admin credentials."
DRAFT_MARKER = "Draft reply marker text"
SAFE_REPLY = (
    "Please contact support through your organization's verified channel; "
    "do not share your password."
)


@pytest.fixture
def seeded(db: Session) -> None:
    seed_demo(db, "test-demo-password")


@pytest.fixture
def wifi_id(db: Session, seeded) -> uuid.UUID:
    return db.scalar(
        select(KnowledgeArticle.id).where(KnowledgeArticle.slug == "wifi-connected-no-internet")
    )


@pytest.fixture
def held(client: TestClient, make_request, requester, wifi_id):
    """A sensitive request that has been analyzed and is waiting for review."""
    request = make_request(requester, title="Account trouble", description=SENSITIVE)
    use_provider(citing(wifi_id, recommended_reply=DRAFT_MARKER))
    assert (
        client.post(f"{REQUESTS}/{request.id}/analyze", headers=auth(requester)).json()["status"]
        == "NEEDS_HUMAN_REVIEW"
    )
    return request


def _suggestion(db: Session, request) -> AiSuggestion:
    return db.scalar(select(AiSuggestion).where(AiSuggestion.request_id == request.id))


def _review(client: TestClient, request, user, suggestion_id, **overrides):
    body = {
        "decision": "APPROVED",
        "published_reply": SAFE_REPLY,
        "review_reason": "Safe escalation language approved",
        "expected_suggestion_id": str(suggestion_id),
        **overrides,
    }
    if body["decision"] == "REJECTED" and "published_reply" not in overrides:
        del body["published_reply"]
    return client.post(f"{REQUESTS}/{request.id}/review", json=body, headers=auth(user))


# Approve and reject


def test_approval_publishes_only_the_edited_reply(
    client: TestClient, db: Session, held, requester, agent
) -> None:
    suggestion = _suggestion(db, held)
    response = _review(client, held, agent, suggestion.id)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "TRIAGED"
    assert body["suggestion"]["review_state"] == "APPROVED"
    assert body["suggestion"]["proposed_reply"] == DRAFT_MARKER
    assert body["suggestion"]["published_reply"] == SAFE_REPLY
    assert body["suggestion"]["reviewed_by"] == str(agent.id)
    assert body["suggestion"]["reviewed_at"]
    assert body["suggestion"]["review_reason"] == "Safe escalation language approved"

    visible = client.get(f"{REQUESTS}/{held.id}", headers=auth(requester))
    assert visible.json()["suggestion_state"] == "AVAILABLE"
    assert visible.json()["suggestion"]["reply"] == SAFE_REPLY
    assert visible.json()["suggestion"]["label"] == "AI-generated suggestion; verify before acting"
    assert DRAFT_MARKER not in visible.text


def test_approval_can_move_to_in_progress(client: TestClient, db: Session, held, admin) -> None:
    response = _review(client, held, admin, _suggestion(db, held).id, next_status="IN_PROGRESS")
    assert response.status_code == 200
    assert response.json()["status"] == "IN_PROGRESS"


def test_rejection_shows_the_requester_nothing(
    client: TestClient, db: Session, held, requester, agent
) -> None:
    response = _review(client, held, agent, _suggestion(db, held).id, decision="REJECTED")
    assert response.status_code == 200
    assert response.json()["suggestion"]["review_state"] == "REJECTED"
    assert response.json()["suggestion"]["published_reply"] is None

    visible = client.get(f"{REQUESTS}/{held.id}", headers=auth(requester))
    assert visible.json()["status"] == "TRIAGED"
    assert visible.json()["suggestion_state"] is None
    assert visible.json()["suggestion"] is None
    assert DRAFT_MARKER not in visible.text


def test_review_is_recorded_without_reply_bodies(
    client: TestClient, db: Session, held, agent
) -> None:
    _review(client, held, agent, _suggestion(db, held).id)
    audit = db.scalar(select(AuditLog).where(AuditLog.action == "request.review_approved"))
    assert audit.actor_id == agent.id
    assert audit.safe_metadata["reason"] == "Safe escalation language approved"
    assert audit.safe_metadata["decision"] == "APPROVED"
    assert audit.safe_metadata["edited"] is True
    assert SAFE_REPLY not in str(audit.safe_metadata)
    assert DRAFT_MARKER not in str(audit.safe_metadata)

    event = db.scalar(select(RequestEvent).where(RequestEvent.event_type == "SUGGESTION_REVIEWED"))
    assert event.actor_id == agent.id
    assert SAFE_REPLY not in str(event.details)


def test_approving_the_unchanged_draft_is_recorded_as_not_edited(
    client: TestClient, db: Session, held, agent
) -> None:
    _review(client, held, agent, _suggestion(db, held).id, published_reply=DRAFT_MARKER)
    event = db.scalar(select(RequestEvent).where(RequestEvent.event_type == "SUGGESTION_REVIEWED"))
    assert event.details["edited"] is False


def test_requester_timeline_hides_the_review(
    client: TestClient, db: Session, held, requester, agent
) -> None:
    _review(client, held, agent, _suggestion(db, held).id)
    events = client.get(f"{REQUESTS}/{held.id}", headers=auth(requester)).json()["events"]
    assert "SUGGESTION_REVIEWED" not in [event["event_type"] for event in events]
    assert "Safe escalation" not in str(events)


# Who may review


def test_requester_gets_403(client: TestClient, db: Session, held, requester) -> None:
    assert _review(client, held, requester, _suggestion(db, held).id).status_code == 403


def test_another_requester_gets_403(client: TestClient, db: Session, held, other_requester) -> None:
    assert _review(client, held, other_requester, _suggestion(db, held).id).status_code == 403


def test_anonymous_gets_401(client: TestClient, db: Session, held) -> None:
    response = client.post(f"{REQUESTS}/{held.id}/review", json={})
    assert response.status_code == 401


@pytest.mark.parametrize("role", [Role.AGENT, Role.ADMIN])
def test_staff_cannot_review_their_own_request(
    client: TestClient, db: Session, seeded, make_request, make_user, wifi_id, role: Role
) -> None:
    staff = make_user(role)
    request = make_request(staff, title="Account trouble", description=SENSITIVE)
    use_provider(citing(wifi_id))
    client.post(f"{REQUESTS}/{request.id}/analyze", headers=auth(staff))
    response = _review(client, request, staff, _suggestion(db, request).id)
    assert response.status_code == 403
    assert _suggestion(db, request).review_state == ReviewState.PENDING_REVIEW


def test_unknown_request_gets_404(client: TestClient, agent) -> None:
    response = client.post(
        f"{REQUESTS}/{uuid.uuid4()}/review",
        json={
            "decision": "REJECTED",
            "review_reason": "Not appropriate",
            "expected_suggestion_id": str(uuid.uuid4()),
        },
        headers=auth(agent),
    )
    assert response.status_code == 404


# Conflicts


def test_duplicate_review_gets_409(client: TestClient, db: Session, held, agent, admin) -> None:
    suggestion_id = _suggestion(db, held).id
    assert _review(client, held, agent, suggestion_id).status_code == 200
    second = _review(client, held, admin, suggestion_id, published_reply="A different reply here.")
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "ALREADY_REVIEWED"
    db.refresh(_suggestion(db, held))
    assert _suggestion(db, held).published_reply == SAFE_REPLY
    assert _suggestion(db, held).reviewed_by == agent.id


def test_stale_suggestion_id_gets_409(client: TestClient, db: Session, held, agent) -> None:
    response = _review(client, held, agent, uuid.uuid4())
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "STALE_REVIEW"
    assert _suggestion(db, held).review_state == ReviewState.PENDING_REVIEW


def test_request_without_a_suggestion_gets_409(
    client: TestClient, make_request, requester, agent
) -> None:
    request = make_request(requester, status="NEEDS_HUMAN_REVIEW")
    response = _review(client, request, agent, uuid.uuid4())
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "NO_PENDING_SUGGESTION"


def test_review_after_staff_moved_the_request_gets_409(
    client: TestClient, db: Session, held, agent, requester
) -> None:
    db.refresh(held)
    moved = client.patch(
        f"{REQUESTS}/{held.id}",
        json={"expected_version": held.version, "status": "IN_PROGRESS"},
        headers=auth(agent),
    )
    assert moved.status_code == 200
    response = _review(client, held, agent, _suggestion(db, held).id)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INVALID_STATE"
    # Moving a request around review does not reveal the draft.
    visible = client.get(f"{REQUESTS}/{held.id}", headers=auth(requester))
    assert DRAFT_MARKER not in visible.text


# Validation


@pytest.mark.parametrize(
    "overrides",
    [
        {"published_reply": None},
        {"published_reply": ""},
        {"published_reply": "   "},
        {"published_reply": "x" * 1201},
        {"review_reason": "ab"},
        {"review_reason": "x" * 301},
        {"decision": "EDITED"},
        {"next_status": "CLOSED"},
        {"next_status": "NEW"},
        {"unknown_field": "x"},
        {"decision": "REJECTED", "published_reply": "Not allowed when rejecting"},
    ],
)
def test_invalid_review_bodies_get_422(
    client: TestClient, db: Session, held, agent, overrides: dict
) -> None:
    response = _review(client, held, agent, _suggestion(db, held).id, **overrides)
    assert response.status_code == 422
    assert _suggestion(db, held).review_state == ReviewState.PENDING_REVIEW


@pytest.mark.parametrize(
    "reply",
    [
        "Please send us your password so we can fix this.",
        "Reply with the recovery code you received.",
        "Enter your verification code here.",
    ],
)
def test_published_reply_asking_for_credentials_gets_422(
    client: TestClient, db: Session, held, agent, reply: str
) -> None:
    response = _review(client, held, agent, _suggestion(db, held).id, published_reply=reply)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "UNSAFE_REPLY"
    suggestion = _suggestion(db, held)
    assert suggestion.review_state == ReviewState.PENDING_REVIEW
    assert suggestion.published_reply is None


# Escalating a visible suggestion


def test_escalating_withholds_a_visible_suggestion_until_reviewed(
    client: TestClient, db: Session, seeded, make_request, requester, agent, wifi_id
) -> None:
    marker = "Originally visible reply"
    request = make_request(requester, title="Wi-Fi down", description="The Wi-Fi fails all day.")
    use_provider(citing(wifi_id, recommended_reply=marker))
    body = client.post(f"{REQUESTS}/{request.id}/analyze", headers=auth(requester)).json()
    assert body["suggestion"]["reply"] == marker

    db.refresh(request)
    response = client.patch(
        f"{REQUESTS}/{request.id}",
        json={"expected_version": request.version, "status": "NEEDS_HUMAN_REVIEW"},
        headers=auth(agent),
    )
    assert response.status_code == 200
    visible = client.get(f"{REQUESTS}/{request.id}", headers=auth(requester))
    assert visible.json()["suggestion_state"] == "AWAITING_STAFF_REVIEW"
    assert marker not in visible.text

    assert _review(client, request, agent, _suggestion(db, request).id).status_code == 200
    assert (
        client.get(f"{REQUESTS}/{request.id}", headers=auth(requester)).json()["suggestion"][
            "reply"
        ]
        == SAFE_REPLY
    )


def test_escalating_keeps_an_approved_reply_visible(
    client: TestClient, db: Session, held, agent, requester
) -> None:
    _review(client, held, agent, _suggestion(db, held).id)
    db.refresh(held)
    client.patch(
        f"{REQUESTS}/{held.id}",
        json={"expected_version": held.version, "status": "NEEDS_HUMAN_REVIEW"},
        headers=auth(agent),
    )
    visible = client.get(f"{REQUESTS}/{held.id}", headers=auth(requester)).json()
    assert visible["suggestion"]["reply"] == SAFE_REPLY


# Feedback


@pytest.fixture
def visible(client: TestClient, make_request, requester, wifi_id):
    request = make_request(requester, title="Wi-Fi down", description="The Wi-Fi fails all day.")
    use_provider(citing(wifi_id))
    assert (
        client.post(f"{REQUESTS}/{request.id}/analyze", headers=auth(requester)).json()["status"]
        == "TRIAGED"
    )
    return request


def _feedback(client: TestClient, request, user, **overrides):
    return client.post(
        f"{REQUESTS}/{request.id}/feedback",
        json={"helpful": True, **overrides},
        headers=auth(user),
    )


def test_owner_can_rate_a_visible_suggestion(
    client: TestClient, db: Session, visible, requester, agent
) -> None:
    response = _feedback(client, visible, requester, helpful=False, comment="  Did not help  ")
    assert response.status_code == 201
    body = response.json()
    assert body["helpful"] is False
    assert body["comment"] == "Did not help"
    assert body["suggestion_id"] == str(_suggestion(db, visible).id)

    detail = client.get(f"{REQUESTS}/{visible.id}", headers=auth(requester)).json()
    assert detail["suggestion"]["feedback_submitted"] is True
    staff = client.get(f"{REQUESTS}/{visible.id}", headers=auth(agent)).json()
    assert staff["suggestion"]["feedback"][0]["comment"] == "Did not help"


def test_duplicate_feedback_gets_409(client: TestClient, visible, requester) -> None:
    assert _feedback(client, visible, requester).status_code == 201
    second = _feedback(client, visible, requester, helpful=False)
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "FEEDBACK_EXISTS"


def test_audit_holds_the_rating_but_not_the_comment(
    client: TestClient, db: Session, visible, requester
) -> None:
    _feedback(client, visible, requester, comment="comment-marker-text")
    audit = db.scalar(select(AuditLog).where(AuditLog.action == "request.feedback_added"))
    assert audit.safe_metadata["helpful"] is True
    assert "comment-marker-text" not in str(audit.safe_metadata)


def test_feedback_on_a_held_suggestion_gets_409(client: TestClient, held, requester) -> None:
    response = _feedback(client, held, requester)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "NO_VISIBLE_SUGGESTION"


def test_feedback_on_a_rejected_suggestion_gets_409(
    client: TestClient, db: Session, held, requester, agent
) -> None:
    _review(client, held, agent, _suggestion(db, held).id, decision="REJECTED")
    assert _feedback(client, held, requester).status_code == 409


def test_feedback_on_an_approved_suggestion_works(
    client: TestClient, db: Session, held, requester, agent
) -> None:
    _review(client, held, agent, _suggestion(db, held).id)
    assert _feedback(client, held, requester).status_code == 201


def test_feedback_with_no_suggestion_gets_409(client: TestClient, make_request, requester) -> None:
    assert _feedback(client, make_request(requester), requester).status_code == 409


def test_other_requester_gets_404(client: TestClient, visible, other_requester) -> None:
    assert _feedback(client, visible, other_requester).status_code == 404


def test_staff_who_are_not_the_owner_get_403(client: TestClient, visible, agent) -> None:
    assert _feedback(client, visible, agent).status_code == 403


def test_anonymous_feedback_gets_401(client: TestClient, visible) -> None:
    assert client.post(f"{REQUESTS}/{visible.id}/feedback", json={}).status_code == 401


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"helpful": "yes"},
        {"helpful": 1},
        {"helpful": True, "comment": "x" * 501},
        {"helpful": True, "extra": 1},
    ],
)
def test_invalid_feedback_gets_422(client: TestClient, visible, requester, body: dict) -> None:
    response = client.post(f"{REQUESTS}/{visible.id}/feedback", json=body, headers=auth(requester))
    assert response.status_code == 422
