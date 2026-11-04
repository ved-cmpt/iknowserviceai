"""Readiness: is the database reachable, and is its schema at the Alembic head?"""

import logging
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


def alembic_config() -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(ALEMBIC_INI.parent / "alembic"))
    return config


def head_revision() -> str | None:
    return ScriptDirectory.from_config(alembic_config()).get_current_head()


def check_readiness(db: Session) -> tuple[bool, dict[str, str]]:
    """Return (ready, safe details). Details never contain connection information."""
    try:
        db.execute(text("SELECT 1"))
        current = MigrationContext.configure(db.connection()).get_current_revision()
    except SQLAlchemyError:
        logger.warning("readiness_database_unavailable")
        return False, {"database": "unavailable", "migrations": "unknown"}

    at_head = current == head_revision()
    return at_head, {"database": "ok", "migrations": "at_head" if at_head else "behind_head"}
