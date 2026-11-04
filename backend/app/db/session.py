"""One pooled engine and the request-scoped session.

Transaction ownership: the service layer commits. Routers do not. `get_db` only closes the
session, which rolls back anything uncommitted, for example after an exception.
"""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

# hide_parameters keeps user text and hashes out of SQLAlchemy error messages and logs.
engine = create_engine(
    get_settings().database_url,
    pool_pre_ping=True,
    hide_parameters=True,
    connect_args={"connect_timeout": 5},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
