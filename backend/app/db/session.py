"""The pooled engine, the readiness probe's engine and the request-scoped session.

Transaction ownership: the service layer commits. Routers do not. `get_db` only closes the
session, which rolls back anything uncommitted, for example after an exception.

The pool suits one small instance and a hosted database that suspends when idle, closing its
connections (ADR-052): a small pool, a pre-ping to replace dead connections, and a recycle time
shorter than the idle suspension.
"""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import get_settings

POOL_SIZE = 3
MAX_OVERFLOW = 2
POOL_RECYCLE_SECONDS = 240
CONNECT_TIMEOUT_SECONDS = 10
# Readiness must answer quickly, even when the database is waking up or down.
PROBE_CONNECT_TIMEOUT_SECONDS = 2  # The lowest value the driver honors.
PROBE_STATEMENT_TIMEOUT_MS = 1000

# hide_parameters keeps user text and hashes out of SQLAlchemy error messages and logs.
engine = create_engine(
    get_settings().database_url,
    pool_pre_ping=True,
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
    pool_recycle=POOL_RECYCLE_SECONDS,
    hide_parameters=True,
    connect_args={"connect_timeout": CONNECT_TIMEOUT_SECONDS},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

probe_engine = create_engine(
    get_settings().database_url,
    poolclass=NullPool,
    hide_parameters=True,
    connect_args={
        "connect_timeout": PROBE_CONNECT_TIMEOUT_SECONDS,
        "options": f"-c statement_timeout={PROBE_STATEMENT_TIMEOUT_MS}",
    },
)


def owner_session() -> Session:
    """A session as the owner role, for the rare script that needs more than the app role has."""
    settings = get_settings()
    url = settings.migration_database_url or settings.database_url
    return Session(
        create_engine(
            url, hide_parameters=True, connect_args={"connect_timeout": CONNECT_TIMEOUT_SECONDS}
        ),
        expire_on_commit=False,
    )


def get_db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session


def get_probe_db() -> Iterator[Session]:
    with Session(probe_engine) as session:
        yield session
