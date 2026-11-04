from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.models import RequestComment, RequestEvent
from app.db.models.enums import EventType
from tests.conftest import auth

REQUESTS = "/api/v1/requests"


def test_requests_require_authentication(client: TestClient) -> None:
    assert client.get(REQUESTS).status_code == 401


def test_user_list_returns_only_own(
    client: TestClient, requester, other_requester, make_request
) -> None:
    mine = make_request(requester)
    make_request(other_requester)

    body = client.get(REQUESTS, headers=auth(requester)).json()
    assert [item["id"] for item in body["items"]] == [str(mine.id)]
    assert body["total"] == 1


def test_staff_list_returns_all(
    client: TestClient, requester, other_requester, agent, admin, make_request
) -> None:
    make_request(requester)
    make_request(other_requester)
    for staff in (agent, admin):
        assert client.get(REQUESTS, headers=auth(staff)).json()["total"] == 2


def test_user_cannot_read_other_users_request(
    client: TestClient, requester, other_requester, agent, make_request
) -> None:
    theirs = make_request(other_requester)
    response = client.get(f"{REQUESTS}/{theirs.id}", headers=auth(requester))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
    assert client.get(f"{REQUESTS}/{theirs.id}", headers=auth(agent)).status_code == 200


def _add_comments(db: Session, request, requester, agent) -> None:
    db.add_all(
        [
            RequestComment(request_id=request.id, author_id=requester.id, body="public text"),
            RequestComment(
                request_id=request.id,
                author_id=agent.id,
                body="confidential staff note",
                is_internal=True,
            ),
            RequestEvent(
                request_id=request.id,
                actor_id=agent.id,
                event_type=EventType.COMMENT_ADDED.value,
                details={"is_internal": True, "comment_id": "x"},
            ),
            RequestEvent(
                request_id=request.id,
                actor_id=agent.id,
                event_type=EventType.PRIORITY_CHANGED.value,
                details={"from": "LOW", "to": "HIGH", "reason": "staff-only reason"},
            ),
        ]
    )
    db.commit()


def test_internal_comments_never_reach_requester(
    client: TestClient, db: Session, requester, agent, make_request
) -> None:
    request = make_request(requester)
    _add_comments(db, request, requester, agent)

    response = client.get(f"{REQUESTS}/{request.id}", headers=auth(requester))
    assert response.status_code == 200
    body = response.json()
    assert [comment["body"] for comment in body["comments"]] == ["public text"]
    assert "confidential staff note" not in response.text
    assert "is_internal" not in response.text


def test_requester_timeline_exposes_safe_fields_only(
    client: TestClient, db: Session, requester, agent, make_request
) -> None:
    request = make_request(requester)
    _add_comments(db, request, requester, agent)

    response = client.get(f"{REQUESTS}/{request.id}", headers=auth(requester))
    events = response.json()["events"]
    assert [event["event_type"] for event in events] == ["PRIORITY_CHANGED"]
    assert events[0]["details"] == {"from": "LOW", "to": "HIGH"}
    assert "staff-only reason" not in response.text
    assert str(agent.id) not in response.text


def test_staff_detail_includes_internal_comments(
    client: TestClient, db: Session, requester, agent, make_request
) -> None:
    request = make_request(requester)
    _add_comments(db, request, requester, agent)

    body = client.get(f"{REQUESTS}/{request.id}", headers=auth(agent)).json()
    assert {comment["body"] for comment in body["comments"]} == {
        "public text",
        "confidential staff note",
    }
    assert body["requester"]["id"] == str(requester.id)
    assert len(body["events"]) == 2


def test_password_hash_never_in_request_responses(
    client: TestClient, requester, agent, make_request
) -> None:
    request = make_request(requester, assigned_agent_id=agent.id)
    for user in (requester, agent):
        for path in (REQUESTS, f"{REQUESTS}/{request.id}"):
            response = client.get(path, headers=auth(user))
            assert response.status_code == 200
            assert "password" not in response.text
            assert "argon2" not in response.text
