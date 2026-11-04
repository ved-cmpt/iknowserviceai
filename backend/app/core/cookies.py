"""The refresh-token cookie. Only one path sees it, and JavaScript never can."""

from http.cookies import SimpleCookie

from app.core.config import get_settings

REFRESH_COOKIE_NAME = "iks_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth"


def _header(value: str, max_age: int) -> str:
    cookie: SimpleCookie = SimpleCookie()
    cookie[REFRESH_COOKIE_NAME] = value
    morsel = cookie[REFRESH_COOKIE_NAME]
    morsel["path"] = REFRESH_COOKIE_PATH
    morsel["max-age"] = max_age
    morsel["httponly"] = True
    morsel["samesite"] = "Strict"
    morsel["secure"] = get_settings().is_production
    return morsel.OutputString()


def refresh_cookie_header(token: str, max_age: int) -> str:
    return _header(token, max_age)


def clear_refresh_cookie_header() -> str:
    return _header("", 0)
