from fastapi.testclient import TestClient

from tests.conftest import auth

KNOWLEDGE = "/api/v1/admin/knowledge"
AUDIT = "/api/v1/admin/audit"
ARTICLE = {"body_markdown": "Body text", "category": "NETWORK", "tags": []}


def _create(client: TestClient, admin, slug: str, title: str) -> None:
    response = client.post(
        KNOWLEDGE, json={**ARTICLE, "slug": slug, "title": title}, headers=auth(admin)
    )
    assert response.status_code == 201


def test_admin_knowledge_search_matches_title_or_slug_in_any_status(
    client: TestClient, admin
) -> None:
    _create(client, admin, "vpn-guide", "Remote access help")
    _create(client, admin, "printer-guide", "Fixing a VPN-free printer")
    _create(client, admin, "audio-guide", "No sound")

    body = client.get(KNOWLEDGE, params={"q": "vpn"}, headers=auth(admin)).json()
    assert {item["slug"] for item in body["items"]} == {"vpn-guide", "printer-guide"}
    assert body["total"] == 2
    assert {item["status"] for item in body["items"]} == {"DRAFT"}


def test_admin_knowledge_search_treats_like_wildcards_as_text(client: TestClient, admin) -> None:
    _create(client, admin, "percent-guide", "100% uptime")
    _create(client, admin, "plain-guide", "Plain title")

    for term, expected in (("%", {"percent-guide"}), ("_", set())):
        body = client.get(KNOWLEDGE, params={"q": term}, headers=auth(admin)).json()
        assert {item["slug"] for item in body["items"]} == expected


def test_admin_knowledge_blank_search_lists_everything(client: TestClient, admin) -> None:
    _create(client, admin, "one-guide", "One")
    body = client.get(KNOWLEDGE, params={"q": "   "}, headers=auth(admin)).json()
    assert body["total"] == 1


def test_admin_knowledge_search_is_bounded_and_admin_only(client: TestClient, admin, agent) -> None:
    long_query = {"q": "x" * 201}
    assert client.get(KNOWLEDGE, params=long_query, headers=auth(admin)).status_code == 422
    assert client.get(KNOWLEDGE, params={"q": "a\x00b"}, headers=auth(admin)).status_code == 422
    assert client.get(KNOWLEDGE, params={"q": "x"}, headers=auth(agent)).status_code == 403


def test_audit_rows_name_their_actor(client: TestClient, admin) -> None:
    _create(client, admin, "named-guide", "Named")
    items = client.get(AUDIT, headers=auth(admin)).json()["items"]
    row = next(item for item in items if item["action"] == "knowledge.created")
    assert row["actor_id"] == str(admin.id)
    assert row["actor_name"] == admin.display_name


def test_audit_row_without_an_actor_is_still_listed(client: TestClient, admin) -> None:
    client.post("/api/v1/auth/login", json={"email": "nobody@example.test", "password": "x"})
    items = client.get(AUDIT, headers=auth(admin)).json()["items"]
    row = next(item for item in items if item["action"] == "auth.login_failure")
    assert row["actor_id"] is None
    assert row["actor_name"] is None


def test_audit_filters_by_action_and_entity_type_with_a_matching_total(
    client: TestClient, admin, requester, make_request
) -> None:
    _create(client, admin, "first-guide", "First")
    _create(client, admin, "second-guide", "Second")
    client.post(
        "/api/v1/requests",
        json={"title": "A title", "description": "A long enough description"},
        headers=auth(requester),
    )
    headers = auth(admin)

    by_action = client.get(AUDIT, params={"action": "knowledge.created"}, headers=headers).json()
    assert by_action["total"] == 2
    assert {item["action"] for item in by_action["items"]} == {"knowledge.created"}

    by_entity = client.get(AUDIT, params={"entity_type": "service_request"}, headers=headers).json()
    assert by_entity["total"] == 1
    assert by_entity["items"][0]["action"] == "request.created"

    assert client.get(AUDIT, params={"action": "no.such"}, headers=headers).json()["total"] == 0


def test_audit_filters_are_bounded(client: TestClient, admin) -> None:
    headers = auth(admin)
    assert client.get(AUDIT, params={"action": "x" * 101}, headers=headers).status_code == 422
    assert client.get(AUDIT, params={"entity_type": "a\x00"}, headers=headers).status_code == 422
