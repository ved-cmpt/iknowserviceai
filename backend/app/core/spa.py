"""Serves the built frontend from the API's own origin (ADR-044)."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

from app.core.errors import not_found

_IMMUTABLE = "public, max-age=31536000, immutable"
_REVALIDATE = "no-cache"
_NOT_SPA_PREFIXES = ("api/", "assets/")


def register_spa(app: FastAPI, static_dir: str) -> None:
    """Add a catch-all route. Register it last, so every API route matches first."""
    root = Path(static_dir).resolve()
    index = root / "index.html"
    if not index.is_file():
        raise RuntimeError(f"STATIC_DIR has no index.html: {root}")

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def serve_spa(full_path: str) -> FileResponse:
        try:
            candidate = (root / full_path).resolve()
            is_file = candidate.is_relative_to(root) and candidate.is_file()
        except (OSError, ValueError):  # For example a NUL character in the path.
            is_file = False

        if is_file and candidate != index:
            # Vite hashes everything under assets/, so those names change with their content.
            hashed = full_path.startswith("assets/")
            return FileResponse(
                candidate, headers={"Cache-Control": _IMMUTABLE if hashed else _REVALIDATE}
            )
        # Unknown API paths and missing files are real 404s. A dotted name is a missing file.
        if full_path.startswith(_NOT_SPA_PREFIXES) or "." in full_path.rsplit("/", 1)[-1]:
            raise not_found()
        return FileResponse(index, headers={"Cache-Control": _REVALIDATE})
