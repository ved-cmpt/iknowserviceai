# One production container: the built SPA and the API on the same origin (ADR-044).
# Build from the repository root: docker build -f deploy/Dockerfile -t iknowserviceai .
FROM node:26.13.0-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39 AS frontend

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ENV VITE_API_BASE_URL=/api/v1
RUN npm run build


FROM python:3.12.16-slim@sha256:b18b261e1b4974b4f321451ad5251ded85abb22c2b8b262da527dda1d031ab30 AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    PATH="/opt/venv/bin:$PATH" \
    APP_ENV=production \
    STATIC_DIR=/app/static

WORKDIR /app

# Only locked runtime dependencies. uv is removed once it has done its job.
COPY backend/pyproject.toml backend/uv.lock ./
RUN pip install --no-cache-dir "uv==0.13.7" \
    && uv sync --frozen --no-dev --no-install-project --no-cache \
    && pip uninstall --yes uv

COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./alembic.ini
COPY --from=frontend /build/dist ./static

RUN useradd --uid 1000 --no-create-home --shell /usr/sbin/nologin appuser
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/healthz', timeout=3)"]

# One process, because the rate limiter lives in memory (ADR-030). `exec` lets signals reach uvicorn.
# Client addresses come from TRUSTED_PROXY_HOPS, so uvicorn's own proxy handling stays off.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --no-access-log --no-proxy-headers"]
