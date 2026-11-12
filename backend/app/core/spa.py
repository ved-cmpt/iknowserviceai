"""Serves the built frontend from the API's own origin (ADR-044, ADR-063).

The build has two pages. `index.html` is the public website, at `/`, and makes no API calls.
`app.html` is the app, under `/app`. The paths the app used before it moved also get `app.html`,
whose script then rewrites them to `/app/...` on the client, so old links keep working.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

from app.core.errors import not_found

_IMMUTABLE = "public, max-age=31536000, immutable"
_REVALIDATE = "no-cache"
_NOT_SPA_PREFIXES = ("api/", "assets/")
# First path segments that belong to the app: its own prefix, and where its pages lived in v1.0.
APP_SEGMENTS = frozenset({"app", "login", "dashboard", "requests", "knowledge", "support", "admin"})
_PAGES = ("index.html", "app.html")


def is_app_path(full_path: str) -> bool:
    return full_path.split("/", 1)[0] in APP_SEGMENTS


def register_spa(app: FastAPI, static_dir: str) -> None:
    """Add a catch-all route. Register it last, so every API route matches first."""
    root = Path(static_dir).resolve()
    pages = {name: root / name for name in _PAGES}
    for name, page in pages.items():
        if not page.is_file():
            raise RuntimeError(f"STATIC_DIR has no {name}: {root}")
    website, app_page = pages["index.html"], pages["app.html"]

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def serve_spa(full_path: str) -> FileResponse:
        try:
            candidate = (root / full_path).resolve()
            is_file = candidate.is_relative_to(root) and candidate.is_file()
        except (OSError, ValueError):  # For example a NUL character in the path.
            is_file = False

        if is_file and candidate not in pages.values():
            # Vite hashes everything under assets/, so those names change with their content.
            hashed = full_path.startswith("assets/")
            return FileResponse(
                candidate, headers={"Cache-Control": _IMMUTABLE if hashed else _REVALIDATE}
            )
        # Unknown API paths and missing files are real 404s. A dotted name is a missing file.
        if full_path.startswith(_NOT_SPA_PREFIXES) or "." in full_path.rsplit("/", 1)[-1]:
            raise not_found()
        page = app_page if is_app_path(full_path) else website
        return FileResponse(page, headers={"Cache-Control": _REVALIDATE})
