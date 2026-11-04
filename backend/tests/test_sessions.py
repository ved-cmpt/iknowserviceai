"""Rotating refresh tokens in an HttpOnly cookie, and the production cookie flags."""

import logging
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core import cookies
from app.core.config import Settings
from app.core.cookies import REFRESH_COOKIE_NAME
from app.core.rate_limit import client_ip, refresh_limiter
from app.db.models import AuditLog, RefreshToken
from tests.conftest import TEST_PASSWORD

LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
LOGOUT = "/api/v1/auth/logout"
CSRF = {"X-Requested-With": "iknowserviceai"}


def _login(client: TestClient, user) -> str:
    response = client.post(LOGIN, json={"email": user.email, "password": TEST_PASSWORD})
    assert response.status_code == 200
    return _cookie_value(response)


def _cookie_value(response) -> str:
    header = response.headers["set-cookie"]
    return header.split(";", 1)[0].split("=", 1)[1].strip('"')


def _refresh(client: TestClient, token: str | None, headers=CSRF):
    # The path scoping is checked separately. Sending the cookie by hand keeps these tests exact.
    client.cookies.clear()
    cookie = {"Cookie": f"{REFRESH_COOKIE_NAME}={token}"} if token else {}
    return client.post(REFRESH, headers={**headers, **cookie})


def _family_rows(db: Session, token_owner) -> list[RefreshToken]:
    db.expire_all()
    return list(db.scalars(select(RefreshToken).where(RefreshToken.user_id == token_owner.id)))


def _audit_count(db: Session, action: str) -> int:
    return db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == action))


def test_login_sets_a_scoped_http_only_cookie(client: TestClient, requester) -> None:
    response = client.post(LOGIN, json={"email": requester.email, "password": TEST_PASSWORD})
    header = response.headers["set-cookie"]
    assert header.startswith(f"{REFRESH_COOKIE_NAME}=")
    assert "HttpOnly" in header
    assert "SameSite=Strict" in header
    assert "Path=/api/v1/auth" in header
    assert "Max-Age=" in header
    assert "Secure" not in header  # Outside production, so plain http://localhost works.
    assert response.headers["cache-control"] == "no-store"
    assert _cookie_value(response) not in response.text


def test_only_a_hash_is_stored(client: TestClient, db: Session, requester) -> None:
    token = _login(client, requester)
    rows = _family_rows(db, requester)
    assert len(rows) == 1
    assert rows[0].token_hash != token
    assert token not in rows[0].token_hash
    assert len(rows[0].token_hash) == 64


def test_refresh_rotates_and_returns_a_working_access_token(client: TestClient, requester) -> None:
    token = _login(client, requester)
    response = _refresh(client, token)
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["id"] == str(requester.id)
    new_token = _cookie_value(response)
    assert new_token != token
    client.cookies.clear()
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert _refresh(client, new_token).status_code == 200


def test_rotation_keeps_the_original_expiry(client: TestClient, db: Session, requester) -> None:
    token = _login(client, requester)
    original = _family_rows(db, requester)[0].expires_at
    _refresh(client, token)
    rows = _family_rows(db, requester)
    assert len(rows) == 2
    assert {row.expires_at for row in rows} == {original}
    assert len({row.family_id for row in rows}) == 1


def test_reuse_of_a_rotated_token_revokes_the_whole_family(
    client: TestClient, db: Session, requester
) -> None:
    first = _login(client, requester)
    second = _cookie_value(_refresh(client, first))

    reused = _refresh(client, first)
    assert reused.status_code == 401
    assert reused.json()["error"]["code"] == "UNAUTHORIZED"
    assert 'iks_refresh=""' in reused.headers["set-cookie"]
    assert "Max-Age=0" in reused.headers["set-cookie"]
    assert all(row.revoked_at is not None for row in _family_rows(db, requester))
    assert _audit_count(db, "auth.refresh_reuse_detected") == 1

    # The newest token is dead too, and the repeat does not add another audit row.
    assert _refresh(client, second).status_code == 401
    assert _audit_count(db, "auth.refresh_reuse_detected") == 1


def test_reuse_does_not_touch_another_sign_in(client: TestClient, requester) -> None:
    first = _login(client, requester)
    other = _login(client, requester)
    _refresh(client, first)
    assert _refresh(client, first).status_code == 401
    assert _refresh(client, other).status_code == 200


def test_logout_revokes_and_clears_the_cookie(client: TestClient, db: Session, requester) -> None:
    token = _login(client, requester)
    client.cookies.clear()
    response = client.post(LOGOUT, headers={**CSRF, "Cookie": f"{REFRESH_COOKIE_NAME}={token}"})
    assert response.status_code == 204
    assert "Max-Age=0" in response.headers["set-cookie"]
    assert _audit_count(db, "auth.logout") == 1
    assert _refresh(client, token).status_code == 401


def test_logout_revokes_tokens_from_earlier_rotations_too(
    client: TestClient, db: Session, requester
) -> None:
    first = _login(client, requester)
    second = _cookie_value(_refresh(client, first))
    client.cookies.clear()
    client.post(LOGOUT, headers={**CSRF, "Cookie": f"{REFRESH_COOKIE_NAME}={second}"})
    assert all(row.revoked_at is not None for row in _family_rows(db, requester))


def test_logout_without_a_cookie_is_harmless(client: TestClient) -> None:
    client.cookies.clear()
    assert client.post(LOGOUT, headers=CSRF).status_code == 204


def test_expired_token_is_refused(client: TestClient, db: Session, requester) -> None:
    token = _login(client, requester)
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == requester.id)
        .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
    )
    db.commit()
    response = _refresh(client, token)
    assert response.status_code == 401
    assert "Max-Age=0" in response.headers["set-cookie"]


def test_signing_in_again_clears_expired_rows(client: TestClient, db: Session, requester) -> None:
    _login(client, requester)
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == requester.id)
        .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
    )
    db.commit()
    _login(client, requester)
    assert len(_family_rows(db, requester)) == 1


def test_deactivated_user_cannot_refresh(client: TestClient, db: Session, requester) -> None:
    token = _login(client, requester)
    requester.active = False
    db.commit()
    assert _refresh(client, token).status_code == 401
    assert all(row.revoked_at is not None for row in _family_rows(db, requester))


@pytest.mark.parametrize("token", [None, "not-a-real-token"])
def test_missing_or_unknown_cookie_is_refused(client: TestClient, token) -> None:
    response = _refresh(client, token)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.parametrize("path", [REFRESH, LOGOUT])
@pytest.mark.parametrize("headers", [{}, {"X-Requested-With": "XMLHttpRequest"}])
def test_missing_csrf_header_is_refused(
    client: TestClient, db: Session, requester, path: str, headers: dict
) -> None:
    token = _login(client, requester)
    client.cookies.clear()
    response = client.post(path, headers={**headers, "Cookie": f"{REFRESH_COOKIE_NAME}={token}"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CSRF_HEADER_REQUIRED"
    assert all(row.revoked_at is None for row in _family_rows(db, requester))


def test_another_origin_cannot_send_the_csrf_header(client: TestClient) -> None:
    response = client.options(
        REFRESH,
        headers={
            "Origin": "https://evil.example.test",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-requested-with",
        },
    )
    assert "access-control-allow-origin" not in response.headers
    allowed = client.options(
        REFRESH,
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-requested-with",
        },
    )
    assert allowed.status_code == 400


def test_refresh_is_rate_limited(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(refresh_limiter, "limit", 2)
    assert _refresh(client, "x").status_code == 401
    assert _refresh(client, "x").status_code == 401
    limited = _refresh(client, "x")
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "RATE_LIMITED"
    assert "Retry-After" in limited.headers


def test_tokens_stay_out_of_the_logs(client: TestClient, requester, caplog) -> None:
    caplog.set_level(logging.DEBUG)
    token = _login(client, requester)
    new_token = _cookie_value(_refresh(client, token))
    assert token not in caplog.text
    assert new_token not in caplog.text


# Production cookie flags


def _production_settings(**overrides) -> Settings:
    values = {
        "app_env": "production",
        "database_url": "postgresql+psycopg://x:y@localhost/z",
        "jwt_secret": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8",
        **overrides,
    }
    return Settings(_env_file=None, **values)


def test_cookie_is_secure_in_production(client: TestClient, requester, monkeypatch) -> None:
    monkeypatch.setattr(cookies, "get_settings", _production_settings)
    response = client.post(LOGIN, json={"email": requester.email, "password": TEST_PASSWORD})
    header = response.headers["set-cookie"]
    assert "Secure" in header
    assert "HttpOnly" in header
    assert "SameSite=Strict" in header
    cleared = client.post(LOGOUT, headers=CSRF).headers["set-cookie"]
    assert "Secure" in cleared


# Client address


class _FakeClient:
    host = "10.0.0.9"


class _FakeRequest:
    client = _FakeClient()

    def __init__(self, forwarded: str | None) -> None:
        self.headers = {"x-forwarded-for": forwarded} if forwarded else {}


@pytest.mark.parametrize(
    ("hops", "forwarded", "expected"),
    [
        (0, "1.2.3.4", "10.0.0.9"),  # Off by default: the header is ignored.
        (1, None, "10.0.0.9"),
        (1, "1.2.3.4", "1.2.3.4"),
        (1, "6.6.6.6, 1.2.3.4", "1.2.3.4"),  # A forged left-hand entry has no effect.
        (2, "6.6.6.6, 1.2.3.4, 10.0.0.1", "1.2.3.4"),
        (2, "1.2.3.4", "10.0.0.9"),  # Fewer entries than proxies: trust nothing.
        # The chain measured on Render: client, Cloudflare's edge, Render's proxy (ADR-061).
        (3, "1.2.3.4, 104.16.0.1, 10.0.0.1", "1.2.3.4"),
        (3, "6.6.6.6, 7.7.7.7, 1.2.3.4, 104.16.0.1, 10.0.0.1", "1.2.3.4"),
    ],
)
def test_client_ip_only_trusts_configured_proxies(
    monkeypatch, hops: int, forwarded: str | None, expected: str
) -> None:
    from app.core import rate_limit

    monkeypatch.setattr(
        rate_limit, "get_settings", lambda: _production_settings(trusted_proxy_hops=hops)
    )
    assert client_ip(_FakeRequest(forwarded)) == expected
