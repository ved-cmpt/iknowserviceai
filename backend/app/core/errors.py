"""The error envelope: {"error": {"code", "message", "request_id"}}."""

from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import request_id_var


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        headers: dict[str, str] | None = None,
        extra: dict[str, object] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.headers = headers
        self.extra = extra  # Added beside "error" in the body, for example `retryable`.


def not_found(message: str = "Resource not found") -> AppError:
    return AppError(404, "NOT_FOUND", message)


def forbidden(message: str = "You do not have permission to do this") -> AppError:
    return AppError(403, "FORBIDDEN", message)


def conflict(code: str, message: str) -> AppError:
    return AppError(409, code, message)


def unprocessable(code: str, message: str) -> AppError:
    return AppError(422, code, message)


def error_response(
    status_code: int,
    code: str,
    message: str,
    headers: dict[str, str] | None = None,
    extra: dict[str, object] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {"code": code, "message": message, "request_id": request_id_var.get()},
            **(extra or {}),
        },
        headers=headers,
    )


def _format_validation_error(exc: RequestValidationError) -> str:
    # Uses location and message only. Pydantic's "input" field could echo a password.
    parts = []
    for error in exc.errors()[:5]:
        location = ".".join(str(part) for part in error["loc"] if part not in ("body", "query"))
        message = error["msg"]
        parts.append(f"{location}: {message}" if location else message)
    return "; ".join(parts) or "Invalid request"


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return error_response(exc.status_code, exc.code, exc.message, exc.headers, exc.extra)

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        phrase = HTTPStatus(exc.status_code).phrase
        code = phrase.upper().replace(" ", "_").replace("-", "_")
        message = exc.detail if isinstance(exc.detail, str) else phrase
        return error_response(exc.status_code, code, message, exc.headers)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return error_response(422, "VALIDATION_ERROR", _format_validation_error(exc))
