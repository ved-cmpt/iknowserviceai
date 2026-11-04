from collections.abc import Callable
from datetime import timedelta

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import AuditLog, User
from tests.conftest import TEST_PASSWORD, auth

LOGIN = "/api/v1/auth/login"
ME = "/api/v1/auth/me"


def test_valid_login(client: TestClient, requester: User) -> None:
    response = client.post(LOGIN, json={"email": requester.email, "password": TEST_PASSWORD})
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == get_settings().access_token_minutes * 60
    assert body["user"] == {
        "id": str(requester.id),
        "email": requester.email,
        "display_name": requester.display_name,
        "role": "USER",
    }

    me = client.get(ME, headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["id"] == str(requester.id)


def test_login_email_is_case_insensitive(client: TestClient, requester: User) -> None:
    response = client.post(
        LOGIN, json={"email": requester.email.upper(), "password": TEST_PASSWORD}
    )
    assert response.status_code == 200


def test_login_failures_are_indistinguishable(
    client: TestClient, requester: User, make_user: Callable[..., User]
) -> None:
    inactive = make_user(active=False)
    wrong_password = client.post(LOGIN, json={"email": requester.email, "password": "wrong"})
    unknown_email = client.post(LOGIN, json={"email": "nobody@example.test", "password": "wrong"})
    inactive_user = client.post(LOGIN, json={"email": inactive.email, "password": TEST_PASSWORD})

    for response in (wrong_password, unknown_email, inactive_user):
        assert response.status_code == 401
        assert response.headers["WWW-Authenticate"] == "Bearer"
        assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"
        assert response.json()["error"]["message"] == "Incorrect email or password"


def test_login_audits_success_and_failure_without_secrets(
    client: TestClient, requester: User, db: Session
) -> None:
    client.post(LOGIN, json={"email": requester.email, "password": TEST_PASSWORD})
    client.post(LOGIN, json={"email": requester.email, "password": "my-wrong-password"})
    client.post(LOGIN, json={"email": "nobody@example.test", "password": "x"})

    rows = db.scalars(select(AuditLog).where(AuditLog.entity_type == "auth")).all()
    actions = [row.action for row in rows]
    assert actions.count("auth.login_success") == 1
    assert actions.count("auth.login_failure") == 2
    serialized = str([row.safe_metadata for row in rows])
    assert "my-wrong-password" not in serialized
    assert "nobody@example.test" not in serialized


def test_login_rehashes_outdated_password_hash(
    client: TestClient, make_user: Callable[..., User], monkeypatch
) -> None:
    user = make_user(password_hash=hash_password(TEST_PASSWORD))
    old_hash = user.password_hash
    monkeypatch.setattr("app.services.auth.password_needs_rehash", lambda _: True)

    assert (
        client.post(LOGIN, json={"email": user.email, "password": TEST_PASSWORD}).status_code == 200
    )
    assert user.password_hash != old_hash
    assert verify_password(user.password_hash, TEST_PASSWORD)


def test_login_validation_error_does_not_echo_password(client: TestClient) -> None:
    response = client.post(
        LOGIN, json={"email": "a@example.test", "password": "secret\x00value", "extra": 1}
    )
    assert response.status_code == 422
    assert "secret" not in response.text


def test_missing_token(client: TestClient) -> None:
    response = client.get(ME)
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_malformed_token(client: TestClient) -> None:
    response = client.get(ME, headers={"Authorization": "Bearer not-a-jwt"})
    assert response.status_code == 401


def test_tampered_token(client: TestClient, requester: User) -> None:
    token = create_access_token(requester.id)
    forged = jwt.encode(
        jwt.decode(token, options={"verify_signature": False}),
        "a-different-secret-that-is-long-enough-to-sign",
        algorithm="HS256",
    )
    assert client.get(ME, headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_alg_none_token_rejected(client: TestClient, requester: User) -> None:
    token = create_access_token(requester.id)
    claims = jwt.decode(token, options={"verify_signature": False})
    unsigned = jwt.encode(claims, key=None, algorithm="none")
    assert client.get(ME, headers={"Authorization": f"Bearer {unsigned}"}).status_code == 401


def test_expired_token(client: TestClient, requester: User) -> None:
    token = create_access_token(requester.id, expires_in=timedelta(seconds=-1))
    assert client.get(ME, headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_wrong_token_type_rejected(client: TestClient, requester: User) -> None:
    token = create_access_token(requester.id)
    claims = jwt.decode(token, options={"verify_signature": False})
    claims["type"] = "refresh"
    other = jwt.encode(claims, get_settings().jwt_secret, algorithm="HS256")
    assert client.get(ME, headers={"Authorization": f"Bearer {other}"}).status_code == 401


def test_deactivated_user_token_rejected_immediately(
    client: TestClient, requester: User, db: Session
) -> None:
    headers = auth(requester)
    assert client.get(ME, headers=headers).status_code == 200
    requester.active = False
    db.commit()
    assert client.get(ME, headers=headers).status_code == 401


def test_role_is_loaded_from_database(client: TestClient, requester: User, db: Session) -> None:
    headers = auth(requester)
    assert client.get("/api/v1/admin/audit", headers=headers).status_code == 403
    requester.role = "ADMIN"
    db.commit()
    assert client.get("/api/v1/admin/audit", headers=headers).status_code == 200


def test_audit_requires_admin(
    client: TestClient, requester: User, agent: User, admin: User
) -> None:
    assert client.get("/api/v1/admin/audit").status_code == 401
    assert client.get("/api/v1/admin/audit", headers=auth(requester)).status_code == 403
    assert client.get("/api/v1/admin/audit", headers=auth(agent)).status_code == 403
    response = client.get("/api/v1/admin/audit", headers=auth(admin))
    assert response.status_code == 200
    assert set(response.json()) == {"items", "total", "limit", "offset"}


def test_audit_pagination_cap(client: TestClient, admin: User) -> None:
    assert client.get("/api/v1/admin/audit?limit=51", headers=auth(admin)).status_code == 422


def test_password_hash_never_in_auth_responses(client: TestClient, requester: User) -> None:
    login = client.post(LOGIN, json={"email": requester.email, "password": TEST_PASSWORD})
    me = client.get(ME, headers=auth(requester))
    for response in (login, me):
        assert "password" not in response.text
        assert "argon2" not in response.text
