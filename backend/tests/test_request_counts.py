from fastapi.testclient import TestClient

from app.db.models.enums import RequestStatus
from tests.conftest import auth

REQUESTS = "/api/v1/requests"
COUNTS = f"{REQUESTS}/counts"


def test_counts_require_authentication(client: TestClient) -> None:
    assert client.get(COUNTS).status_code == 401


def test_counts_list_every_status_with_explicit_zeros(client: TestClient, requester) -> None:
    body = client.get(COUNTS, headers=auth(requester)).json()
    assert body["counts"] == {status.value: 0 for status in RequestStatus}
    assert body["total"] == 0


def test_user_counts_only_their_own_requests(
    client: TestClient, requester, other_requester, make_request
) -> None:
    make_request(requester)
    make_request(other_requester, status=RequestStatus.TRIAGED.value)

    body = client.get(COUNTS, headers=auth(requester)).json()
    assert body["total"] == 1
    assert body["counts"]["NEW"] == 1
    assert body["counts"]["TRIAGED"] == 0


def test_staff_count_everything_unless_asking_for_their_own(
    client: TestClient, requester, agent, make_request
) -> None:
    make_request(requester)
    make_request(requester, status=RequestStatus.TRIAGED.value)
    make_request(agent)

    everything = client.get(COUNTS, headers=auth(agent)).json()
    assert everything["total"] == 3
    assert everything["counts"]["NEW"] == 2
    assert everything["counts"]["TRIAGED"] == 1

    mine = client.get(COUNTS, params={"mine": "true"}, headers=auth(agent)).json()
    assert mine["total"] == 1
    assert mine["counts"]["NEW"] == 1


def test_mine_filter_limits_the_staff_list_to_their_own_requests(
    client: TestClient, requester, agent, make_request
) -> None:
    make_request(requester)
    own = make_request(agent)

    assert client.get(REQUESTS, headers=auth(agent)).json()["total"] == 2
    body = client.get(REQUESTS, params={"mine": "true"}, headers=auth(agent)).json()
    assert [item["id"] for item in body["items"]] == [str(own.id)]
    assert body["total"] == 1


def test_mine_filter_cannot_widen_what_a_user_sees(
    client: TestClient, requester, other_requester, make_request
) -> None:
    own = make_request(requester)
    make_request(other_requester)

    body = client.get(REQUESTS, params={"mine": "false"}, headers=auth(requester)).json()
    assert [item["id"] for item in body["items"]] == [str(own.id)]
