"""Payload additions behind small UX fixes: attempts, assignee names and audit labels."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.scripts.seed_demo import seed_demo
from app.services.ai.base import ProviderTimeout
from tests.ai_fakes import FakeProvider, use_provider
from tests.conftest import auth

REQUESTS = "/api/v1/requests"


def test_requester_detail_shows_attempts_before_any_analysis(
    client: TestClient, make_request, requester
) -> None:
    request = make_request(requester)
    body = client.get(f"{REQUESTS}/{request.id}", headers=auth(requester)).json()
    assert body["attempts_remaining"] == 3
    assert body["last_analysis_failed"] is False


def test_requester_detail_shows_a_failed_analysis_on_reload(
    client: TestClient, make_request, requester
) -> None:
    request = make_request(requester)
    use_provider(FakeProvider(error=ProviderTimeout()))
    assert (
        client.post(f"{REQUESTS}/{request.id}/analyze", headers=auth(requester)).status_code == 503
    )

    body = client.get(f"{REQUESTS}/{request.id}", headers=auth(requester)).json()
    assert body["status"] == "NEW"
    assert body["attempts_remaining"] == 2
    assert body["last_analysis_failed"] is True
    assert "error_code" not in body


def test_a_later_success_clears_the_failed_flag(
    client: TestClient, db: Session, make_request, requester
) -> None:
    seed_demo(db, "test-demo-password")
    request = make_request(requester, title="Wi-Fi down", description="The wifi network is down.")
    use_provider(FakeProvider(error=ProviderTimeout()))
    client.post(f"{REQUESTS}/{request.id}/analyze", headers=auth(requester))
    use_provider(FakeProvider())
    client.post(f"{REQUESTS}/{request.id}/analyze", headers=auth(requester))

    body = client.get(f"{REQUESTS}/{request.id}", headers=auth(requester)).json()
    assert body["last_analysis_failed"] is False
    assert body["attempts_remaining"] == 1


def test_staff_list_includes_the_assignee_name(
    client: TestClient, make_request, requester, agent
) -> None:
    make_request(requester, assigned_agent_id=agent.id)
    make_request(requester)
    items = client.get(REQUESTS, headers=auth(agent)).json()["items"]
    assert {item["assigned_agent_name"] for item in items} == {agent.display_name, None}


def test_requester_list_has_no_assignee_name(
    client: TestClient, make_request, requester, agent
) -> None:
    make_request(requester, assigned_agent_id=agent.id)
    items = client.get(REQUESTS, headers=auth(requester)).json()["items"]
    assert "assigned_agent_name" not in items[0]


def test_audit_entries_name_the_entity_and_the_assignee(
    client: TestClient, make_request, requester, agent, admin
) -> None:
    request = make_request(requester, title="A findable title")
    client.patch(
        f"{REQUESTS}/{request.id}",
        json={"expected_version": request.version, "assigned_agent_id": str(agent.id)},
        headers=auth(agent),
    )
    items = client.get(
        "/api/v1/admin/audit", params={"action": "request.assigned"}, headers=auth(admin)
    ).json()["items"]
    assert items[0]["entity_name"] == "A findable title"
    assert items[0]["names"] == {str(agent.id): agent.display_name}


def test_audit_entries_without_an_entity_have_no_name(client: TestClient, requester, admin) -> None:
    client.post("/api/v1/auth/login", json={"email": "nobody@example.test", "password": "x"})
    items = client.get(
        "/api/v1/admin/audit", params={"action": "auth.login_failure"}, headers=auth(admin)
    ).json()["items"]
    assert items[0]["entity_name"] is None
    assert items[0]["names"] == {}
