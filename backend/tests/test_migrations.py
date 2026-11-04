from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from sqlalchemy import inspect

from app.db.models import Base
from app.db.session import engine
from tests.conftest import migration_config


def test_upgrade_is_a_noop_when_at_head() -> None:
    command.upgrade(migration_config(), "head")


def test_downgrade_then_upgrade() -> None:
    expected = set(Base.metadata.tables)
    command.downgrade(migration_config(), "base")
    assert not expected & set(inspect(engine).get_table_names())
    command.upgrade(migration_config(), "head")
    assert expected <= set(inspect(engine).get_table_names())


def test_models_match_migrations() -> None:
    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    assert diff == []
