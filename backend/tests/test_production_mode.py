"""What changes with APP_ENV=production: headers, docs, demo help, secrets and the served SPA."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.main import create_app
from app.routers import config as config_router
from app.scripts.reset_demo import reset_refusal
from app.scripts.seed_demo import seed_refusal

GOOD_SECRET = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8"
HEADERS = {
    "content-security-policy",
    "x-content-type-options",
    "referrer-policy",
    "x-frame-options",
    "permissions-policy",
}


def _settings(**overrides) -> Settings:
    values = {
        "app_env": "production",
        "database_url": "postgresql+psycopg://x:y@localhost/z",
        "jwt_secret": GOOD_SECRET,
        "cors_allowed_origins": [],
        **overrides,
    }
    return Settings(_env_file=None, **values)


@pytest.fixture
def spa_dir(tmp_path: Path) -> Path:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>the app</html>", encoding="utf-8")
    (tmp_path / "assets" / "main-abc123.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "robots.txt").write_text("User-agent: *", encoding="utf-8")
    (tmp_path.parent / "secret.txt").write_text("private", encoding="utf-8")
    return tmp_path


@pytest.fixture
def production(spa_dir: Path) -> TestClient:
    return TestClient(create_app(_settings(static_dir=str(spa_dir))), raise_server_exceptions=False)


# Security headers


@pytest.mark.parametrize(
    "path", ["/healthz", "/", "/assets/main-abc123.js", "/api/v1/auth/me", "/api/v1/none"]
)
def test_every_response_has_the_security_headers(production: TestClient, path: str) -> None:
    response = production.get(path)
    assert set(response.headers) >= HEADERS
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"


def test_csp_allows_no_inline_script_or_framing(production: TestClient) -> None:
    policy = production.get("/").headers["content-security-policy"]
    assert "default-src 'self'" in policy
    assert "script-src 'self'" in policy
    assert "frame-ancestors 'none'" in policy
    assert "unsafe-inline" not in policy
    assert "unsafe-eval" not in policy


def test_hsts_is_off_by_default_and_can_be_enabled(spa_dir: Path, production: TestClient) -> None:
    assert "strict-transport-security" not in production.get("/healthz").headers
    enabled = TestClient(create_app(_settings(hsts_enabled=True)))
    assert "max-age=" in enabled.get("/healthz").headers["strict-transport-security"]


def test_headers_are_not_sent_outside_production(client: TestClient) -> None:
    assert "content-security-policy" not in client.get("/healthz").headers


# Docs


@pytest.mark.parametrize("path", ["/openapi.json", "/redoc", "/docs"])
def test_api_docs_are_disabled(path: str) -> None:
    assert TestClient(create_app(_settings())).get(path).status_code == 404


def test_docs_path_never_serves_the_docs_with_the_spa(production: TestClient) -> None:
    assert "swagger" not in production.get("/docs").text.lower()
    assert production.get("/openapi.json").status_code == 404


# The SPA


def test_index_is_served_at_the_root_and_must_revalidate(production: TestClient) -> None:
    response = production.get("/")
    assert response.status_code == 200
    assert "the app" in response.text
    assert response.headers["cache-control"] == "no-cache"


@pytest.mark.parametrize("path", ["/dashboard", "/requests/abc", "/admin/knowledge/x/edit"])
def test_client_routes_fall_back_to_index(production: TestClient, path: str) -> None:
    response = production.get(path)
    assert response.status_code == 200
    assert "the app" in response.text
    assert response.headers["cache-control"] == "no-cache"


def test_hashed_assets_are_cached_for_a_long_time(production: TestClient) -> None:
    response = production.get("/assets/main-abc123.js")
    assert response.status_code == 200
    assert "immutable" in response.headers["cache-control"]
    assert "max-age=31536000" in response.headers["cache-control"]


def test_other_files_revalidate(production: TestClient) -> None:
    assert production.get("/robots.txt").headers["cache-control"] == "no-cache"


@pytest.mark.parametrize("path", ["/assets/missing.js", "/missing.png", "/api/v1/no-such-thing"])
def test_missing_files_and_api_paths_are_real_404s(production: TestClient, path: str) -> None:
    response = production.get(path)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_api_routes_win_over_the_spa(production: TestClient) -> None:
    assert production.get("/healthz").json() == {"status": "ok"}
    assert production.get("/api/v1/auth/me").status_code == 401


@pytest.mark.parametrize(
    "path", ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt", "/..%2fsecret.txt"]
)
def test_path_traversal_cannot_leave_the_directory(production: TestClient, path: str) -> None:
    assert "private" not in production.get(path).text


def test_head_works_for_the_spa(production: TestClient) -> None:
    assert production.head("/").status_code == 200


def test_a_wrong_static_dir_fails_at_startup(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="index.html"):
        create_app(_settings(static_dir=str(tmp_path / "missing")))


# Secrets


@pytest.mark.parametrize(
    "secret",
    [
        "short",
        "a" * 40,
        "abcabcabcabcabcabcabcabcabcabcabcabc",
        "replace-with-a-long-random-string-now",
    ],
)
def test_production_refuses_a_weak_jwt_secret(secret: str) -> None:
    with pytest.raises(ValidationError):
        _settings(jwt_secret=secret)


def test_validation_errors_do_not_echo_the_secret() -> None:
    with pytest.raises(ValidationError) as caught:
        _settings(jwt_secret="a-weak-marker-value")
    assert "a-weak-marker-value" not in str(caught.value)


# Demo help


def test_config_shows_demo_help_outside_production(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(
        config_router,
        "get_settings",
        lambda: _settings(app_env="development", demo_password="public-password"),
    )
    body = client.get("/api/v1/config").json()
    assert body["demo_mode"] is True
    assert body["demo_password_hint"] == "public-password"
    # Development shows the sign-in help, but it is not a public demo.
    assert body["demo_banner"] is None


def test_production_hides_demo_help_by_default(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(
        config_router, "get_settings", lambda: _settings(demo_password="public-password")
    )
    assert client.get("/api/v1/config").json() == {
        "demo_mode": False,
        "demo_password_hint": None,
        "demo_banner": None,
        "ai_notice": None,
    }


def test_a_public_demo_can_show_demo_help(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(
        config_router,
        "get_settings",
        lambda: _settings(demo_password="public-password", demo_mode=True),
    )
    body = client.get("/api/v1/config").json()
    assert body["demo_mode"] is True
    assert body["demo_password_hint"] == "public-password"


# Guarded scripts


def test_seed_is_refused_in_production_without_the_flag() -> None:
    assert seed_refusal(_settings(), allow_production=False)
    assert seed_refusal(_settings(), allow_production=True) is None
    assert seed_refusal(_settings(app_env="development"), allow_production=False) is None


def test_reset_is_refused_in_production_without_the_flag() -> None:
    settings = _settings(allow_demo_reset=True)
    assert reset_refusal(settings, confirmed=True, allow_production=False)
    assert reset_refusal(settings, confirmed=True, allow_production=True) is None
