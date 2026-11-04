"""enforce append-only audit_logs and request_events in the database

Row triggers do not fire for TRUNCATE, so the demo reset keeps working. Deleting a service request
that has events is now refused, because the cascade would delete history (ADR-025).

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ("audit_logs", "request_events")


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION reject_append_only_change() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION '% on % is not allowed: the table is append-only',
                TG_OP, TG_TABLE_NAME
                USING ERRCODE = 'restrict_violation';
        END;
        $$
        """
    )
    for table in TABLES:
        op.execute(
            f"""
            CREATE TRIGGER {table}_append_only
            BEFORE UPDATE OR DELETE ON {table}
            FOR EACH ROW EXECUTE FUNCTION reject_append_only_change()
            """
        )


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"DROP TRIGGER {table}_append_only ON {table}")
    op.execute("DROP FUNCTION reject_append_only_change()")
