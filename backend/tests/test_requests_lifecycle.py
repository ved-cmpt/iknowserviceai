import itertools

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AuditLog, RequestComment, RequestEvent, ServiceRequest
from app.db.models.enums import Category, EventType, Priority, RequestStatus, Role
from app.services.state_machine import STAFF_TRANSITIONS
from tests.conftest import auth

REQUESTS = "/api/v1/requests"
VALID = {"title": "Printer problem", "description": "The printer does not print anything."}

ALLOWED = [
    (RequestStatus.NEW, RequestStatus.TRIAGED),
    (RequestStatus.NEW, RequestStatus.NEEDS_HUMAN_REVIEW),
    (RequestStatus.TRIAGED, RequestStatus.IN_PROGRESS),
    (RequestStatus.TRIAGED, RequestStatus.NEEDS_HUMAN_REVIEW),
    (RequestStatus.NEEDS_HUMAN_REVIEW, RequestStatus.TRIAGED),
    (RequestStatus.NEEDS_HUMAN_REVIEW, RequestStatus.IN_PROGRESS),
    (RequestStatus.IN_PROGRESS, RequestStatus.RESOLVED),
    (RequestStatus.IN_PROGRESS, RequestStatus.NEEDS_HUMAN_REVIEW),
    (RequestStatus.RESOLVED, RequestStatus.CLOSED),
    (RequestStatus.RESOLVED, RequestStatus.NEEDS_HUMAN_REVIEW),
]
ILLEGAL = [pair for pair in itertools.product(RequestStatus, repeat=2) if pair not in ALLOWED]


def _audit(db: Session, entity_id) -> list[AuditLog]:
    return list(
        db.scalars(
            select(AuditLog).where(AuditLog.entity_id == entity_id).order_by(AuditLog.occurred_at)
        )
    )


def _events(db: Session, request_id) -> list[RequestEvent]:
    return list(
        db.scalars(
            select(RequestEvent)
            .where(RequestEvent.request_id == request_id)
            .order_by(RequestEvent.created_at)
        )
    )


# Create


def test_create_returns_201_with_defaults(client: TestClient, db: Session, requester) -> None:
    response = client.post(REQUESTS, json=VALID, headers=auth(requester))
    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"id", "title", "status", "created_at"}
    assert body["status"] == "NEW"

    stored = db.get(ServiceRequest, body["id"])
    assert stored.category == Category.OTHER
    assert stored.priority == Priority.MEDIUM
    assert stored.requester_id == requester.id
    assert stored.version == 1


@pytest.mark.parametrize("role", list(Role))
def test_any_role_can_create(client: TestClient, make_user, role: Role) -> None:
    assert client.post(REQUESTS, json=VALID, headers=auth(make_user(role))).status_code == 201


def test_create_requires_authentication(client: TestClient) -> None:
    assert client.post(REQUESTS, json=VALID).status_code == 401


def test_create_trims_whitespace(client: TestClient, requester) -> None:
    response = client.post(
        REQUESTS,
        json={"title": "   Trimmed title  ", "description": VALID["description"]},
        headers=auth(requester),
    )
    assert response.json()["title"] == "Trimmed title"


@pytest.mark.parametrize(
    ("field", "length", "status"),
    [
        ("title", 2, 422),
        ("title", 3, 201),
        ("title", 120, 201),
        ("title", 121, 422),
        ("description", 9, 422),
        ("description", 10, 201),
        ("description", 4000, 201),
        ("description", 4001, 422),
    ],
)
def test_create_length_bounds(
    client: TestClient, requester, field: str, length: int, status: int
) -> None:
    payload = {**VALID, field: "x" * length}
    response = client.post(REQUESTS, json=payload, headers=auth(requester))
    assert response.status_code == status
    if status == 422:
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize(
    "payload",
    [
        {"title": "     ", "description": VALID["description"]},
        {"title": "Valid title", "description": "          "},
        {"title": "Nul\x00title", "description": VALID["description"]},
        {**VALID, "status": "CLOSED"},
        {**VALID, "requester_id": "00000000-0000-0000-0000-000000000000"},
    ],
)
def test_create_rejects_invalid_payloads(client: TestClient, requester, payload: dict) -> None:
    assert client.post(REQUESTS, json=payload, headers=auth(requester)).status_code == 422


def test_create_records_event_and_audit(client: TestClient, db: Session, requester) -> None:
    request_id = client.post(REQUESTS, json=VALID, headers=auth(requester)).json()["id"]
    events = _events(db, request_id)
    assert [event.event_type for event in events] == [EventType.REQUEST_CREATED]
    audit = _audit(db, request_id)
    assert [row.action for row in audit] == ["request.created"]
    assert audit[0].actor_id == requester.id


# List


def test_requester_list_has_no_staff_fields(client: TestClient, requester, make_request) -> None:
    make_request(requester)
    item = client.get(REQUESTS, headers=auth(requester)).json()["items"][0]
    assert set(item) == {
        "id",
        "title",
        "status",
        "category",
        "priority",
        "created_at",
        "updated_at",
    }


def test_staff_list_has_staff_fields(client: TestClient, requester, agent, make_request) -> None:
    make_request(requester)
    item = client.get(REQUESTS, headers=auth(agent)).json()["items"][0]
    assert {"requester_id", "assigned_agent_id", "version"} <= set(item)


def test_pagination(client: TestClient, requester, make_request) -> None:
    for _ in range(3):
        make_request(requester)
    headers = auth(requester)
    page = client.get(f"{REQUESTS}?limit=2&offset=0", headers=headers).json()
    assert (len(page["items"]), page["total"], page["limit"], page["offset"]) == (2, 3, 2, 0)
    last = client.get(f"{REQUESTS}?limit=2&offset=2", headers=headers).json()
    assert len(last["items"]) == 1


@pytest.mark.parametrize("query", ["limit=51", "limit=0", "offset=-1"])
def test_pagination_bounds(client: TestClient, requester, query: str) -> None:
    assert client.get(f"{REQUESTS}?{query}", headers=auth(requester)).status_code == 422


def test_limit_50_is_allowed(client: TestClient, requester) -> None:
    assert client.get(f"{REQUESTS}?limit=50", headers=auth(requester)).status_code == 200


@pytest.mark.parametrize(
    "query", ["sort=title", "sort=password_hash", "direction=sideways", "status=NOPE"]
)
def test_invalid_sort_and_filter_values(client: TestClient, requester, query: str) -> None:
    assert client.get(f"{REQUESTS}?{query}", headers=auth(requester)).status_code == 422


def test_sort_by_created_at(client: TestClient, requester, make_request) -> None:
    first = make_request(requester)
    second = make_request(requester)
    headers = auth(requester)
    ascending = client.get(f"{REQUESTS}?sort=created_at&direction=asc", headers=headers).json()
    assert [item["id"] for item in ascending["items"]] == [str(first.id), str(second.id)]
    default = client.get(REQUESTS, headers=headers).json()
    assert [item["id"] for item in default["items"]] == [str(second.id), str(first.id)]


def test_sort_by_updated_at(
    client: TestClient, db: Session, requester, agent, make_request
) -> None:
    first = make_request(requester)
    second = make_request(requester)
    first.title = "Touched later"
    db.commit()
    body = client.get(f"{REQUESTS}?sort=updated_at&direction=desc", headers=auth(agent)).json()
    assert [item["id"] for item in body["items"]][:2] == [str(first.id), str(second.id)]


def test_priority_sorts_by_severity_not_alphabetically(
    client: TestClient, requester, make_request
) -> None:
    for priority in (Priority.MEDIUM, Priority.URGENT, Priority.LOW, Priority.HIGH):
        make_request(requester, priority=priority.value)
    body = client.get(f"{REQUESTS}?sort=priority&direction=desc", headers=auth(requester)).json()
    assert [item["priority"] for item in body["items"]] == ["URGENT", "HIGH", "MEDIUM", "LOW"]


def test_filters(client: TestClient, requester, agent, make_request) -> None:
    target = make_request(
        requester,
        status=RequestStatus.TRIAGED.value,
        category=Category.NETWORK.value,
        priority=Priority.HIGH.value,
        assigned_agent_id=agent.id,
    )
    make_request(requester)
    headers = auth(agent)
    for query in (
        "status=TRIAGED",
        "category=NETWORK",
        "priority=HIGH",
        "assigned_to=me",
        f"assigned_to={agent.id}",
    ):
        body = client.get(f"{REQUESTS}?{query}", headers=headers).json()
        assert [item["id"] for item in body["items"]] == [str(target.id)], query
        assert body["total"] == 1

    unassigned = client.get(f"{REQUESTS}?assigned_to=unassigned", headers=headers).json()
    assert unassigned["total"] == 1
    assert unassigned["items"][0]["id"] != str(target.id)


def test_assigned_to_is_staff_only(client: TestClient, requester) -> None:
    response = client.get(f"{REQUESTS}?assigned_to=me", headers=auth(requester))
    assert response.status_code == 403


def test_assigned_to_rejects_garbage(client: TestClient, agent) -> None:
    assert client.get(f"{REQUESTS}?assigned_to=garbage", headers=auth(agent)).status_code == 422


def test_filters_never_widen_requester_scope(
    client: TestClient, requester, other_requester, make_request
) -> None:
    make_request(other_requester, status=RequestStatus.TRIAGED.value)
    body = client.get(f"{REQUESTS}?status=TRIAGED", headers=auth(requester)).json()
    assert body["total"] == 0


# Comments


def test_requester_comments_on_own_request(
    client: TestClient, db: Session, requester, make_request
) -> None:
    request = make_request(requester)
    response = client.post(
        f"{REQUESTS}/{request.id}/comments",
        json={"body": "  Any update?  "},
        headers=auth(requester),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["body"] == "Any update?"
    assert "is_internal" not in body
    assert request.version == 2


def test_requester_cannot_comment_on_other_users_request(
    client: TestClient, requester, other_requester, make_request
) -> None:
    theirs = make_request(other_requester)
    response = client.post(
        f"{REQUESTS}/{theirs.id}/comments", json={"body": "Hello"}, headers=auth(requester)
    )
    assert response.status_code == 404


def test_requester_cannot_post_internal_comment(
    client: TestClient, db: Session, requester, make_request
) -> None:
    request = make_request(requester)
    response = client.post(
        f"{REQUESTS}/{request.id}/comments",
        json={"body": "Sneaky", "is_internal": True},
        headers=auth(requester),
    )
    assert response.status_code == 403
    assert db.scalars(select(RequestComment)).all() == []


def test_internal_comment_probe_does_not_reveal_other_users_request(
    client: TestClient, requester, other_requester, make_request
) -> None:
    theirs = make_request(other_requester)
    missing = "00000000-0000-0000-0000-000000000000"
    body = {"body": "Probe", "is_internal": True}
    existing = client.post(f"{REQUESTS}/{theirs.id}/comments", json=body, headers=auth(requester))
    absent = client.post(f"{REQUESTS}/{missing}/comments", json=body, headers=auth(requester))
    assert existing.status_code == absent.status_code == 403


def test_staff_internal_comment_hidden_from_requester(
    client: TestClient, requester, agent, make_request
) -> None:
    request = make_request(requester)
    created = client.post(
        f"{REQUESTS}/{request.id}/comments",
        json={"body": "Check the logs privately", "is_internal": True},
        headers=auth(agent),
    )
    assert created.status_code == 201
    assert created.json()["is_internal"] is True

    requester_view = client.get(f"{REQUESTS}/{request.id}", headers=auth(requester))
    assert "Check the logs privately" not in requester_view.text
    assert requester_view.json()["comments"] == []
    assert requester_view.json()["events"] == []

    staff_view = client.get(f"{REQUESTS}/{request.id}", headers=auth(agent)).json()
    assert staff_view["comments"][0]["body"] == "Check the logs privately"


@pytest.mark.parametrize(("length", "status"), [(0, 422), (1, 201), (2000, 201), (2001, 422)])
def test_comment_length_bounds(
    client: TestClient, requester, make_request, length: int, status: int
) -> None:
    request = make_request(requester)
    response = client.post(
        f"{REQUESTS}/{request.id}/comments", json={"body": "x" * length}, headers=auth(requester)
    )
    assert response.status_code == status


def test_closed_request_rejects_comments(
    client: TestClient, requester, agent, make_request
) -> None:
    request = make_request(requester, status=RequestStatus.CLOSED.value)
    for user in (requester, agent):
        response = client.post(
            f"{REQUESTS}/{request.id}/comments", json={"body": "Too late"}, headers=auth(user)
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "REQUEST_CLOSED"


def test_comment_audit_never_stores_body(
    client: TestClient, db: Session, requester, make_request
) -> None:
    request = make_request(requester)
    secret_text = "the-comment-body-must-not-be-audited"
    comment = client.post(
        f"{REQUESTS}/{request.id}/comments", json={"body": secret_text}, headers=auth(requester)
    ).json()

    rows = _audit(db, request.id)
    assert [row.action for row in rows] == ["request.comment_added"]
    assert rows[0].safe_metadata == {"comment_id": comment["id"], "is_internal": False}
    assert secret_text not in str(rows[0].safe_metadata)
    assert secret_text not in str([event.details for event in _events(db, request.id)])


# Staff updates: authorization


def test_requester_cannot_patch(client: TestClient, requester, make_request) -> None:
    request = make_request(requester)
    response = client.patch(
        f"{REQUESTS}/{request.id}",
        json={"expected_version": 1, "status": "TRIAGED"},
        headers=auth(requester),
    )
    assert response.status_code == 403
    assert request.status == RequestStatus.NEW


def test_patch_requires_authentication(client: TestClient, requester, make_request) -> None:
    request = make_request(requester)
    response = client.patch(
        f"{REQUESTS}/{request.id}", json={"expected_version": 1, "status": "TRIAGED"}
    )
    assert response.status_code == 401


def test_patch_unknown_request_is_404(client: TestClient, agent) -> None:
    response = client.patch(
        f"{REQUESTS}/00000000-0000-0000-0000-000000000000",
        json={"expected_version": 1, "status": "TRIAGED"},
        headers=auth(agent),
    )
    assert response.status_code == 404


# Staff updates: state machine


def test_transition_table_matches_the_contract() -> None:
    table = {
        (source, target) for source, targets in STAFF_TRANSITIONS.items() for target in targets
    }
    assert table == set(ALLOWED)


@pytest.mark.parametrize(("source", "target"), ALLOWED)
def test_allowed_transition_succeeds(
    client: TestClient,
    db: Session,
    requester,
    agent,
    make_request,
    source: RequestStatus,
    target: RequestStatus,
) -> None:
    request = make_request(requester, status=source.value)
    response = client.patch(
        f"{REQUESTS}/{request.id}",
        json={"expected_version": 1, "status": target.value},
        headers=auth(agent),
    )
    assert response.status_code == 200
    assert response.json()["status"] == target.value
    assert response.json()["version"] == 2

    event = _events(db, request.id)[-1]
    assert event.event_type == EventType.STATUS_CHANGED
    assert event.details == {"from": source.value, "to": target.value}
    audit = _audit(db, request.id)[-1]
    assert audit.action == "request.status_changed"
    assert audit.actor_id == agent.id


@pytest.mark.parametrize(("source", "target"), ILLEGAL)
def test_illegal_transition_is_409(
    client: TestClient,
    db: Session,
    requester,
    agent,
    make_request,
    source: RequestStatus,
    target: RequestStatus,
) -> None:
    request = make_request(requester, status=source.value)
    response = client.patch(
        f"{REQUESTS}/{request.id}",
        json={"expected_version": 1, "status": target.value},
        headers=auth(agent),
    )
    assert response.status_code == 409
    expected = "REQUEST_CLOSED" if source == RequestStatus.CLOSED else "INVALID_TRANSITION"
    assert response.json()["error"]["code"] == expected
    assert request.status == source
    assert request.version == 1
    assert _events(db, request.id) == []
    assert _audit(db, request.id) == []


@pytest.mark.parametrize("source", [s for s in RequestStatus if s != RequestStatus.CLOSED])
def test_analyzing_cannot_be_set_manually(
    client: TestClient, requester, admin, make_request, source: RequestStatus
) -> None:
    request = make_request(requester, status=source.value)
    response = client.patch(
        f"{REQUESTS}/{request.id}",
        json={"expected_version": 1, "status": "ANALYZING"},
        headers=auth(admin),
    )
    assert response.status_code == 409


def test_resolved_at_set_kept_and_cleared(
    client: TestClient, requester, agent, make_request
) -> None:
    request = make_request(requester, status=RequestStatus.IN_PROGRESS.value)
    url = f"{REQUESTS}/{request.id}"
    headers = auth(agent)

    resolved = client.patch(
        url, json={"expected_version": 1, "status": "RESOLVED"}, headers=headers
    ).json()
    assert resolved["resolved_at"] is not None

    closed = client.patch(
        url, json={"expected_version": 2, "status": "CLOSED"}, headers=headers
    ).json()
    assert closed["resolved_at"] == resolved["resolved_at"]

    other = make_request(requester, status=RequestStatus.IN_PROGRESS.value)
    other_url = f"{REQUESTS}/{other.id}"
    client.patch(other_url, json={"expected_version": 1, "status": "RESOLVED"}, headers=headers)
    reopened = client.patch(
        other_url, json={"expected_version": 2, "status": "NEEDS_HUMAN_REVIEW"}, headers=headers
    ).json()
    assert reopened["resolved_at"] is None


def test_closed_request_cannot_be_changed_at_all(
    client: TestClient, requester, agent, make_request
) -> None:
    request = make_request(requester, status=RequestStatus.CLOSED.value)
    for change in (
        {"assigned_agent_id": str(agent.id)},
        {"priority": "HIGH", "reason": "Too late"},
        {"status": "NEEDS_HUMAN_REVIEW"},
    ):
        response = client.patch(
            f"{REQUESTS}/{request.id}",
            json={"expected_version": 1, **change},
            headers=auth(agent),
        )
        assert response.status_code == 409


# Staff updates: concurrency


def test_stale_version_is_409(client: TestClient, requester, agent, make_request) -> None:
    request = make_request(requester)
    url = f"{REQUESTS}/{request.id}"
    headers = auth(agent)

    first = client.patch(url, json={"expected_version": 1, "status": "TRIAGED"}, headers=headers)
    assert first.status_code == 200

    stale = client.patch(
        url, json={"expected_version": 1, "priority": "HIGH", "reason": "Urgent"}, headers=headers
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "STALE_UPDATE"
    assert request.priority == Priority.MEDIUM


def test_expected_version_is_required(client: TestClient, requester, agent, make_request) -> None:
    request = make_request(requester)
    response = client.patch(
        f"{REQUESTS}/{request.id}", json={"status": "TRIAGED"}, headers=auth(agent)
    )
    assert response.status_code == 422


def test_comment_makes_earlier_version_stale(
    client: TestClient, requester, agent, make_request
) -> None:
    request = make_request(requester)
    client.post(f"{REQUESTS}/{request.id}/comments", json={"body": "Hi"}, headers=auth(requester))
    response = client.patch(
        f"{REQUESTS}/{request.id}",
        json={"expected_version": 1, "status": "TRIAGED"},
        headers=auth(agent),
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "STALE_UPDATE"


def test_each_change_increments_version_once(
    client: TestClient, requester, agent, make_request
) -> None:
    request = make_request(requester)
    response = client.patch(
        f"{REQUESTS}/{request.id}",
        json={
            "expected_version": 1,
            "assigned_agent_id": str(agent.id),
            "priority": "HIGH",
            "category": "NETWORK",
            "reason": "Affects a whole floor",
            "status": "TRIAGED",
        },
        headers=auth(agent),
    )
    assert response.status_code == 200
    assert response.json()["version"] == 2


def test_rejected_update_changes_nothing(
    client: TestClient, db: Session, requester, agent, make_request
) -> None:
    request = make_request(requester)
    response = client.patch(
        f"{REQUESTS}/{request.id}",
        json={
            "expected_version": 1,
            "priority": "HIGH",
            "reason": "Valid reason",
            "status": "CLOSED",
        },
        headers=auth(agent),
    )
    assert response.status_code == 409
    assert request.priority == Priority.MEDIUM
    assert _events(db, request.id) == []


def test_no_op_update_does_not_bump_version(
    client: TestClient, db: Session, requester, agent, make_request
) -> None:
    request = make_request(requester)
    response = client.patch(
        f"{REQUESTS}/{request.id}",
        json={"expected_version": 1, "priority": "MEDIUM", "reason": "Same value"},
        headers=auth(agent),
    )
    assert response.status_code == 200
    assert response.json()["version"] == 1
    assert _events(db, request.id) == []


# Staff updates: assignment, priority, category


def test_assign_and_unassign(
    client: TestClient, db: Session, requester, agent, admin, make_request
) -> None:
    request = make_request(requester)
    url = f"{REQUESTS}/{request.id}"
    headers = auth(agent)

    assigned = client.patch(
        url, json={"expected_version": 1, "assigned_agent_id": str(admin.id)}, headers=headers
    )
    assert assigned.status_code == 200
    assert assigned.json()["assigned_agent"]["id"] == str(admin.id)

    unassigned = client.patch(
        url, json={"expected_version": 2, "assigned_agent_id": None}, headers=headers
    )
    assert unassigned.status_code == 200
    assert unassigned.json()["assigned_agent"] is None

    events = [event.event_type for event in _events(db, request.id)]
    assert events == [EventType.ASSIGNED, EventType.UNASSIGNED]
    actions = [row.action for row in _audit(db, request.id)]
    assert actions == ["request.assigned", "request.unassigned"]
    assert _audit(db, request.id)[0].safe_metadata == {"from": None, "to": str(admin.id)}


def test_assignee_must_be_active_staff(
    client: TestClient, requester, agent, make_user, make_request
) -> None:
    request = make_request(requester)
    inactive_agent = make_user(Role.AGENT, active=False)
    for assignee in (
        str(requester.id),
        str(inactive_agent.id),
        "00000000-0000-0000-0000-000000000000",
    ):
        response = client.patch(
            f"{REQUESTS}/{request.id}",
            json={"expected_version": 1, "assigned_agent_id": assignee},
            headers=auth(agent),
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "INVALID_ASSIGNEE"


@pytest.mark.parametrize(
    ("field", "value", "event_type", "action", "old"),
    [
        ("priority", "URGENT", EventType.PRIORITY_CHANGED, "request.priority_changed", "MEDIUM"),
        ("category", "NETWORK", EventType.CATEGORY_CHANGED, "request.category_changed", "OTHER"),
    ],
)
def test_priority_and_category_changes_record_old_new_and_reason(
    client: TestClient,
    db: Session,
    requester,
    agent,
    make_request,
    field: str,
    value: str,
    event_type: EventType,
    action: str,
    old: str,
) -> None:
    request = make_request(requester)
    response = client.patch(
        f"{REQUESTS}/{request.id}",
        json={"expected_version": 1, field: value, "reason": "Affects many people"},
        headers=auth(agent),
    )
    assert response.status_code == 200
    assert response.json()[field] == value

    expected = {"from": old, "to": value, "reason": "Affects many people"}
    event = _events(db, request.id)[-1]
    assert (event.event_type, event.details) == (event_type, expected)
    audit = _audit(db, request.id)[-1]
    assert (audit.action, audit.safe_metadata, audit.actor_id) == (action, expected, agent.id)


@pytest.mark.parametrize(
    "payload",
    [
        {"priority": "HIGH"},
        {"category": "NETWORK"},
        {"priority": "HIGH", "reason": "no"},
        {"priority": "HIGH", "reason": "x" * 301},
        {"priority": "HIGH", "reason": "   "},
        {"priority": "NOPE", "reason": "Valid reason"},
        {"priority": None, "reason": "Valid reason"},
        {"status": None},
        {"reason": "Only a reason"},
        {},
        {"title": "Cannot edit this"},
    ],
)
def test_invalid_patch_payloads(
    client: TestClient, requester, agent, make_request, payload: dict
) -> None:
    request = make_request(requester)
    response = client.patch(
        f"{REQUESTS}/{request.id}",
        json={"expected_version": 1, **payload},
        headers=auth(agent),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_requester_timeline_after_staff_changes_is_safe(
    client: TestClient, requester, agent, make_request
) -> None:
    request = make_request(requester)
    client.patch(
        f"{REQUESTS}/{request.id}",
        json={
            "expected_version": 1,
            "assigned_agent_id": str(agent.id),
            "priority": "HIGH",
            "reason": "secret staff reasoning",
            "status": "TRIAGED",
        },
        headers=auth(agent),
    )
    response = client.get(f"{REQUESTS}/{request.id}", headers=auth(requester))
    assert "secret staff reasoning" not in response.text
    assert str(agent.id) not in response.text
    types = {event["event_type"] for event in response.json()["events"]}
    assert types == {"ASSIGNED", "PRIORITY_CHANGED", "STATUS_CHANGED"}


def test_events_and_audit_have_no_write_endpoints(
    client: TestClient, admin, requester, make_request
) -> None:
    request = make_request(requester)
    headers = auth(admin)
    assert client.delete("/api/v1/admin/audit", headers=headers).status_code == 405
    assert client.patch("/api/v1/admin/audit", json={}, headers=headers).status_code == 405
    assert client.delete(f"{REQUESTS}/{request.id}", headers=headers).status_code == 405
