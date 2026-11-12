from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import Settings, get_settings
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging
from app.core.middleware import (
    REQUEST_ID_HEADER,
    CompressTextMiddleware,
    DemoResetMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
    UnhandledErrorMiddleware,
)
from app.core.spa import register_spa
from app.routers import admin, auth, config, health, knowledge, requests

API_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    docs_enabled = not settings.is_production
    app = FastAPI(
        title="IknowServiceAI API",
        version="0.1.0",
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )

    # The last middleware added is the outermost. Compression is innermost, so every header the
    # others add, and every error they produce, still applies to the compressed response.
    app.add_middleware(CompressTextMiddleware)
    if settings.demo_mode:
        app.add_middleware(DemoResetMiddleware, settings=settings)
    app.add_middleware(UnhandledErrorMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", REQUEST_ID_HEADER],
        expose_headers=[REQUEST_ID_HEADER, "Retry-After"],
    )
    app.add_middleware(RequestContextMiddleware)
    if settings.is_production:
        app.add_middleware(SecurityHeadersMiddleware, hsts=settings.hsts_enabled)

    register_error_handlers(app)

    # Health lives at the root for infrastructure and under the API prefix for the frontend.
    app.include_router(health.router)
    app.include_router(health.router, prefix=API_PREFIX)
    app.include_router(auth.router, prefix=API_PREFIX)
    app.include_router(config.router, prefix=API_PREFIX)
    app.include_router(requests.router, prefix=API_PREFIX)
    app.include_router(admin.router, prefix=API_PREFIX)
    app.include_router(knowledge.router, prefix=API_PREFIX)
    app.include_router(knowledge.admin_router, prefix=API_PREFIX)
    if settings.static_dir:
        register_spa(app, settings.static_dir)
    return app


app = create_app()
