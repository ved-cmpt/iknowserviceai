# Development image. The production image is deploy/Dockerfile (ADR-044).
FROM python:3.15.0-slim@sha256:f5b92f2a669a4c347044f29367f31983280b648250ca94dea66f98c53bc87e58

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    PATH="/opt/venv/bin:$PATH"

RUN pip install --no-cache-dir "uv==0.13.7"

WORKDIR /app

# The virtualenv lives outside the bind-mounted source so the host cannot shadow it.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-cache

COPY . .

RUN useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app /opt/venv
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--no-access-log"]
